# ADR-013: Phase 3 — Move Backend/UI Split, Restore/Delete UI, Presentational Dedup

**Status:** Accepted

## Context

Phase 3 shipped the four items `docs/architecture-target.md`'s migration plan lists (items 9–12): expose `PageOperations.move`, expose `restore` in the UI, add a `delete` UI entry point, and de-duplicate the topbar-actions and page-model files. Re-reading the architecture documents fresh against the post-Phase-2 codebase (rather than reusing the original migration plan's assumptions) surfaced the same category of divergence ADR-011 and ADR-012 already recorded for Phases 1 and 2. This ADR records each one, following `implementation-rules.md`'s divergence-reporting requirement.

## Decisions

### 1. Move: backend built and tested; UI deferred, not left inert

`docs/architecture-target.md`'s Phase 3 item 9 says "Phase 2 makes it a one-line facade addition." In practice this needed three commits, not one: `MoveService.resolveMoveDestination` (a new method, sibling to the existing `resolveArchiveDestination`/`resolveRestoreDestination`), a new `move` kind on `PersistenceOperation` (matching `architecture-specification.md` §5 with zero shape divergence — the first Gate kind added in this migration that didn't need one), and `PageOperations.move(pageId, destinationFolderId)` (matching spec §6 exactly). All three are shipped, tested, and unused by any caller — the same status `PageOperations.rename()` already has.

The item's other half — "wire a 'Move to…' UI entry point" — was not done. No destination-picker/modal component exists anywhere in the codebase (`components/` has no dialog primitive at all), and building one is net-new UI machinery, not a wiring task. Rather than leave the existing `move-to` note-menu item inert indefinitely (a live control presenting as if it works, `docs/architecture-compliance-checklist.md`'s UI Rules violation), a repo-wide search was run for every caller of `PageOperations.move()`, every `move-to`/"Move to…" reference, and every shortcut/command-palette/context-menu/automation surface. The note topbar menu was the only hit anywhere. The item was removed, not just documented as inert — closing the checklist violation rather than papering over it.

**Disposition:** Move's backend is complete and permanent. The UI entry point is deferred to whichever future phase builds a destination-picker component; re-adding the menu item is a one-line change once that component exists, since the facade method it calls is already built and tested.

### 2. Restore/Delete: a status-dependent toggle, not two static items

Neither `restore` nor `delete` had an existing menu item to "wire" — grep confirmed zero `restore`/`delete` item ids in any of the three topbar configs before this phase. `buildNoteTopBarMenu`/`buildDailyNoteTopBarMenu` became functions of the page's current status: a single `archive`/`restore` item that toggles based on `page.metadata.status` (a page is never both), plus an always-present `delete` item. This matches target-doc items 10/11 in substance; the toggle-vs-two-items shape is a design decision this ADR records since the target doc didn't specify one.

**Disposition:** Shipped in full, no follow-up.

### 3. Topbar dedup: one component, and folder's dead items actually removed

`NoteTopBarActions`/`DailyNoteTopBarActions`/`FolderTopBarActions` — already found to have diverged from each other during Phase 2 (Folder was missing the `onArchive` wiring the other two gained) — were unified into `ResourceTopBarActions`, parameterized by a menu config array and a handlers-by-item-id map. Placed in `app/layouts/page/topbar/` (beside `topBarRegistry.tsx`/`buildTopBarActions.tsx`, the existing resource-agnostic orchestration layer) rather than inside the `notes` feature, since it now serves three resource types.

Folder's `archive` and `move-to` menu items were removed in the same commit, for two different reasons: `archive` because `FolderOperations` has no archive concept in the frozen spec at all (`architecture-specification.md` §7 lists only `open`/`create`/`move`/`rename` — a permanent impossibility, not a deferred one); `move-to` because folder-move has no Gate/UI support yet (the same deferred-not-impossible status page `move-to` had, until Decision 1 above removed that one too).

**Disposition:** Shipped in full. `folderTopBarMenu.config.ts`'s remaining items (`add-a-description`, `add-to-favorite`) are still inert for reasons unrelated to archive/move — out of this phase's chartered scope, same disposition as the assessment's original finding about them.

### 4. Page-model dedup: one factory, needed no parameterization

`NotePageModel.ts`/`DailyNotePageModel.ts` were unified into `toResourcePageModel.ts`. The two files turned out to be identical in every member (`title`/`description`/`markdown`/`coverImage`/`updateDescription`-stub/`updateMarkdown`) except `NotePageModel`'s extra `rename()` member — so the unified factory needed no parameterization by resource type at all, the simplest of the outcomes the original planning considered.

`rename()` was removed, not carried forward as a shared stub. Grep confirmed zero callers anywhere, including `app/layouts/page/header/Page.Title.tsx`, whose `EditableText` is wired to a hardcoded `onCommit={() => {}}` — completely disconnected from `rename()` either way. Title editing has never worked, with or without this stub existing; removing the stub changes nothing observable. Fixing `Page.Title.tsx`'s no-op handler is a separate, pre-existing gap this ADR flags but does not resolve — it isn't caused by this phase's changes, and `PageOperations.rename()` still doesn't exist (no Gate operation shape for a metadata-only write, per ADR-012 item 2), so there is nothing to wire it to yet regardless.

Placed in `app/layouts/page/toResourcePageModel.ts`, beside `PageHost.tsx`, its only consumer, rather than inside one feature — same reasoning as Decision 3's placement of `ResourceTopBarActions`.

**Disposition:** Shipped in full. `Page.Title.tsx`'s no-op `onCommit` is tracked, no phase assigned — it resolves naturally once a future phase builds `PageOperations.rename()` end-to-end and needs a real commit handler to wire it to.

### 5. `architecture-target.md`'s Phase 3 text corrected

See the "Executed differently" blockquote added under Migration Plan Phase 3, following the same pattern ADR-011/ADR-012 already established for Phases 1–2.

## Why These Are Preferred

Each decision either closes a gap the moment it's free to close (2–4) or narrows scope to exactly what's built and defers the rest honestly instead of half-wiring it (1). None invents new architecture; none leaves a capability with more than one owner or more than one write path; the one deliberately-inert-then-removed UI item (Decision 1) was resolved by removing it after confirming, by search rather than assumption, that nothing else in the codebase depended on its presence.
