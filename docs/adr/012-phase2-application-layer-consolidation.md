# ADR-012: Phase 2 Application-Layer Consolidation — Scope and Divergence Record

**Status:** Accepted

## Context

Phase 2 consolidated the fragmented application layer (`PageApplicationService`, `PageMutationService`, `PersistenceService`, `FolderApplicationService`) into two capability facades, `PageOperations` and `FolderOperations`, per `docs/architecture-specification.md` §6–7 and ADR-002. Re-reading the architecture documents fresh against the post-Phase-1 codebase (rather than reusing the original migration plan's assumptions) surfaced several places where the frozen specification's literal text doesn't match what this branch's code actually needed, mirroring the pattern ADR-011 already established for Phase 1. This ADR records each one, following `implementation-rules.md`'s divergence-reporting requirement.

## Decisions

### 1. `shouldPromoteDraft` omitted from `PageOperations.save()`

Spec §6 names `shouldPromoteDraft`/`promoteDraftToActive` as required internal collaborators of `save()`. This codebase's `PageStatus` is `'active' | 'archived'` only — no `'draft'` status exists anywhere in the `Page` model, and grep confirms zero references to either function in the codebase. There is nothing to promote from. `PageOperations.save()` ships without draft-promotion logic. The actual correctly-placed business rule in this codebase's `save()` is **archived pages are view-only** — carried over verbatim from `PageApplicationService.updateMarkdown`, and it plays the same architectural role `shouldPromoteDraft` plays in the spec's narrative (small, pure, colocated with the operation it modifies).

**Disposition:** Permanent omission unless a future product decision introduces a draft concept — not an architecture gap to close.

### 2. `move()`/`rename()` remain absent from both facades

Neither `PageOperations` nor `FolderOperations` gained `move()`/`rename()` in Phase 2, continuing the reasoning ADR-011 already established: no `move`/`rename` `PersistenceOperation` kind exists on the Gate, and building the facade method without the Gate support (or vice versa) would violate rule 12 (no capability may have more than one write path — or in this case, zero). `move` is assigned to Phase 3 (target doc item 9); `rename` has no assigned phase at all (flagged in the assessment as requiring a new Gate operation shape, genuinely more work than move).

`PageApplicationService.renamePage()` was a stub with zero callers anywhere in the codebase (confirmed via grep) — it is not carried into `PageOperations` at all. This is not a regression: nothing called it before, nothing calls it now.

**Disposition:** Closed when Phase 3 (move) and a to-be-scheduled phase (rename) add the corresponding Gate kinds and facade methods together, per rule 12.

### 3. `VaultSyncService`'s dependency on `DocumentRegistry` — deferred, not resolved

`VaultSyncService` (in `vault/sync/`) holds a direct `DocumentRegistry` reference, used to push external file changes into open, non-dirty editor sessions (`handleChanged`/`handleMoved`/`reconcileArchiveMetadataForPage`). Spec §9/ADR-010 say `DocumentEditing` (today's `core/engine/`) should become non-importable from outside `application/`. This was surfaced explicitly before Phase 2's plan was finalized, with three resolution options presented; the explicit decision was **defer entirely** — `core/engine/`'s location and `VaultSyncService`'s dependency are untouched, since fully resolving this would require inventing a Sync→Application notification mechanism nowhere specified, and the target doc's own Phase 2 steps never mention touching either.

**Disposition:** Tracked, no phase assigned. Revisit deliberately, together with the `core/engine` → `application/editing/` rename — doing the rename without resolving the dependency would only relocate the violation, not fix it.

### 4. `NavigationService` not renamed to `NavigationRouter`

The rename (spec §8) is deferred to Phase 4, alongside the deletion of its pure-forward methods (`openNote`/`openDailyNote`/`openFolder`). Renaming now, while those forwards still exist, would produce a class named "Router" that isn't shaped like one yet.

**Disposition:** Phase 4, per target doc item 14.

### 5. `NavigationService.createNote()` deleted, not carried forward as a stub

Unlike the 8 other throwing stubs on `NavigationService` (`openFavorites`, `openAllNotes`, `createTask`, `openAllTasks`, `openSomedayTasks`, `openCompletedTasks`, `createTag`, `openAllTags`), which Phase 4 will implement-or-delete based on product priority, `createNote()` was deleted immediately in commit 5. Reason: spec §8 explicitly excludes `createNote`/`createTask`/`createTag` from the future `NavigationRouter`'s surface entirely ("callers use `PageOperations.open`/`.create` directly, since those methods added no logic beyond forwarding"), and commit 5's rewiring of `buildNotesShortcutHandler.ts` to call `PageOperations.create()` directly made the stub provably dead code as a direct consequence of that same commit — the compliance checklist requires removing dead code a change produces, not leaving it alongside its replacement.

**Disposition:** Permanent — this was always the target shape, just reached three phases earlier than the original sequencing implied, because Phase 1 made it possible and commit 5 made it necessary.

### 6. `PageOperations.create()` does not open an editor session

Per spec's Create sequence, `create()` ends with `Workspace.openPage(newPageId)` only — no `DocumentRegistry`/session step. This means a freshly created page is marked active in `Workspace` but has no open `DocumentSession`; `PageHost` would render nothing until a session exists. `buildNotesShortcutHandler.ts`'s `'new-note'` case therefore calls `pageOperations.create(...)` **and then** `pageOperations.open(newPageId)` — two composed calls, matching `create()`'s literal spec sequence rather than assuming it implicitly opens a session.

**Disposition:** Permanent — this is the correct reading of spec's Create sequence, not a workaround. Any future caller of `create()` that wants the result immediately editable must call `open()` afterward, same as this one does.

### 7. `PageOperations.open()`'s return type changed from `Promise<DocumentSession>` to `Promise<void>`

`PageApplicationService.openPage` returned the opened `DocumentSession`; spec §6 types `open()` as `Promise<void>`, with `getSession()` as the separate accessor. Verified via grep that no caller anywhere used `openPage`'s return value (both call sites, in the pre-Phase-2 `NavigationService`, discarded it) — safe, spec-matching signature change with no behavioral impact.

### 8. Two test scenarios became structurally unreachable when `save()` was consolidated

Documented in `PageOperations.test.ts` inline: (a) a "stale revision" no-op test from the old `PersistenceService.save(session, revision)` no longer applies, since `PageOperations.save(pageId, markdown)` computes its own revision internally with no seam for a caller to supply a stale one; (b) "page removed before save is called" now rejects earlier (before ever reaching the Gate) than "page removed while the write is already in flight" (the Gate's own `replacePage`-after-write abandon path) — both are strengthenings, not coverage loss, and both are re-tested directly against the consolidated method.

## Why These Are Preferred

Each decision either narrows scope to what's demonstrably needed (omissions 1–2, deferral 3–4) or closes a gap the moment it becomes free to close (5–6) rather than waiting for a later phase to revisit code this phase already had open. None invents new architecture; none leaves a capability with more than one owner or more than one write path.
