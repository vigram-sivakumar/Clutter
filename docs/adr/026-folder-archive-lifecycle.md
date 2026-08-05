# ADR-026: Folder Archive and Restore

**Status:** Proposed

## Context

ADR-024 completed `Folder`'s delete/rename/move lifecycle but explicitly excluded archive, calling it "a permanent impossibility, not a deferred one" for that ADR's scope, and stating plainly: *"if folder archiving becomes a real product requirement, it needs its own ADR — this one does not silently imply it."* `folderTopBarMenu.config.ts` independently encodes the same exclusion in its own comment.

A request to add folder archive (matching the affordance `Page` already has) is exactly the trigger ADR-024 named. This ADR is that follow-up, written before any implementation, per `implementation-rules.md` §5 ("the specification is internally inconsistent" / "a requested change violates a frozen architectural invariant" are both stop-and-escalate conditions, not judgment calls).

**Why this isn't a one-line addition.** `Page.archive()` isn't a metadata flag — `PagePersistenceCoordinator.runArchive()` (via `MoveService.resolveArchiveDestination`) physically relocates the file into the vault's reserved `Archive/` folder, flattening to `Archive/<filename>`, and records `originalPath`/`originalParentId` so `restore()` can move it back. `restore()` prefers the original parent folder if it still exists, else `Inbox`, else vault root (`MoveService.resolveRestoreDestination`). `ArchiveMetadataReconciler` then keeps this consistent against external changes: entering/leaving `Archive/` on disk never by itself flips `status` — only Sync's explicit repair does, and only in the direction of clearing stale `archived` state when a page is found to have left `Archive/` externally.

`FolderMetadata` already structurally carries the identical fields (`status`, `archivedAt`, `originalPath`, `originalParentId`) — confirmed by direct inspection of `FolderMetadata.ts` — but no business rule, Gate operation, or read-side handling exists anywhere for them. Extending the page mechanism naively (flatten every descendant page into `Archive/` individually) would destroy the folder's internal structure and cause filename collisions; a folder is not "a page with children" (ADR-024 §Alternatives C already rejected blurring the two aggregates for delete, for the same reason).

## Decision

Follow `Page`'s existing archive shape exactly, adapted for the one structural difference `moveFolder`/`removeFolder` already established a precedent for: a folder archive/restore must move a whole directory, not flatten it.

### 1. Scope: no new subsystem, same five touched by ADR-024

`Vault` (two new mutations), Persistence Gate (two new operation kinds), `FolderOperations` (two new facade methods), `MembershipSelector` (one new read-side predicate — see §5), UI (one topbar menu item + reserved-folder guard). No new class of subsystem.

### 2. Archiving relocates the folder as a unit, not per-descendant

`Vault.archiveFolder(folderId)`: reuses `moveFolder`'s existing cascade (recompute every descendant folder/page path under the new location) to relocate the *whole subtree* under `Archive/<folder name>`, preserving internal structure — one `fileSystem.moveFile(folderPath, archiveDestinationPath)` at the Gate (already directory-safe, per ADR-024's Context), not one move per descendant. Only the target folder's own metadata changes (`status: 'archived'`, `archivedAt`, `originalPath`, `originalParentId`); descendant folders/pages get new paths but their own `status`/`archivedAt`/etc. are untouched — mirroring `ArchiveMetadataReconciler`'s existing principle that *location inside `Archive/` never by itself implies archived status*, now applied to folders too. A page that was already individually archived before its containing folder was archived keeps its own `originalParentId` pointing at the (now-relocated) folder id, unchanged — a known edge case, see Non-Goals.

`Vault.restoreFolder(folderId)`: symmetric — moves the subtree back to `originalPath` if the original parent still exists (by id, current path), else the vault's `Inbox`, else root (same fallback order `MoveService.resolveRestoreDestination` already uses for pages), clears the target folder's own archive metadata, leaves descendants' metadata untouched.

Both are single Vault mutations with cascade, reusing exactly the descendant-collection walk `moveFolder`/`removeFolder` already have — no new traversal logic. One notification each (`folder-archived`/`folder-restored`, or reuse `folder-moved` plus a metadata-changed signal — resolved at implementation time, not re-litigated here, same deferral ADR-024 used for its own confirmation-dialog wording).

### 3. Gate: `runArchiveFolder` / `runRestoreFolder`

Mirror `runArchive`/`runRestore`'s shape, extended for the directory case (mirroring `runDeleteFolder`/`runMoveFolder`'s existing extension of the page-scoped pattern): resolve destination via a new `FolderPathResolver.resolveArchiveDestination`/`resolveRestoreDestination` (folder-scoped equivalents of `MoveService`'s existing page methods, same reserved-folder lookups, no hardcoded path literals), `fileSystem.moveFile()` the directory, then `vault.archiveFolder()`/`vault.restoreFolder()`.

### 4. `FolderOperations.archive(folderId)` / `.restore(folderId)`

Same unconditional-cascade shape as `FolderOperations.delete()` — no existence check of its own, relies on the Gate's dequeue-time guard.

### 5. Read side: an "effectively archived" predicate, owned by `MembershipSelector`

A page or folder nested inside an archived folder must not appear in ordinary workspace views (folder tree, All Notes, etc.) even though its own `status` may still be `active` — the same visibility guarantee archived pages already have. This is a new predicate on `MembershipSelector` (ADR-023's existing sole owner of membership decisions) — e.g. `isEffectivelyArchived(pageOrFolder)`, checking the item's own status OR any ancestor folder's status — not a new subsystem, and not duplicated into `VaultQuery` or any UI component (rule 13 already requires page-list UIs to read through `EffectivePageState`/`MembershipSelector`, not re-derive this themselves).

### 6. UI

`FolderOperations.archive()`/`.restore()` wired into `folderTopBarMenu.config.ts` exactly where the comment currently explains their absence; same reserved-folder guard pattern the existing `delete` item doesn't need (per that file's comment, reserved folders never render this menu at all).

## Alternatives Considered

**A — Per-descendant-page archival (flatten every page into `Archive/` individually, drop the folder).** Rejected: destroys folder structure, causes filename collisions inside `Archive/`'s flat namespace the moment two same-named files from different sub-folders land there, and reimplements a traversal `moveFolder` already does correctly. Also blurs `Folder`/`Page` aggregate separation, which ADR-024 §Alternatives C already rejected for delete.

**B — Metadata-only folder archive, no physical relocation.** Rejected for consistency: every other archived thing in the vault (`Page`) lives under `Archive/` on disk — a metadata-only folder archive would mean "archived" has two different physical meanings depending on aggregate type, undermining the one mental model (`Archive/` is where archived things live) `ArchiveMetadataReconciler` depends on.

**C — Reuse `PageOperations`'s Gate kinds (`'archive'`/`'restore'`) for folders too, keyed by folder id.** Rejected: those kinds assume a single-file flatten-to-`Archive/` move (`MoveService.resolveArchiveDestination`); a folder's directory-preserving move is a different operation, not a parameterization of the same one — same reasoning ADR-024 §Alternatives A used to keep `'delete-folder'` separate from `'delete'`.

## Non-Goals

- **Does not resolve what happens when an individually-archived page's `originalParentId` folder is later itself archived or restored** — the page's own `originalParentId` still resolves to that folder by id; if that folder is inside `Archive/` at the time the page is restored, the page would restore into `Archive/`. Flagged, not fixed — a narrower follow-up if it proves to matter in practice, same deferral style ADR-025 used for its own out-of-scope TOCTOU gap.
- **Does not add folder-level undo, trash, or versioned archive history** — matches `Page.archive()`'s existing scope.
- **Does not change `Vault.moveFolder()`/`removeFolder()`'s existing contracts** — reused exactly as-is for the cascade.
- **Does not implement the confirmation-dialog UI copy**, if one turns out to be wanted for archiving a non-empty folder (mirroring ADR-024's delete-confirmation precedent) — a UI-layer decision at implementation time, not an architectural one.

## Consequences

- `Folder` gains full lifecycle parity with `Page`: create, delete, move, rename, archive, restore — all through `FolderOperations` and the Persistence Gate.
- `architecture-specification.md` §7 (`FolderOperations`'s public API) gains `archive(folderId)`/`restore(folderId)` once this ADR is accepted — not before.
- `MembershipSelector` gains one new predicate; no other subsystem's contract changes.

## Why This Approach Is Preferred

It extends the exact shape ADR-024 already used to complete `Folder`'s delete/rename/move lifecycle, reuses every already-correct primitive (`moveFolder`'s cascade, `moveFile`'s directory-safety, `MoveService`'s restore-fallback ordering, `MembershipSelector` as the one membership owner) instead of rebuilding any of them, and resolves the one genuinely new question (what does "archived" mean for a directory, structurally) explicitly here rather than leaving it for an implementation to answer by accident.
