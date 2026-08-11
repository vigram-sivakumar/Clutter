# ADR-029: Duplicate's Destination Name Is a Provider Decision, Not an Application One

**Status:** Accepted (design frozen; implementation proceeds against this contract; amends ADR-028)

## Context

ADR-028 established Duplicate as a raw filesystem copy reconciled by Sync's existing duplicate-id resolution, but left the *destination path* as something `PagePathResolver.duplicateNotePath`/`FolderPathResolver.duplicateFolderPath` computed in the Application layer, appending a literal `" copy"` suffix. Two problems surfaced:

1. **Correctness:** duplicating an already-duplicated item ("Project copy") produced "Project copy copy" instead of "Project copy 2" — the naming step had no notion of an existing "copy"/"copy N" suffix to increment.
2. **Layering:** more fundamentally, Application (`PageOperations`/`FolderOperations`) is Vault-aware, storage-provider-agnostic code. Owning a "what should a duplicate be named" policy there hardcodes an assumption specific to *today's one storage provider* (local disk) into a layer that's supposed to stay ignorant of storage-provider identity entirely. The vault's storage backend is expected to grow beyond local disk (iCloud, Google Drive, Dropbox, OneDrive); those providers have their own duplicate semantics — Google Drive's `files.copy` API auto-names a copy server-side ("Copy of X") when no name is given; others (Dropbox's `copy_v2`) require an exact destination the same way local disk does. Application code should never need to know which case applies, and should certainly never contain per-provider naming logic (an "if Drive... else if Dropbox... else local-copy-suffix" branch would be exactly the kind of thing this ADR forbids).

Investigation (see chat transcript, not reproduced here) confirmed: no filesystem API on any OS (POSIX `rename()`/`cp`, Win32 `CopyFileEx`, Tauri's `@tauri-apps/plugin-fs` `copyFile`) exposes "copy with an OS-chosen collision-safe name" — that behavior lives in the desktop shell application (Finder/Explorer), not the filesystem layer, and is reachable there only via shell-specific automation (AppleScript, macOS-only, not currently a dependency). So "ask the OS" was never literally available; the real fix is "ask **the storage provider**," which is exactly what `VaultFileSystem` already exists to abstract.

## Decision

### 1. `VaultFileSystem` gains one new, optional primitive

```ts
// vault/providers/VaultFileSystem.ts
duplicate?(sourcePath: string, kind: 'file' | 'directory'): Promise<string>;
```

Creates a copy of the file (provider copies the bytes) or an empty directory (provider creates it) in `sourcePath`'s own parent, at a destination name **the provider chooses** to avoid a collision, and returns the actual resulting path. `kind` is a hint the caller already has for free (a page duplicate vs. a folder duplicate) — supplying it avoids requiring every provider to implement a generic stat/`isDirectory` primitive solely for this one operation.

For a directory, only the top-level entry's name is a provider decision; copying its *contents* is not delegated — recursively duplicating a folder's contents isn't a single primitive on any provider (Drive's copy API doesn't recurse into folders either), so that walk stays generic, provider-agnostic code using the existing `readDirectory`/`readFile`/`writeFile`/`createDirectory` primitives, exactly as before this ADR. Nested paths under a brand-new folder name can never collide with anything, so no naming decision is needed for them.

**Optional**, not required: the many existing test-local `VaultFileSystem` fakes across the test suite (none of which exercise Duplicate) are unaffected — no unrelated test churn from this addition, per implementation-rules.md's "smallest correct change."

### 2. The local-disk provider owns its own fallback naming, once, in Platform

`LocalVaultProvider.duplicate()` (`vault/providers/LocalFileSystem.ts`) and the canonical test double `InMemoryVaultFileSystem.duplicate()` (`vault/testing/InMemoryVaultFileSystem.ts`) both implement this primitive by calling a small shared helper, `resolveLocalDuplicatePath` (`vault/providers/localDuplicateNaming.ts`) — the collision-avoidance "name copy" / "name copy 2" / ... convention, applied once, entirely inside Platform's local-disk implementation. This is **not** the Clutter-naming-algorithm the earlier approach was rejected for: it is `LocalVaultProvider`'s own provider-internal fallback, invisible to and never touched by Application, exactly symmetric to how a future `GoogleDriveVaultProvider.duplicate()` would instead just call Drive's `files.copy` and trust Drive's own naming. Two providers, two independent (and potentially divergent) naming policies, one shared interface — which is precisely what an abstraction boundary is for.

The helper also fixes the "copy of a copy" bug directly: it recognizes an existing `" copy"` or `" copy N"` suffix on the base name and increments the number instead of appending a second `" copy"`, so `Project → Project copy → Project copy 2 → Project copy 3`, matching Finder's own convention, without ever pretending to *be* Finder.

### 3. `VaultEntryDuplicator` and Application no longer construct or inspect a name

`VaultEntryDuplicator.duplicateFile(sourcePath): Promise<string>` and `.duplicateDirectory(sourcePath): Promise<string>` now take only a source path and return whatever path the provider produced — no destination parameter. `PagePathResolver.duplicateNotePath`/`FolderPathResolver.duplicateFolderPath` (Application layer) are deleted outright, not deprecated: there is no longer any Application-level code path that builds a duplicate's name. `PageOperations.duplicate()`/`FolderOperations.duplicate()` call the duplicator, receive back an opaque destination path, and use it only to know *where to look* in the Vault once Sync reconciles it (`waitForPageAtPath`/`waitForFolderAtPath`, unchanged from ADR-028) — never to construct or validate that string's content.

### 4. Everything else from ADR-028 is unchanged

The raw-filesystem-copy-observed-by-the-watcher mechanism, the reuse of `VaultSyncService`'s existing duplicate-id resolution, the "wait for the Vault to reflect it, then select" flow, and the constructor-injection shape (`duplicator` optional on `PageOperations`/`FolderOperations`) all stand as ADR-028 described them. This ADR amends *only* where the destination name comes from.

## Alternatives Considered

- **Shell out to Finder via AppleScript for real OS-delegated naming.** Rejected: macOS-only, adds a new native dependency and Rust command for one feature, and doesn't generalize to the actual future need (other storage providers) — the provider abstraction already generalizes correctly without it.
- **Smarter Application-level naming algorithm** (recognize "copy N" suffixes, but still computed in `PagePathResolver`/`FolderPathResolver`). Rejected per the user's explicit direction: still hardcodes local-disk-specific policy into provider-agnostic Application code, and still wouldn't reflect what a real remote provider's own copy API would actually name the result.

## Consequences

- `VaultFileSystem`'s public interface (frozen spec §1) gains one optional method — a genuine capability the interface previously couldn't express, not a composition of existing primitives, justified per implementation-rules.md rule 6.
- A future non-local provider implements `duplicate()` however fits its own API (delegate to the remote service's own copy-with-naming call, or, if none exists, its own fallback mirroring `resolveLocalDuplicatePath`'s shape) — Application requires no changes either way.
- `VaultEntryDuplicator`'s constructor-injected `fileSystem` must implement `duplicate` for Duplicate to function; since it's optional on the interface, this is a runtime check (clear error) rather than a compile-time one — the same tradeoff already accepted for the optional `duplicator` on `PageOperations`/`FolderOperations` (ADR-028).
