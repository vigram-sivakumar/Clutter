# ADR-027: Navigation History (Previous / Next), Owned by `Workspace` and `NavigationRouter`

**Status:** Accepted

## Context

`Controls.tsx`'s two history buttons have been permanently `disabled` since before this migration began, with no backing state anywhere. ADR-016 disclosed this explicitly rather than wiring or deleting them: *"kept in full... as placeholders for future navigation-history and sidebar-collapse features... none of the backing state... exists anywhere yet."* `Workspace`'s own class doc (`apps/app/src/core/workspace/Workspace.ts`) has listed **"Own navigation history"** as a Responsibility since the file's original draft — a documented intention with zero implementation behind it, the same shape as `workspace.json`'s dead persistence hook that ADR-006 addressed for a different piece of state.

Sidebar-toggle and section-collapse state were built out in ADR-021 by extending `Workspace`. History is different in one important way: `Workspace` is architecturally zero-dependency (ADR-006, reaffirmed in every subsequent ADR) — it "references a Vault" conceptually but imports nothing from it. History has to answer "does this remembered target still exist," which is a `Vault` read, and "reactivate this page/folder" needs `PageOperations.open()`/`FolderOperations.open()` (session creation, edit-flush-on-navigate) — not a bare `Workspace` field assignment. So history cannot be *entirely* a `Workspace`-internal feature the way sidebar-collapse was; it needs a second owner for the parts that require `Vault`/facade access, without breaking `Workspace`'s zero-dependency invariant.

Confirmed by direct inspection that every current navigation entry point already funnels through exactly three `Workspace` methods and no others:
- `PageOperations.open()`/`.openDraft()`/`.openAtPath()`/`.create()` → `workspace.openPage()`
- `FolderOperations.open()` → `workspace.openFolder()`
- `NavigationRouter`'s nine view intents (`openArchive`, `openInbox`, `openTemplates`, `openWorkspace`, `openFavorites`, `openTasksToday/Upcoming/Completed/All/Unscheduled`, `openTag`) → either `folderOperations.open()` above, or `workspace.openFilteredView()` directly

`workspace.closePage()`/`closeFolder()` also mutate `activeView`, but only as a tab-close side effect (restoring the last-open tab, or ADR-025's delete-time fallback) — never a user "go to X" action.

`ActiveView` (ADR-022: `{type:'page', id}` / `{type:'folder', id}` / `{type:'filtered-view', view}`) already uniquely identifies anything navigable — pages, folders, and every filtered collection (Favorites, Tags, Tasks views, Archive, Inbox, Templates, root Workspace). No new "history entry" type is needed; reusing `ActiveView` satisfies rule 4 (never duplicate a business shape that already exists).

## Decision

### Invariants

These five are binding on the implementation, not just design intent — each is independently verifiable against the diff at review time.

1. **Skip stale entries; never invoke fallback.** Traversal only skips past a deleted target to the next valid one in the same direction. `A → B → C`, `B` deleted, press Back from `C`: lands on `A` directly, `B` silently discarded from the stack. `Application.openFallbackPage()` (ADR-025) is never called from `back()`/`forward()` — that mechanism answers a different question ("the active page just vanished out from under the user"), not "where should Back go."
2. **`Workspace` is the only mutator of `activeView`, through exactly five call sites, all private to `Workspace.ts` itself: `openPage()`, `openFolder()`, `openFilteredView()`, `closePage()`, `closeFolder()`.** Verified directly: `grep -rn "_activeView\s*=" apps/app/src` returns exactly these five assignments, all inside `Workspace.ts`; no other file in the codebase touches `activeView` by any other path. Of the five, only the first three ever record history (per Invariant 3/5) — `closePage()`/`closeFolder()` restoring the last-open tab (or clearing to `null`) is tab lifecycle, not navigation, and was already unrecorded before this ADR (ADR-025's Responsibilities split). This ADR adds no sixth mutation path and closes off any future one implicitly: a reviewer sees a new `_activeView =` outside `Workspace.ts` (impossible, it's private) or a new method inside `Workspace.ts` assigning it outside these five as an immediate architecture-checklist failure.
3. **Traversal itself never records history.** `back()`/`forward()` commit a replayed entry exclusively via `{ recordHistory: false }` — through `pageOperations.open(id, { recordHistory: false })`, `folderOperations.open(id, { recordHistory: false })`, or `workspace.openFilteredView(view, { recordHistory: false })`. There is no code path by which a `back()`/`forward()` call reaches `Workspace`'s recording branch.
4. **Browser-style branching.** `A → B → C`, Back to `A → B`, then a new user navigation to `D`: `C` is discarded, `forwardStack` is cleared, result is `A → B → D` with no way to reach `C` via Forward again. This is `openPage()`/`openFolder()`/`openFilteredView()`'s existing `recordHistory: true` branch (clear `forwardStack` unconditionally on every recorded navigation) — stated here as a first-class invariant rather than left as an implied side effect of that branch's ordering.
5. **History records explicit user navigation only.** The `recordHistory: true` default fires solely for direct calls to `openPage()`/`openFolder()`/`openFilteredView()` originating from a real user action (sidebar click, search result, Favorites/Tags/Tasks/Archive/Inbox/Templates/Workspace intents, opening/creating a page). Four things are explicitly and permanently excluded:
   - **History traversal** (`back()`/`forward()`) — excluded via the explicit `recordHistory: false` flag (Invariant 3).
   - **Tab-close restoration** (`closePage()`/`closeFolder()`) — excluded structurally: these two methods assign `_activeView` directly and never call `openPage()`/`openFolder()`/`openFilteredView()` at all (Invariant 2), so there is no recording branch for them to pass a flag to in the first place.
   - **Delete-time fallback** (`Application.openFallbackPage()`, ADR-025) and **startup's initial resolve-or-draft open** (`Application.open()`) — both call `PageOperations.open()`/`.openAtPath()` while `workspace.activeView` is still `null` (delete fallback runs only when `PageOperations.delete()` finds `!this.workspace.activeView` after `closePage()`; startup runs before anything has ever been opened). The recording branch's own "only push if current `activeView` is non-null" guard (see the `Workspace` public API section below) means these two calls are unrecorded today as an incidental consequence of *when* they run, not because they pass a flag. This is correct today but is a guard-based exclusion, not a flag-based one — **any future code path that calls `PageOperations.open()`/`openAtPath()`/`FolderOperations.open()` as internal recovery while `activeView` could be non-null (e.g., a future "restore last session" feature reusing today's `activeView` for anything) must pass `recordHistory: false` explicitly, matching delete-fallback/startup's actual intent, rather than relying on the guard.**

### Ownership split

1. **`Workspace`** gains two private stacks of `ActiveView` (`backStack`, `forwardStack`) and owns all *mechanical* stack bookkeeping: recording a navigation, peeking, popping, and exposing `canNavigateBack`/`canNavigateForward`. It performs no existence checks and calls nothing outside itself — its zero-dependency status (ADR-006) is unchanged.
2. **`NavigationRouter`** gains `back()`/`forward()` and owns the *policy*: walking the stack past stale entries and committing a valid one through the correct facade. This is not a bare forward (rule 3) — it is exactly the kind of "combines a query and a state change" compound intent ADR-005 already scoped this class for, the same reasoning that justifies `openFavorites()`/`openAllTasks()` living here rather than on `Workspace` or a facade. `NavigationRouter`'s constructor gains `pageOperations: PageOperations` (it lost this dependency in Phase 4/ADR-014 specifically because its old page-opening methods were pure forwards; `back()`/`forward()` are not, so re-adding it does not reopen that finding).

### `Workspace` public API additions

```ts
class Workspace {
  openPage(pageId: string, options?: { recordHistory?: boolean }): void;
  openFolder(folderId: string, options?: { recordHistory?: boolean }): void;
  openFilteredView(view: FilteredView, options?: { recordHistory?: boolean }): void;

  get canNavigateBack(): boolean;
  get canNavigateForward(): boolean;
  peekBack(): ActiveView | undefined;      // read-only
  peekForward(): ActiveView | undefined;   // read-only
  discardBackEntry(): void;                // drops a confirmed-stale entry, no other effect
  discardForwardEntry(): void;
  popBackForReplay(): void;                // pops backStack; pushes current activeView to forwardStack
  popForwardForReplay(): void;             // symmetric
}
```

`options.recordHistory` defaults to `true` — every existing call site (unchanged) keeps recording. `openPage`/`openFolder`/`openFilteredView`'s recording branch: if `recordHistory` is true, `activeView` is non-null, and the new target isn't equal (by type+id/view) to the current `activeView`, push current `activeView` onto `backStack` and clear `forwardStack` (branching invariant), then set the new `activeView`. If `recordHistory` is false, only `activeView` is set — no stack mutation (this is the replay path).

`closePage()`/`closeFolder()` are unchanged and never touch the history stacks — restoring the last-open tab (ADR-025) is not a recorded navigation, matching that ADR's existing responsibility split.

### `PageOperations.open()` / `FolderOperations.open()`

Both gain the same optional `options?: { recordHistory?: boolean }`, forwarded verbatim to `workspace.openPage()`/`workspace.openFolder()`. No other behavior changes — the existence check, session creation (`documentRegistry.open()`, already idempotent for an id with a live session per its own doc comment), and edit-flush-on-navigate all run exactly as they do today, regardless of the flag.

### `NavigationRouter.back()` / `.forward()`

```ts
public back(): void {
  while (this.workspace.canNavigateBack) {
    const entry = this.workspace.peekBack()!;
    if (!this.stillExists(entry)) {
      this.workspace.discardBackEntry();
      continue;
    }
    this.workspace.popBackForReplay();
    this.commit(entry);
    return;
  }
}
// forward() is the mirror image, using peekForward/discardForwardEntry/popForwardForReplay.

private stillExists(entry: ActiveView): boolean {
  if (entry.type === 'page') return this.vault.getPage(entry.id) !== undefined;
  if (entry.type === 'folder') return this.vault.getFolder(entry.id) !== undefined;
  return true; // filtered views have no id to go stale; an empty result set is a normal, already-handled render state
}

private commit(entry: ActiveView): void {
  if (entry.type === 'page') void this.pageOperations.open(entry.id, { recordHistory: false });
  else if (entry.type === 'folder') void this.folderOperations.open(entry.id, { recordHistory: false });
  else this.workspace.openFilteredView(entry.view, { recordHistory: false });
}
```

`stillExists` is a plain `Vault` read (the same `getPage`/`getFolder` lookup `PageOperations.open()`/`FolderOperations.open()` already do internally) used only to decide *whether to keep popping* — it does not duplicate any fallback-selection logic; there is no new fallback *policy* here, only "skip and keep going," which is standard back/forward behavior, not a page/folder lifecycle decision. Renamed and archived pages/folders are not stale by this check (their id and Vault entry are unchanged — rename changes path/title, archive changes status/folder, neither removes the `Vault` entry), so `back()`/`forward()` reopen them exactly as `open()` would from anywhere else, showing their current (renamed/archived) state — no special-case needed for either.

### Fallback when history is exhausted

If every remaining entry in the direction being walked is stale, the `while` loop empties the stack via repeated `discardBackEntry()`/`discardForwardEntry()` calls and returns without committing anything — `activeView` is untouched, and `canNavigateBack`/`canNavigateForward` (now `false`) drive the button back to disabled on the next render. This deliberately does **not** invoke `Application.openFallbackPage()` (ADR-025) — that mechanism answers "the active page was just deleted out from under the user," a different trigger than "the user asked to go back and there's nothing left to go back to." Reusing it here would conflate two distinct policies under rule 5.

### UI wiring

`Controls.tsx`'s two buttons: `disabled={!workspace.canNavigateBack}` / `!workspace.canNavigateForward`, `onClick={() => navigationRouter.back()}` / `.forward()`. Both are already-established prop patterns — `Controls` (or its parent) receives `workspace` and `navigationRouter` the same way every other feature component receives facades (rule 11), no new prop-drilling shape.

### Persistence

Navigation history is in-memory only, exactly like the rest of `Workspace`'s state (ADR-006) and explicitly out of scope per `docs/durability-model.md` (undo/version history is named there as out of scope today). It resets on every app restart — `backStack`/`forwardStack` start empty on `Application.bootstrap()`, same as `openPageIds`. No `workspace.json` involvement; this ADR does not reopen ADR-006's persistence question.

### Non-goals (deliberately deferred, not gaps)

- **No cap on stack size.** An unbounded stack matches this codebase's existing practice of not speculatively engineering a limit absent a demonstrated need (rule 13) — a session-length stack of `ActiveView` entries (a handful of primitive fields each) has negligible memory cost. Revisit only if a real problem is observed.
- **No eager purge of history entries on delete/archive.** `PageOperations.delete()`/`FolderOperations.delete()` are unchanged — they do not reach into `Workspace`'s history stacks. Staleness is resolved lazily, only when the user actually traverses to that entry (`stillExists` above), which is simpler and avoids adding new delete-time coupling to `Workspace` (rule 5).

## Alternatives Considered

- **Put `back()`/`forward()` on `Workspace` itself.** Rejected — would require `Workspace` to import `Vault` (for `stillExists`) and `PageOperations`/`FolderOperations` (for session-creating reactivation), breaking its zero-dependency invariant that ADR-006 established and every subsequent ADR has explicitly preserved. The stack bookkeeping stays on `Workspace`; the policy that needs those dependencies moves to the one class already scoped for compound Workspace+Vault+facade intents.
- **Put `back()`/`forward()` on `PageOperations`/`FolderOperations`.** Rejected — a history entry can resolve to a page, a folder, or a filtered view; no single aggregate facade owns all three, and forcing it into either would blur that facade's `open/create/mutate/delete`-on-one-aggregate shape (the same reasoning ADR-005 already used to keep view-level intents off both facades).
- **A new `NavigationHistory` subsystem.** Rejected under §5's "does this require inventing a new architecture" test and §6's bar for a new subsystem ("a genuinely new category of responsibility not covered by any of the twelve") — it isn't one. `Workspace`'s own doc comment has claimed this responsibility since the spec's original draft; this ADR is closing that gap on the existing owner, not inventing a thirteenth subsystem.
- **Record history via a `Vault`/`Workspace` subscription (observe every `activeView` change generically) instead of an explicit `recordHistory` flag threaded through the three entry methods.** Rejected — a generic "any activeView change is a navigation" listener cannot distinguish a user-initiated open from a `back()`/`forward()` replay (both produce the identical `activeView` mutation), which would immediately re-record every replayed step as a new forward-clearing navigation and make `forward()` permanently unreachable after one `back()`. The explicit flag is the smallest change that lets the replay path opt out.
- **Eagerly validate/prune the entire stack whenever a page or folder is deleted.** Rejected for now (see Non-goals) — real coupling cost (both `delete()` methods would need a `Workspace` history-aware call) for a problem the lazy check already handles correctly and more simply.
- **Use exceptions (`PageOperations.open()`'s existing `throw` on missing id) as the staleness signal instead of a pre-check.** Rejected — turns expected, common control flow (an old history entry pointing at something since deleted) into exception-driven logic, and would require `NavigationRouter` to catch and keep looping around a thrown `Error` rather than a plain boolean check against data it already has direct read access to (`vault`).

## Consequences

- `docs/architecture-specification.md` §8 (`NavigationRouter`) is amended: `back(): void` / `forward(): void` added to the public API; a new Invariant recorded ("stale entries are skipped via a plain `Vault` existence read, never via a caught exception; committing a replayed entry never re-records history"); Internal collaborators gains `PageOperations`.
- `docs/architecture-specification.md` §10 (`Workspace`) is amended: the new stack fields and six methods/getters added to the public API; a new Invariant recorded ("history recording and replay are mutually exclusive — `recordHistory: false` never triggers a stack push, `recordHistory: true` (default) always does, subject to the non-null/not-equal guard"); `refresh()`'s existing two-part gate is unaffected (history is a field `Workspace` itself owns and mutates directly, not an external-state case).
- `NavigationRouter`'s constructor signature changes (`pageOperations` added); `Application.attachVault()` and every test fixture constructing `NavigationRouter` directly are updated to pass it.
- `PageOperations.open()`/`FolderOperations.open()` gain an optional trailing parameter; every existing call site is source-compatible with no changes required (default preserves current behavior exactly).
- `Controls.tsx` loses its `disabled` hardcoding and its now-inaccurate doc comment (`"History (back/forward) controls remain intentional placeholders — no backing state exists for navigation history yet (ADR-016)"`); replaced with real props and a comment pointing at this ADR instead.
- New test coverage required (per implementation-rules.md §3/§4) before this is considered done: normal back/forward, multiple steps, branching after a mid-stack navigation, a stale (deleted) page/folder entry being skipped transparently, mixed page/folder/filtered-view sequences, and boot-time empty-history (`canNavigateBack`/`canNavigateForward` both `false` immediately after `Application.open()`).

### Amendment: history buttons relocated to `PageTopBar`

The two history buttons now render in `PageTopBar.tsx`, not `Controls.tsx` — a UI/component relocation that leaves this ADR's decision intact. Ownership is unchanged: `Workspace` still owns the `backStack`/`forwardStack` and exposes `canNavigateBack`/`canNavigateForward`, and `NavigationRouter.back()`/`.forward()` are still the only handlers. Only the render site and the prop path changed:

- The "UI wiring" section above describes the bindings correctly but names the wrong component. Read `Controls.tsx` there as `PageTopBar.tsx`; the bindings themselves (`disabled={!workspace.canNavigateBack}` / `onClick={() => navigationRouter.back()}`, and their forward counterparts) are exactly what `PageTopBar` implements.
- The props reach `PageTopBar` from `PageHost` — the composition root that already reads `workspace` and `application.navigation` — threaded through `Page` as four optional props defaulting to no-history/no-op, so `Page`'s other callers are unaffected. Still a facade-prop pattern (rule 11), still no second navigation path.
- `Controls.tsx` keeps only the sidebar toggle and the create placeholders. The `disabled={!canNavigateBack}` that the create button had inherited by copy-paste is gone with it: the create buttons have no backing state yet, so they are plain enabled placeholders rather than borrowing an unrelated disabled condition.
- The `.history-controls` rule moved from `Controls.css` to `Page.TopBar.css` alongside the buttons; the ADR-027 button tests moved from `Controls.test.tsx` to `Page.TopBar.test.tsx`, asserting the same behavior against the new render site.

## Why This Approach Is Preferred

It closes the exact gap `Workspace`'s own doc comment and ADR-016 have both named without inventing a new subsystem, a new entry-point wiring pattern, or a new "history entry" shape — three existing seams (`Workspace`'s three navigation setters, `NavigationRouter`'s ADR-005-scoped role as the home for compound view-level intents, and `ActiveView`'s already-general union) turn out to be exactly sufficient. The one real constraint this ADR had to design around — `Workspace`'s zero-dependency invariant colliding with history's need to check `Vault` and reactivate through `PageOperations`/`FolderOperations` — is resolved the same way ADR-025 already resolved an analogous split (mechanical restore vs. policy decision vs. lifecycle recognition), rather than bending either existing invariant to make the feature fit.
