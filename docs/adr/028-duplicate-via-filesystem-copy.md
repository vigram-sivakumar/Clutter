# ADR-028: Duplicate as a Raw Filesystem Copy, Reconciled by Sync's Existing Duplicate-Id Resolution

**Status:** Accepted (design frozen; implementation proceeds against this contract)

## Context

Duplicate needs to exist for both a page and a folder (folder duplication must also duplicate every descendant page/folder). `architecture-specification.md` §6/§7's own "Extension points" sections suggest the default shape: "a new page-level capability (e.g., `duplicate`) is a new method here plus a new `PersistenceOperation` kind in the Gate." That default shape was considered and rejected for this capability specifically, for one reason: a Gate-backed `duplicate` would have to invent its own id-minting and disk-write logic for an entire subtree (recursing into a folder's descendants, generating an id for each, writing each file/`.folder.md`), which would duplicate — as a second implementation — logic that already exists and is already tested: `VaultSyncService.handleCreated`/`handleFolderCreated`'s duplicate-id resolution (`resolveDuplicateId`, `buildDiscoveredEntities`), the exact mechanism that already handles a file or folder copied into the vault from outside the app (e.g. in Finder) and found to collide with an existing id. Per rule 4 ("never duplicate a business rule across files") and rule 6 ("never introduce a new abstraction... without citing which existing one it replaces or which specification gap it closes"), reusing that existing resolution path is preferred over writing a second one inside the Gate.

This does create a real tension with rule 1 ("never write to disk or mutate `Vault` from outside the Persistence Gate or Sync") and with Sync's own stated invariant ("Sync never initiates a write that the app itself didn't already make on disk — it only *reacts*"). Duplicate's raw copy is app-initiated, so it is not Sync reacting; and it does not go through the Gate, so it is not the Gate writing either. This ADR is the deliberate, narrow exception §5 of `implementation-rules.md` requires be named explicitly rather than improvised silently.

## Decision

### 1. Duplicate is a raw `VaultFileSystem` copy, deliberately unsuppressed

`PageOperations.duplicate(pageId)` / `FolderOperations.duplicate(folderId)` compute a collision-free destination path in the same parent (`PagePathResolver.duplicateNotePath`/`FolderPathResolver.duplicateFolderPath`, extending the existing collision-free-naming implementation per rule 4 rather than reimplementing it) and hand it to a new internal collaborator, `VaultEntryDuplicator` (`vault/persistence/VaultEntryDuplicator.ts`), which copies the source file or directory tree verbatim via `VaultFileSystem`'s existing `readFile`/`writeFile`/`createDirectory`/`readDirectory` primitives — no new method added to the `VaultFileSystem` interface, per that interface's own doc comment ("compose these primitives rather than expanding this interface for every feature").

Critically, `VaultEntryDuplicator` is constructed with the **raw** `VaultFileSystem` — the one `LocalVaultProvider` instance from `Application.bootstrap()`, before it is wrapped in `SelfWriteAwareFileSystem` — not the self-write-aware instance every other write path uses. This is the one deliberate exception to "every write goes through the self-write-suppressed wrapper": the copy must be *observed* by the filesystem watcher, exactly as an externally-created file/folder would be, so `VaultSyncService.handleCreated`/`handleFolderCreated` picks it up and runs its existing duplicate-id resolution and frontmatter-repair logic unchanged.

### 2. Neither the Gate nor Sync gains new responsibility

No new `PersistenceOperation` kind is added. `VaultSyncService` is not modified — its existing `created`/directory-`created` handling already covers this case, because a raw copy is indistinguishable from an external one at the point the watcher observes it. This keeps the actual "who assigns fresh ids to a colliding copy" logic in exactly one place, not two.

### 3. `PageOperations`/`FolderOperations` still never call `VaultFileSystem` directly

`VaultEntryDuplicator` is injected into both facades' constructors (optional, defaulting to none in the many existing unit tests that never exercise `duplicate()` — `Application.attachVault()` always supplies a real one), the same "collaborator holds the filesystem reference, the facade never does" shape `PagePersistenceCoordinator`/`MoveService` already establish.

### 4. Selection, not opening

Since a raw copy has no synchronous return value the way a Gate operation does, `duplicate()` subscribes to `Vault` and resolves once the duplicate appears at the computed destination path, then calls `workspace.openPage`/`openFolder` — the same "select the new item" step `PageOperations.create()` already performs. No timeout: the same latency assumption `VaultSyncService`'s reconciliation of an externally-dropped-in folder already relies on (§`handleFolderCreated`'s doc comment) applies here — an OS-level filesystem event is expected to arrive; nothing in the app blocks on it beyond the promise itself.

## Alternatives Considered

- **Gate-backed `duplicate` operation kind, recursing and minting ids itself.** Rejected: reimplements `resolveDuplicateId`/`buildDiscoveredEntities` a second time, for no behavioral benefit — the outcome (a copy with fresh ids) is identical either way, and this path is materially more code across `PagePersistenceCoordinator`'s dispatcher.
- **Route the copy through the ordinary self-write-suppressed `VaultFileSystem`, then manually call `vault.addPage`/`addFolder` after the write.** Rejected per the user's explicit instruction: this makes the app-initiated write a second source of truth for "what got added to the Vault," parallel to and diverging from Sync's own reconciliation, rather than flowing through the one pipeline that already resolves duplicate ids correctly.

## Consequences

- `VaultEntryDuplicator` is a new internal collaborator, but not a new subsystem: it is a narrow write-primitive sibling to `MoveService`/`PagePersistenceCoordinator`, still owned by the existing Persistence-layer folder, per rule 6's "new service/facade... must follow the same shape" guidance interpreted for a collaborator rather than a facade.
- `Application.attachVault()` gained one new, defaulted parameter (`rawFileSystem`) so the raw `VaultFileSystem` instance is reachable without becoming `this.fileSystem` for anything else.
- Duplicate's completion latency is bounded by the real OS filesystem watcher's own latency (the existing ~300ms Rust-side correlation window plus OS event delivery), not by an in-process call — a materially different (and slower) UX shape than every other `PageOperations`/`FolderOperations` method, which is why this ADR calls it out explicitly rather than leaving it to be discovered later as an unexplained divergence.

## Why the chosen approach is preferred

It keeps "who resolves a duplicate id" a single-owner capability (`VaultSyncService`), matches the user-visible mental model this feature was explicitly specified against ("equivalent to duplicating it externally"), and adds the smallest possible new surface — one collaborator, two facade methods, two path-resolver methods — with no changes to the Gate, `Vault`, or `VaultFileSystem`'s public contracts.
