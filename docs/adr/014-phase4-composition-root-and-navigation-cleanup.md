# ADR-014: Phase 4 — Composition Root and Navigation Cleanup

**Status:** Accepted

## Context

Phase 4 shipped the three items `docs/architecture-target.md`'s migration plan lists (items 13–15): split `Application.open()` into `bootstrap()`/`attachVault()`, delete `NavigationService`'s pure-forward methods and rename it to `NavigationRouter`, and resolve the 8 remaining stub methods. As with every prior phase, re-grounding the plan in the actual current code (rather than the frozen spec's literal text) surfaced real divergences, recorded here per `implementation-rules.md`'s divergence process.

## Decisions

### 1. The frozen spec's Startup sequence was internally inconsistent — amended, not just diverged from

`architecture-specification.md`'s Persistence Gate section (§5) states the Gate is "constructed once... after the Vault exists (it needs a `Vault` reference to mutate)." Its Startup sequence, however, described `bootstrap()` ensuring today's daily note via "a minimal Gate... before the scan" — i.e., before the Vault exists. Those two statements cannot both be true: the Gate's own constructor requires a `Vault`, so no `create` operation can run through it before one exists. This is `implementation-rules.md` §5's "specification is internally inconsistent" failure condition, not an ordinary implementation-vs-spec divergence — so this ADR amends the spec text itself (§11's Lifecycle description and the Startup sequence), rather than just recording a gap.

**Resolution:** rather than either (a) building a second, undefined "minimal Gate" implementation, or (b) keeping `DailyNoteService`'s pre-Phase-4 direct `fileSystem.writeFile` as a permanent bypass, `bootstrap()` now:
1. Ensures the Daily Notes year/month directory exists (`DailyNoteService.ensureDirectoryForToday`) — directory scaffolding only, no page content, the same class of pre-Vault operation `VaultInitializer` already performs for reserved folders. Not a Gate-bypass in the rule-2 sense, since it isn't a page/folder content write.
2. Scans and builds the Vault — the (possibly-new) month folder is now discovered as a real `Folder`, since `VaultScanner` walks every directory regardless of whether it has files yet.
3. Calls `attachVault()` — internally, not from `AppShell` (see Decision 2) — constructing the real Gate.
4. Ensures the daily note's *content* exists (`DailyNoteService.ensurePage`) through the real Gate's `create` operation, resolving `parentId` from the folder the scan just discovered. No bypass, no synthesized/incorrect metadata — not even for the very first daily note of a new month or year, which was the concrete edge case that ruled out the simpler "just reorder scan-before-ensure and accept `parentId: null`" alternative.

This closes ADR-011's documented bootstrap exception for real, rather than deferring it again.

### 2. `attachVault()`'s caller moves from `AppShell` to `bootstrap()` itself

The spec's literal Startup sequence has `AppShell` call `bootstrap()`, then separately call `attachVault(vault)`, then `open()` — three calls. Since `bootstrap()` now needs the real, fully-attached Gate before it can ensure today's note through it (Decision 1, step 4), `attachVault()` must run before `bootstrap()` returns. `AppShell`'s call sequence is now two calls (`bootstrap()` then `open()`), not three. `attachVault(vault, pageCreator)` remains a real, independently-callable instance method — matching the spec's public shape and kept testable against in-memory doubles (`Application.test.ts` covers its single-construction invariant directly) — it's just not called externally by `AppShell` anymore.

**Disposition:** permanent — this follows directly from Decision 1's resolution, not a temporary state.

### 3. `NavigationRouter` rename and forward deletion

`openNote`/`openDailyNote`/`openFolder` deleted — each was an unconditional single-call forward, the literal regression example `ARCHITECTURE_RULES.md` rule 9 names. Class renamed from `NavigationService` per ADR-012 item 4, which explicitly deferred the rename until these forwards were gone. Callers (`Application.ts`, `Sidebar.tsx`, `PageHost.tsx` — 7 call sites total) now hold direct references to `PageOperations`/`FolderOperations`. `NavigationRouter`'s constructor dropped its now-unused `PageOperations` parameter entirely rather than keeping dead surface area.

**Disposition:** shipped in full, matches spec §8 exactly for this part.

### 4. The 8 stub methods split 6-vs-2, not resolved uniformly

Target-doc item 15 called this "a product decision... whichever way each one resolves." Investigation found all 6 spec-§8-named view-intent stubs (`openFavorites`/`openAllNotes`/`openAllTasks`/`openSomedayTasks`/`openCompletedTasks`/`openAllTags`) share one blocker: `Workspace` (spec §10) has no "active view" state to render a filtered list into — only `activePageId`/`activeFolderId`, mutually exclusive by spec's own invariant. Building any of them, even the cheapest (Favorites, which already has `VaultQuery.getFavoritePages()`), requires a `Workspace` API extension — a spec §10 amendment and its own rendered view, sized closer to a phase of its own than a Phase 4 cleanup item. Per your explicit decision, all 6 (plus their live sidebar shortcut entries — 5 were wired to real, clickable, throw-on-click controls; `openFavorites` had no UI entry at all) were deleted rather than built.

`createTask`/`createTag` were **not** touched, continuing ADR-012's existing disposition (permanent removal, blocked on `TaskOperations`/`TagOperations` existing, no phase assigned) — removing "create a task/tag" from the UI entirely is a more significant product regression than removing a filtered view, not a call to bundle in mechanically alongside the other 6.

**Disposition:** 6 deleted, permanent unless a future, separately-scoped phase designs the `Workspace` view-state extension. 2 unchanged, still blocked, no phase assigned.

## Why These Are Preferred

Decision 1 is the only one that required amending the frozen spec itself rather than just diverging from it — done deliberately, narrowly (one sequence, one lifecycle paragraph), and only after confirming the literal text was unbuildable, not merely inconvenient. Decisions 2–4 each follow directly from re-grounding the plan in the real codebase rather than the plan's original assumptions, the same pattern every prior phase's ADR has recorded.

## Amendment: `DailyNoteService.ensurePage()`'s Direct Gate Call Is Not a Rule-1 Violation

Surfaced during the post-v1.0 architecture stress test and resolved here, as a clarification of Decision 1's own design rather than a new decision — it doesn't change what shipped, it documents why what shipped is correct, the same way ADR-011's amendment clarified rule 5 without changing any code.

### The apparent violation

`DailyNoteService.ensurePage()` (Decision 1, step 4) calls `PagePersistenceCoordinator.enqueue(id, {kind: 'create', ...})` directly — not `PageOperations.create()` — even though `attachVault()` has already run by the time `ensurePage` is called, meaning `PageOperations` exists and is unused at that call site. `ARCHITECTURE_RULES.md` rule 1's regression signature literally reads "a second file that can create... a page... outside `PageOperations`/`FolderOperations`," which this matches by the letter.

### Why it's correct anyway

`PageOperations.create()` and `DailyNoteService.ensurePage()` are not two implementations of the same decision. `PageOperations.create()` decides *where user-chosen content should go*, general-purpose and repeatable, with collision-free title-based naming via `PagePathResolver`. `DailyNoteService.ensurePage()` decides *whether today's one specific, well-known page already exists*, a singular, bootstrap-triggered, fixed-path check that runs exactly once per app launch and needs no collision-avoidance at all — `PageOperations.create()` structurally cannot serve this case without being extended for a caller that would still be its only user. They are different decisions that happen to terminate at the same Gate — exactly what rule 2 (the single write path) requires, and exactly the same shape as rule 2's own already-accepted `VaultInitializer` bootstrap exception.

The counter-argument seriously considered and rejected: that this could set a precedent other bootstrap-time features copy, gradually fragmenting page creation the way the pre-migration codebase fragmented page mutation generally. This is a real risk *in the abstract*, but not evidence of an actual problem today — there is exactly one such call site, it has existed since Phase 4 without a second one appearing, and per `implementation-rules.md`'s own constraint against inventing hypothetical problems, the correct response to a risk that hasn't materialized is a named tripwire, not new abstraction built for a single caller.

### Disposition

`ARCHITECTURE_RULES.md` rule 1 is amended (see that file) to name this distinction explicitly, with `DailyNoteService.ensurePage()` as the worked example. No implementation code changes as a result — the call site is unchanged, now with a fuller name for why it's already correct. **Tripwire, not a deferred TODO:** if a second workflow anywhere ever bypasses `PageOperations`/`FolderOperations` to enqueue directly through the Gate, that second instance — not this one — is the signal to generalize the relevant facade method.
