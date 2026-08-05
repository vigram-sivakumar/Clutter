# ADR-024: Complete the Folder Aggregate Lifecycle — Delete, Rename, Move, and Their Sync Counterparts

**Status:** Proposed — implementation should not begin until this ADR's open product decisions (§ "Decisions requiring product confirmation") are resolved.

## Context

Two independent audits (the architecture audit preceding ADR-023, and the Phase 1 review preceding this ADR) traced the same root observation from different angles: `Folder` is not a complete aggregate. `Page` has a full lifecycle — create, save, archive, restore, delete, move — each with exactly one facade method, one Gate operation kind, and full Sync coverage for the externally-triggered case. `Folder` has only *create* and *open*. Specifically, confirmed by direct code inspection (not inferred from the spec):

- `Vault` has `addFolder`/`moveFolder` but no `removeFolder`. `VaultChangeEvent`'s union has no variant that could represent a folder's removal — the type system cannot express the event even if a method existed.
- `FolderOperations` has exactly two methods, `open()` and `create()`. Its own docstring states plainly that `move()`/`rename()` don't exist because *"no backing Persistence Gate operation kind exists yet for either."*
- `PersistenceOperation`'s union has exactly one folder-scoped kind, `'create-folder'`. There is no delete/move/rename equivalent.
- `VaultSyncService.handleDeleted()`/`handleMoved()` resolve exclusively against `vault.getPageByPath()` — a folder path never matches, so external folder deletion and external folder move/rename are both silent no-ops today. Restart is the only thing that reconciles them, because `VaultBuilder` performs a full rescan.
- `VaultSyncService.handleCreated()` returns immediately for any path not ending in `.md` — external folder *creation* is not handled either, even though `VaultScanner` already treats every directory as a `Folder` regardless of whether it has a `.folder.md` (confirmed: `.folder.md` supplies only optional presentation frontmatter, never identity or existence — `FolderBuilder`'s `IdentityResolver.resolveFolder(frontmatter?.id, path)` already has a path-based identity fallback for the no-frontmatter case, the same pattern `Page` identity uses).

Two things already work and should not be rebuilt:

- **`Vault.moveFolder(folderId, path, parentId)` already exists and already cascades correctly** — it recomputes every descendant folder's and page's path, and refuses if the destination collides. It is the one Vault-level primitive both an app-initiated move/rename and an externally-triggered one can share; it needs new callers, not new logic.
- **`LocalFileSystem.moveFile()` already works for directories**, not just files — it's a thin wrapper over the Tauri fs plugin's generic `rename()`, an OS-level rename that doesn't distinguish files from directories. No Platform interface change is needed for move/rename.

One thing does not already work: **`LocalFileSystem.deleteFile()` calls `remove()` with no `recursive` option**, which will not correctly delete a non-empty directory. Folder deletion cannot be implemented as "call `deleteFile` on the directory path" the way page deletion is `deleteFile` on a single file path.

This ADR's job is the same kind of job ADR-020 and ADR-023 did: name the missing responsibility, decide where it lives, and freeze its contract, following the existing architecture's shape rather than inventing a new one.

## Decision

### 1. Scope: one new Vault mutation, two new Gate operation kinds, full Sync parity — no new subsystem

Per `implementation-rules.md` §6 ("when a new subsystem is justified... not merely because an existing subsystem feels crowded"), this is **not** a new subsystem. It is `Folder` catching up to `Page`'s existing shape, inside the existing five: `Vault` (one new mutation method), Vault Ingest (no change — `FolderBuilder`/`IdentityResolver` already handle the no-`.folder.md` case), Persistence Gate (two new `PersistenceOperation` kinds), Sync (three new/extended handlers), `FolderOperations` (two new facade methods). No new class of subsystem is introduced.

### 2. `Vault.removeFolder(folderId: string): void`

Mirrors `removePage`, one aggregate over, with the one structural difference `moveFolder` already established a precedent for: it must cascade.

**Cascade behavior (mirrors `moveFolder`'s existing descendant-collection pattern exactly):** collect every descendant folder (via the same `VaultPath.isDescendantOf` walk `moveFolder` already does) and every page whose `parentId` is in that folder-id set, remove all of them from their respective id/path maps, then remove the target folder itself. One `refreshProjections()` call if any pages were removed (matching `moveFolder`'s existing `if (pagesInSubtree.length > 0) { this.refreshProjections(); }` guard). One `notify({ type: 'folder-removed', folderId })` at the end — **not** a notification per descendant; downstream consumers already re-render wholesale off a single Vault notification (confirmed: no component diffs event payloads for granular updates), so a single event per removal operation is consistent with `page-removed`'s existing shape and with how `moveFolder` itself emits one `folder-moved` regardless of how many descendants moved.

**New `VaultChangeEvent` variant:** `{ type: 'folder-removed'; folderId: string }`, added to the existing union in `Vault.ts`. This is the one change that makes the missing capability *expressible*, not just implementable — before this, no method could correctly notify a folder's removal even if one were written.

**Invariant:** callable only from `vault/persistence/` and `vault/sync/`, per rule 3, identical restriction to every other mutation method.

### 3. `FolderOperations.delete(folderId: string): Promise<void>`

Mirrors `PageOperations.delete()`'s shape: no existence check of its own (relies on the Gate's dequeue-time guard, same as page delete's "abandoned if missing" behavior), enqueues one Gate operation, done.

```ts
public async delete(folderId: string): Promise<void> {
  await this.coordinator.enqueue(folderId, { kind: 'delete-folder' });
}
```

### 4. `FolderOperations.move(folderId, destinationFolderId)` / `FolderOperations.rename(folderId, name)`

Two facade methods, **one Gate operation kind** — matching the fact that `Vault.moveFolder()` is already one method for both cases (same parentId + new path = rename; new parentId = move). Introducing two Gate kinds for one underlying Vault operation would be the exact fragmentation rule 12 exists to prevent ("no capability may have more than one write path" — here inverted: one write mechanism must not be artificially split into two).

```ts
export type PersistenceOperation =
  | ...
  | { readonly kind: 'delete-folder' }
  | { readonly kind: 'move-folder'; readonly destinationFolderId: string | null; readonly name?: string };
```

`destinationFolderId: string | null` (null = vault root, matching `Folder.parentId`'s own type and every other folder-facing nullable-parent signature already in the codebase). `name?: string` is present only for a rename (new name, same parent) or a combined move+rename; absent, the folder keeps its current name under the new parent.

`FolderOperations.move()` supplies `destinationFolderId` only; `FolderOperations.rename()` supplies the *current* `folderId`'s existing `parentId` as `destinationFolderId` plus the new `name`. Both dispatch through the same `runMoveFolder` at the Gate.

### 5. Gate dispatch: `runDeleteFolder` and `runMoveFolder`

**`runDeleteFolder`** (mirrors `runDelete`, extended for cascade):
1. Resolve the folder from `vault.getFolder(folderId)`; abandon (no-op, matching `runDelete`'s missing-page behavior) if not found.
2. Collect every descendant page and folder the same way `Vault.removeFolder()` will (see §2) — needed here too because disk deletion must happen bottom-up, and the Gate is the only place with `fileSystem` access.
3. Delete every descendant page's file (`fileSystem.deleteFile`, one call per page — reuses the existing single-file primitive, no Platform change).
4. Delete every descendant folder's `.folder.md` (if present) and then the now-empty directory itself, **innermost first** — this is why no recursive-delete Platform capability is needed: by construction, by the time an ancestor directory is deleted, every path still inside it has already been removed.
5. Call `vault.removeFolder(folderId)` — single Vault mutation, single notification, per §2.

**`runMoveFolder`** (mirrors `runMove`'s page-scoped shape, one aggregate over):
1. Resolve the folder; abandon if not found.
2. Resolve the destination path via a new `FolderPathResolver` method (`resolveMovePath`/`resolveRenamePath` — a collision-free path under `destinationFolderId`, reusing `resolveCollisionFreeName`, mirroring `FolderPathResolver.createFolderPath`'s existing shape exactly).
3. `fileSystem.moveFile(currentPath, newPath)` — already directory-safe (§ Context).
4. `vault.moveFolder(folderId, newPath, destinationFolderId)` — the existing, already-correct cascade.

### 6. Sync: `handleDeleted`, `handleMoved`, `handleCreated` all gain a folder branch

Each currently resolves only against `vault.getPageByPath()`. Each gains a **folder-path check first** (a deleted/moved/created path is a folder if it resolves via `vault.getFolderByPath()`, or — for `created` — if the corresponding filesystem entry is a directory rather than ending in `.md`), then dispatches to the folder-shaped handling instead of falling through to the page-shaped handling. The two paths never overlap (a path is either a page's `.md` file or a folder's directory, never both), so this is an `if/else` branch, not a new coordinator or a second queue.

- **`handleDeleted`**: folder branch calls `vault.removeFolder(folder.id)` directly — no disk write (the external deletion already happened), same asymmetry `handleDeleted`'s existing page branch already has (`vault.removePage`, no `fileSystem.deleteFile` call, since sync only reacts).
- **`handleMoved`**: folder branch calls `vault.moveFolder(folder.id, absoluteTo, resolvedParentId)` directly — same reasoning, the cascade Vault already implements handles every descendant.
- **`handleCreated`**: gains an early branch — if the changed path corresponds to a directory (the underlying `VaultFileChange` already distinguishes this, or is inferred by the absence of a trailing `.md` combined with a successful `fileSystem.exists()`-as-directory check, see "Decisions requiring product confirmation" below for the exact signal), build a `Folder` via `FolderBuilder` (mirroring the existing page branch's use of `PageBuilder`) and call `vault.addFolder()`.

No new `VaultSyncCoordinator` behavior — the existing per-path/per-page exclusive-queue mechanism already generalizes to folder paths with zero changes, since it keys on path/id, not on "page-ness."

### 7. What must never own this (per rule 5, mirrored from every prior ADR)

- **`MembershipSelector` (ADR-023) is not touched by this ADR** and must not gain folder-removal logic — it's a pure read-side classification layer over whatever `Vault` currently contains; once `Vault.removeFolder()` correctly removes a folder, `MembershipSelector`'s existing queries automatically stop returning it, with no code change on its side. This is the payoff of ADR-023 having been completed first, as scoped correctly.
- **The Persistence Gate decides *how* the delete/move happens, never *whether*.** Any future business rule ("don't allow deleting Daily Notes' root folder," "warn before deleting a non-empty folder") belongs in `FolderOperations`, per rule 5, exactly like `PageOperations`'s archive/restore validity checks.
- **Sync never originates a write for folders any more than it does for pages** — `handleDeleted`/`handleMoved`'s folder branches only mutate `Vault`, never touch `fileSystem`, matching the existing page branches' asymmetry exactly.

## Decisions requiring product confirmation before implementation

Named explicitly rather than decided unilaterally, per ADR-020/ADR-022's precedent for deferring genuine product calls:

1. **Does app-initiated folder deletion cascade-delete a non-empty folder's contents with no confirmation, matching `Page.delete()`'s existing no-undo/no-confirmation behavior** (per `durability-model.md`, undo/version history is explicitly out of scope today) — or should the UI require an extra confirmation step for a non-empty folder specifically? This ADR's Gate design (§5) implements cascade-delete unconditionally, since that's what's needed for the *external*-deletion case regardless of the app-initiated answer — but whether `FolderOperations.delete()`'s UI entry point requires a confirmation dialog first is a UI/product question this ADR doesn't resolve.
2. **What happens to an open `DocumentSession` for a page that a folder deletion (or an external deletion) just removed out from under it?** `PageOperations.delete()` closes the session before enqueueing (`DocumentRegistry.close()` first). A cascade-delete triggered by a *folder* delete needs the same guarantee for every descendant page with an open session — this ADR's `runDeleteFolder` operates at the Gate/Vault level and has no `DocumentRegistry` reference. The cleanest fix: `FolderOperations.delete()` (the app-initiated path) closes every open descendant session before enqueueing, mirroring `PageOperations.delete()`'s ordering; the *external*-deletion path (`VaultSyncService`) needs the equivalent — closing sessions for any page that just disappeared, which `VaultSyncService` already does today for a single deleted page (implicitly, since `documentRegistry` is available to it) — this needs a small, explicit design decision on exactly where that call happens for the cascade case, not assumed.
3. **The exact signal `handleCreated` uses to recognize "this created path is a directory."** `VaultFileChange`'s `created` variant currently carries only `{ path: string }` — no `isDirectory` flag. Either the Rust watcher needs to add one (a `VaultFileChange` schema change, crossing the Platform/TS boundary — bigger than a pure-TS fix), or the TS side infers it via `fileSystem.readDirectory()`/`exists()` probing at handle-time (works, but adds a filesystem round-trip to every `created` event, including the common page-creation case, unless the probe is skipped for anything ending in `.md`). This ADR recommends the probing approach (no Rust/Platform-contract change) but the tradeoff should be confirmed, not assumed.

## Alternatives Considered

**A — Two separate Gate kinds, `'rename-folder'` and `'move-folder'`.** Rejected: `Vault.moveFolder()` is already one method for both; splitting the Gate kind in two when the Vault-level operation is already unified would be introducing fragmentation the architecture doesn't have today, purely to mirror `PageOperations`'s current split between `move()` (Gate-backed) and `rename()` (not yet implemented at all, per the frozen spec's own §6 note) — a page-side gap this ADR should not import into the folder side just for surface symmetry.

**B — Extend `VaultFileSystem` with a recursive-delete method (`deleteDirectory`).** Considered as the more "obviously correct" fix for the non-empty-directory deletion problem. Rejected in favor of the Gate-level bottom-up cascade (§5) because it avoids a Platform interface change entirely — rule 4's enforcement mechanism ("no subsystem outside Platform touches disk directly") isn't at risk either way, but a smaller, more conservative change is preferred when both are equally correct, per the smallest-correct-change principle. If a future need arises for genuinely atomic directory deletion (a case the bottom-up approach can't provide — a crash mid-cascade could leave a partial deletion), that's a reason to revisit this specific choice later, not now.

**C — Fold folder lifecycle into `PageOperations`/the existing page-shaped Gate kinds, treating a folder as "a page-like thing with children."** Rejected outright: `Folder` and `Page` are already modeled as distinct aggregates throughout the architecture (separate `Vault` maps, separate builders, separate `VaultChangeEvent` variants) — this ADR extends that existing separation, it doesn't blur it.

## Non-Goals

- **Does not implement `Page.rename()`.** Still not implemented, per the frozen spec's own note (`architecture-specification.md` §6) — unrelated to this ADR, not touched.
- **Does not add folder-level undo, trash, or soft-delete.** Matches `Page.delete()`'s existing hard-delete-only behavior, per `durability-model.md`'s explicit current scope.
- **Does not change `MembershipSelector`'s contract** (§7).
- **Does not resolve the three product decisions above** — implementation should not begin until they're answered.

## Consequences

- `Folder` becomes a true first-class aggregate with the same lifecycle shape `Page` has: create, delete, move, rename, all through exactly one facade (`FolderOperations`) and one Gate.
- External folder deletion, rename, move, and creation all reconcile incrementally — no restart required, closing the gap the original audit's Issue 2 identified (generalized from "sync doesn't handle folder deletion" to "sync now has full folder lifecycle parity with pages").
- `architecture-target.md`'s Ownership Diagram and Capability Map both gain rows for folder delete/move/rename, mirroring the existing page rows.
- No existing frozen contract changes shape except the two additive extensions named above (`VaultChangeEvent`'s new variant, `PersistenceOperation`'s two new kinds) — `Vault.moveFolder()`, `LocalFileSystem.moveFile()`, `FolderBuilder`, and `MembershipSelector` are all reused exactly as they already exist.

## Why This Approach Is Preferred

It completes `Folder`'s lifecycle by extending exactly the same shape `Page`'s lifecycle already uses — one facade, one Gate, symmetric Sync handling — reusing two already-correct primitives (`Vault.moveFolder()`'s cascade, `LocalFileSystem.moveFile()`'s directory-safety) rather than rebuilding either, and introducing only the two pieces that were genuinely absent (`Vault.removeFolder()`, the Gate's delete/move-folder operation kinds). It names its open product decisions explicitly instead of resolving them by implementation-time judgment call, the same discipline ADR-020 and ADR-022 both followed for their own deferred questions.
