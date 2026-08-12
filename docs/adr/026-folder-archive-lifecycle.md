# ADR-026: Folder Archive and Restore

**Status:** Accepted (design frozen; implementation may proceed against this contract)

## Amendment (implementation sequencing): restore deferred to a follow-up milestone

Raised at acceptance time, mirroring ADR-024's own "defer `move` until the Folder Picker UI exists" amendment: the first implementation milestone against this ADR is scoped to **archive only** — `Vault.archiveFolder()`, the Gate's `'archive-folder'` kind, `FolderOperations.archive(folderId)`, and the `MembershipSelector.isEffectivelyArchived()` read-side predicate (§2–§5). `Vault.restoreFolder()`, the `'restore-folder'` Gate kind, `FolderOperations.restore(folderId)`, and `FolderPathResolver.resolveRestoreDestination` remain **not implemented** — this is an explicit, tracked incompleteness (per `implementation-rules.md` §3's "never silently half-done" checklist item), not a silent gap. This ADR's design for restore is otherwise unchanged and is the target for that follow-up milestone; nothing here narrows or reinterprets §2–§4's restore design.

## Amendment: external folder unarchive reconciliation (Sync)

Raised after the archive-only milestone shipped, when manually testing an archived folder's menu state surfaced a real gap: `VaultSyncService`'s folder branches (`handleMoved`/`handleDeleted`) predate this ADR and carry a comment — *"No archive-metadata repair applies to folders"* — that was true under ADR-024 (folders couldn't be archived at all) and is now stale. Pages have had exactly this repair since before this ADR, via `ArchiveMetadataReconciler`/`reconcilePageArchiveMetadata`: *"Folder location alone never implies archived status, and entering Archive/ externally never auto-archives. The only automatic repair clears archive metadata when a page with status archived lives outside Archive/."* §2 above already leans on this same principle for the archive-*write* direction (only the archived folder's own metadata changes, descendants' don't) but never named its Sync-reconciliation counterpart. This amendment closes that gap, narrowly, for folders — it does not reopen or restate anything already decided above.

**This is not Restore Folder.** Restore (§2's `Vault.restoreFolder()`, resolving back to `originalPath`/`Inbox`/root) remains explicitly out of scope per the amendment above. This reconciliation never resolves to `originalPath` — the externally chosen destination (wherever the folder was actually dragged/moved to) is authoritative, exactly like the existing page reconciliation never moves a page anywhere on its own, it only corrects frontmatter in place at the destination the filesystem already established.

**Frozen rules**, mirroring `ArchiveMetadataReconciler`'s existing page rules one aggregate over:

1. **Archived folder moved from inside `Archive/` to outside `Archive/` → immediately clear `status`, `archivedAt`, `originalPath`, and `originalParentId`** on that folder's own metadata. Trigger condition is identical in shape to `evaluateArchiveMetadataRepair`'s existing page check: `outsideArchive(newPath) && metadata.status === 'archived'`.
2. **Active folder moved into `Archive/` externally → do not auto-archive.** Symmetric with the page rule; needs no new logic beyond "the repair only ever fires in the clear-stale-status direction" — a folder whose `status` isn't already `'archived'` never matches the trigger, so an ordinary move into `Archive/` stays exactly the plain `Vault.moveFolder()` cascade it already is today.
3. **Only the moved folder's own metadata is repaired; descendants are untouched.** Mirrors §2's archive-write-direction rule exactly: descendant folders/pages already never had their own `status` touched by `archiveFolder()`, so there is nothing to clear on them here either — they were never individually archived by the parent's archival, and unarchiving the parent doesn't need to touch them for the same reason. `MembershipSelector.isEffectivelyArchived()`'s ancestor walk means the whole subtree's visibility already corrects itself the instant the top folder's own `status` does — no per-descendant pass is needed or performed.
4. **Persist the corrected `.folder.md` immediately** — the folder-scoped counterpart to the page repair's disk write, reusing `FrontmatterSerializer.serializeFolderDocument` (the same primitive `PagePersistenceCoordinator.runArchiveFolder` and the boot-time duplicate-id repair in `Application.ts` already use for exactly this "rewrite an existing folder's frontmatter" shape).
5. **Live sync must reconcile before publishing the final Vault state** — mirrors the page repair's existing invariant (`VaultSyncService.handleMoved`'s doc comment: *"never applied as two separate Vault mutations... the corrected path, parentId, and metadata land in a single... call, so the Vault... only ever observes the final, consistent state"*) exactly. The folder branch must evaluate the repair against the *candidate* destination folder before any Vault commit, the same way the page branch already does, so a subscriber (the sidebar) is never handed an intermediate "moved but still archived" snapshot.
6. **Startup reconciliation must perform the same repair for folders moved while Clutter was closed** — extends the existing single boot pass (`reconcileVaultArchiveMetadata`, called once from `Application.ts`) to also loop `vault.folders()`, mirroring its existing `vault.pages()` loop. One call site, no new wiring in `Application.ts` — the existing `deps` (vault/fileSystem/serializer) already covers what the folder repair needs.

**Mechanism, reusing rather than duplicating:** `ArchiveMetadataReconciler.evaluateArchiveMetadataRepair`/`applyArchiveMetadataCorrection` are generalized from `Page`-typed to a minimal structural shape (`{ path, metadata: { status } }`) that both `Page` and `Folder` already satisfy — the correction-computation logic (§0's "fully shareable, not just similarly-shaped" business logic) is the same function for both aggregates, not a second copy. `isInsideArchiveFolder` was already generic (path + vault root only) and needs no change. The Vault-side commit reuses `relocateFolderSubtree` (the same private cascade `moveFolder()`/`archiveFolder()` already share) behind a new, narrowly-named `Vault.correctFolderArchiveMetadata()` — kept distinct from `archiveFolder()` by name and by caller, per the same "no capability with two conceptual meanings under one method" reasoning §0/Alternative C already applied to Gate kind-naming: `archiveFolder()` is the app-initiated "become archived" write (Gate-only caller, via `runArchiveFolder`); `correctFolderArchiveMetadata()` is Sync's "external move revealed stale metadata" repair (Sync-only caller, per `Vault.ts`'s existing rule-3 restriction — callable only from `vault/persistence/` and `vault/sync/`). Mechanically the two are nearly identical (relocate + patch only the target's own metadata); they stay separate methods because they have different owners and different callers, exactly like `'archive'`/`'restore'` stayed separate Gate kinds from `'archive-folder'`/`'restore-folder'` for reasons of ownership rather than mechanism.

## Context

ADR-024 completed `Folder`'s delete/rename/move lifecycle but explicitly excluded archive, calling it "a permanent impossibility, not a deferred one" for that ADR's scope, and stating plainly: *"if folder archiving becomes a real product requirement, it needs its own ADR — this one does not silently imply it."* `folderTopBarMenu.config.ts` independently encodes the same exclusion in its own comment.

A request to add folder archive (matching the affordance `Page` already has) is exactly the trigger ADR-024 named. This ADR is that follow-up, written before any implementation, per `implementation-rules.md` §5 ("the specification is internally inconsistent" / "a requested change violates a frozen architectural invariant" are both stop-and-escalate conditions, not judgment calls).

**Why this isn't a one-line addition.** `Page.archive()` isn't a metadata flag — `PagePersistenceCoordinator.runArchive()` (via `MoveService.resolveArchiveDestination`) physically relocates the file into the vault's reserved `Archive/` folder, flattening to `Archive/<filename>`, and records `originalPath`/`originalParentId` so `restore()` can move it back. `restore()` prefers the original parent folder if it still exists, else `Inbox`, else vault root (`MoveService.resolveRestoreDestination`). `ArchiveMetadataReconciler` then keeps this consistent against external changes: entering/leaving `Archive/` on disk never by itself flips `status` — only Sync's explicit repair does, and only in the direction of clearing stale `archived` state when a page is found to have left `Archive/` externally.

`FolderMetadata` already structurally carries the identical fields (`status`, `archivedAt`, `originalPath`, `originalParentId`) — confirmed by direct inspection of `FolderMetadata.ts` — but no business rule, Gate operation, or read-side handling exists anywhere for them. Extending the page mechanism naively (flatten every descendant page into `Archive/` individually) would destroy the folder's internal structure and cause filename collisions; a folder is not "a page with children" (ADR-024 §Alternatives C already rejected blurring the two aggregates for delete, for the same reason).

## Decision

Follow `Page`'s existing archive shape exactly, adapted for the one structural difference `moveFolder`/`removeFolder` already established a precedent for: a folder archive/restore must move a whole directory, not flatten it.

### 0. How much of Page's archive mechanism actually reuses, checked explicitly before proposing anything new

Splitting "archive" into its two halves, rather than treating it as one opaque capability:

- **The decision — fully shareable, not just similarly-shaped.** Archiving computes `{status: 'archived', archivedAt: now, originalPath: <current path>, originalParentId: <current parentId>}`; restoring computes the inverse, preferring `originalParentId` if it still resolves, else `Inbox`, else vault root. `FolderMetadata` already carries the identical four fields `PageMetadata` does (confirmed directly). This patch-computation is the same business logic for both aggregates, not merely parallel — today it's written as an inline object literal inside `PagePersistenceCoordinator.runArchive`/`runRestore`; extending it to folders should factor it into one shared helper both `runArchive` and `runArchiveFolder` call (rule 4), not a second inline copy.
- **The persistence — irreducibly aggregate-specific.** A page's archive is a flatten-to-`Archive/<filename>` single-file move; a folder can't flatten (it's a container, not a leaf) — archiving it means relocating a whole subtree while preserving structure, exactly what `Vault.moveFolder()`'s cascade already does. This isn't a gap in reuse, it's the same asymmetry `delete`/`delete-folder` and `move`/`rename-folder` already have for the identical reason (§Alternatives C).
- **Gate dispatch — a folder id can never reach a page-scoped kind name without an early branch**, because `runOperation()` resolves `vault.getPage(id)` before its general switch (exactly why `'delete-folder'`/`'rename-folder'` are separately named, not unified with `'delete'`/`'move'`). Reusing the literal `'archive'`/`'restore'` kind names for folders would be the *first* deviation from that established pattern, not a continuation of it.

**Conclusion of this check:** the mechanism is highly reusable at the business-logic layer (§2's shared metadata-patch helper) and only genuinely aggregate-specific at the disk-relocation/Gate-dispatch layer — consistent with, not an exception to, how every other folder capability in ADR-024 was built. What remains open is not mechanism, but two product decisions named in Non-Goals below, which is why a (now narrower) decision record is still proposed rather than either silent implementation or a full architectural redesign.

### 1. Scope: no new subsystem, same five touched by ADR-024

`Vault` (two new mutations), Persistence Gate (two new operation kinds, sharing a metadata-patch helper with `runArchive`/`runRestore` per §0), `FolderOperations` (two new facade methods), `MembershipSelector` (one new read-side predicate — see §5), UI (one topbar menu item + reserved-folder guard). No new class of subsystem.

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

**C — Reuse `PageOperations`'s Gate kinds (`'archive'`/`'restore'`) for folders too, keyed by folder id.** Rejected at the Gate-dispatch/kind-naming layer only (§0): those kinds assume a single-file flatten-to-`Archive/` move; a folder's directory-preserving move is a different operation, not a parameterization of the same one — same reasoning ADR-024 §Alternatives A used to keep `'delete-folder'` separate from `'delete'`. This is narrower than rejecting reuse outright — the underlying archive/restore metadata-patch logic *is* shared (§0, §2), only the Gate kind names and disk-relocation mechanics are kept separate.

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
