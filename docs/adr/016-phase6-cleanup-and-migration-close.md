# ADR-016: Phase 6 — Cleanup, and Closing the Six-Phase Migration Plan

**Status:** Accepted

## Context

Phase 6 shipped target-doc items 18-21. Items 18 and 19 were confirmed accurate and executed exactly as described. Items 20 and 21 needed correction and, for 21, a split disposition — recorded here per `implementation-rules.md`'s divergence process, the same pattern every phase in this migration has followed.

## Decisions

### 1. Items 18-19: confirmed accurate, no divergence

`packages/engine`/`packages/editor` (5,025 LOC) and the 7 confirmed dead files were re-verified directly before deletion — still zero real consumers each, still outside the npm workspace for the packages. Deleted exactly as described. One piece of direct fallout not named in either item: `IconSlot.css`, orphaned by `IconSlot.tsx`'s deletion, removed in the same commit once confirmed to have no other consumer.

**Disposition:** permanent, no further action.

### 2. Item 20: "alias" was never a real target; `knowledgeGraph` needed a shape fix, not just a timing change

Confirmed via direct inspection: there is no vault-wide alias projection anywhere in the codebase to make lazy. `Alias` is plain per-page data (`Page.aliases`), never aggregated into a `Vault`-level index or getter — ADR-004 already said this more precisely than target-doc's item 20 summary ("alias extraction... is not surfaced as a public `Vault` API until something consumes it"). The real, and only, target was `knowledgeGraph`/`embeds`.

Making them lazy required more than the "pure performance change" item 20 describes:
- `Vault.knowledgeGraph` was a property getter (`get knowledgeGraph()`); spec §3 specifies a method (`knowledgeGraph(): KnowledgeGraph`). Fixed as part of this commit — a real, disclosed signature change, though one with zero production callers to break.
- `VaultProjectionBuilder.build()` computed all four projections (tags, tasks, embeds, knowledgeGraph) in one combined call. Split into `buildEager()` (tags/tasks, called on every mutation) and `buildLazy()` (embeds/knowledgeGraph, invalidated on mutation, rebuilt only on next access) — necessary, not optional: a combined call would have computed embeds/graph on every eager rebuild regardless, defeating the point.
- A second, unrelated `VaultPath`-extraction miss from Phase 5 was found and fixed in passing while working in the same file: `isReservedTopLevelFolderPath` computed a `` `${vaultRoot}/` `` prefix into a variable before calling `.startsWith()` on it, which Phase 5's audit grep (matching only inline-backtick `.startsWith(\`...\`)` calls) didn't catch. Rewritten using `VaultPath.parentDirectory`/`.filename`.

**Disposition:** permanent. Referential-stability and invalidate/rebuild-on-access behavior covered by 5 new tests, including a spy-based test proving `buildLazy()` is never called by a mutation itself and rebuilds at most once across several stacked mutations.

### 3. Item 21 splits: `References` deferred as a real feature, not dead code; `Controls` kept and fully disabled, not deleted

**`References`:** `Page.tsx` rendered `<References>` with no `references` prop and no real data source anywhere — permanently empty regardless of user action, the literal "fake wiring that always produces an empty result" this item targets. That render call and its supporting `referencesExpanded` state were removed.

`Reference.tsx`/`Reference.css` were **kept**, not deleted, per explicit direction: the component itself is architecturally clean — pure presentation, typed props, no `Vault`/filesystem/business-logic coupling — and removing the fake wiring leaves it with zero render sites anywhere, i.e. fully unreachable. Rather than either leaving fake wiring in place or deleting a component with no real maintenance cost, it's kept as a deliberately deferred product feature. **This is not dead code** — dead code is unreachable and unintended; this is unreachable and intended, pending a specific, named piece of future work:

1. Build the backlink/reference indexing subsystem (a real projection, following `Vault`'s existing lazy-projection pattern from Decision 2 above).
2. Expose it through `VaultQuery` (the read layer) — not a new query mechanism, the existing one.
3. Wire `Reference.tsx` to that real query API from `Page.tsx`.
4. Keep all parsing, indexing, and business logic outside the UI component — `Reference.tsx` stays exactly as presentation-only as it is today.

**`Controls`:** initially deleted (its 3 inert controls — two permanently-`disabled` history buttons with no navigation-history state anywhere, and a sidebar-toggle button with no handler at all) in the same pass as `References`, then explicitly restored per your follow-up direction. The layout and all 3 controls are kept, intentionally, as placeholders for future navigation-history and sidebar-state features — this is not completed functionality, and none of the backing state (navigation history, sidebar-collapse state) exists anywhere yet.

The sidebar-toggle button was found to violate the same "no fake wiring" standard `References` was held to: it was enabled with no `onClick` at all — a control a user could click that would silently do nothing, worse than the two history buttons, which were at least `disabled`. Fixed by disabling it too, so all 3 controls now present consistently as unavailable rather than as working. A code comment in `Controls.tsx` records why all 3 stay `disabled` rather than one of them quietly regressing back to enabled-and-inert later.

**Disposition:** `References` — permanent removal of the fake wiring, component kept, tracked as a named future feature (not a phase — no phase assigned, same status as several other post-Phase-2 findings). `Controls` — kept in full, all 3 controls now `disabled`, tracked as placeholders for the same two not-yet-built features (navigation history, sidebar-collapse state) they always implied. Neither is dead code or a completed feature; both are named, deferred work with a clear "not yet" presented honestly to the user in the meantime.

## Closing the Six-Phase Migration Plan

Items 18-20 are fully closed. Item 21 resolved neither literally-named way ("wire" nor "delete") for `Controls` — it took a third disposition: kept, and made honestly `disabled` rather than either built out or removed. That fully closes the underlying architectural concern item 21 named for `References` and `Controls` specifically (`architecture-compliance-checklist.md`'s UI Rules: no control presenting as enabled while silently doing nothing).

**It does not close that concern app-wide.** A broader sweep run while verifying this fix — searching every `.tsx` file for a `<Button>` with neither `onClick` nor `disabled` — found 9 more, none touched by any phase of this migration: the favorite/width-fill buttons in `ResourceTopBarActions.tsx` and `ReservedFolderTopBarActions.tsx`, the "more options" buttons in `Task.tsx`/`DailyNote.tsx`/`Tag.tsx`, both action buttons in `Folder.tsx` (add, more options), and the "Start your day..." button in `DailyNotesShortcuts.tsx`. These predate this migration entirely and were never in any phase's scope — not fixed here, listed in the backlog below rather than left for the next person to rediscover from scratch.

That means `architecture-target.md`'s originally-numbered six-phase migration plan is now **complete** — every item across all six phases has a disposition, whether shipped as originally described, corrected and shipped differently, or (for the small number of sub-findings surfaced along the way) explicitly deferred to the backlog below with a named reason. "Complete" here means the plan's own scope is exhausted, not that every architectural question this migration surfaced has an implementation, and — as the sweep above shows — not that every instance of a pattern this migration cared about has been found and fixed everywhere in the app.

What's left is the backlog every prior phase's ADR has been accumulating — none of it was ever in the six-phase plan's scope, and none of it gets pulled in now:
- The `core/engine` → `application/editing/` rename, and `VaultSyncService`'s `DocumentRegistry` dependency it's tied to (ADR-012).
- `PageOperations.rename()` — no Gate operation shape exists yet (ADR-011/012).
- `createTask`/`createTag` themselves — the capability is still blocked on `TaskOperations`/`TagOperations` existing (ADR-013's referenced ADR-012 disposition); their live-UI reachability problem is fixed (Post-Migration Cleanup, Finding A).
- Move's destination-picker UI (ADR-013).
- The `Workspace` "active view" state extension the 6 deleted view-intent stubs would need to come back (ADR-014).
- `.folder.md`'s write side and root-metadata support (ADR-015).
- The 5 ESLint architectural-boundary rules — none built anywhere in this migration (ADR-015).
- Real navigation-history and sidebar-collapse state for `Controls`'s 3 placeholder controls (this ADR).
- 9 more enabled, no-op `<Button>`s app-wide, outside this migration's scope but sharing the exact defect `Controls`'s sidebar-toggle had (this ADR): `ResourceTopBarActions.tsx` (favorite, width-fill), `ReservedFolderTopBarActions.tsx` (width-fill), `Task.tsx`/`DailyNote.tsx`/`Tag.tsx` (each a "more options" button), `Folder.tsx` (add, more options), `DailyNotesShortcuts.tsx` ("Start your day...").
- The backlink/reference indexing subsystem `References` needs (this ADR).
- `DailyNotesList.tsx`'s direct `DailyNotePath` import — a minor rule-6 boundary crossing, stateless/side-effect-free, not folded into the Post-Migration Cleanup's Finding B fix (Post-Migration Cleanup, Finding C).

## Post-Migration Cleanup (Architecture v1.0 Audit)

A dedicated final audit (not a phase — see `implementation-rules.md`'s process) verified this repository directly against every governance document and found 4 findings, resolved as follows.

### Finding A — `createTask`/`createTag` disabled, not implemented or deleted

Both were live, reachable sidebar shortcuts that unconditionally threw — a real, shipped bug, not backlog. Fixed with the smallest correct change: `tasksShortcuts.config.ts`/`tagsShortcuts.config.ts` mark both entries `disabled: true`, threaded through `TasksShortcuts.tsx`/`TagsShortcuts.tsx` into `Navigation`/`Entry`'s real `disabled` prop, which short-circuits `onClick` before it ever reaches the handler. `NavigationRouter.createTask()`/`.createTag()` themselves are unchanged — still throw if ever reached some other way, matching this codebase's existing throw-on-invariant-violation style. Per explicit direction, no `TaskOperations`/`TagOperations` facade was built as part of this fix. 2 new tests confirm both entries render `aria-disabled` and never invoke their handler.

**Disposition:** the *reachability* problem is closed, permanently. The *capability* (`TaskOperations`/`TagOperations` not existing, so task/tag creation genuinely can't happen yet) remains open backlog, unchanged from ADR-012/013/014's disposition.

### Finding B — the 3 `new VaultQuery(vault)` sites fixed

`toCollectionPageModel.ts`, `DailyNotesList.tsx`, and `Sidebar.Notes.tsx` each constructed their own `VaultQuery` instead of receiving one — the exact three-component violation `ARCHITECTURE_RULES.md` rule 6 cites as its own founding historical example. `Application` now constructs one `VaultQuery` in its constructor (`application.query`), threaded down through `Sidebar.tsx` → `Sidebar.Notes.tsx`/`Sidebar.DailyNotes.tsx` → `DailyNotesList.tsx`, and through `PageHost.tsx` → `toCollectionPageModel.ts`. `DailyNotesList.tsx` keeps its `vault` prop too — still needed directly for `vault.getReservedFolder()`, which `VaultQuery` doesn't expose. Confirmed via grep: the only remaining `new VaultQuery(...)` anywhere in production code is inside `Application`'s own constructor.

**Disposition:** permanent, fully closed.

### Finding C — `DailyNotePath`'s direct import: not naturally resolved, left as noted follow-up

Fixing Finding B did not touch this — `DailyNotePath.monthIsoFromFolderNames(...)` in `DailyNotesList.tsx` is a separate, unrelated static-utility call, not a `VaultQuery` construction. Per explicit direction, left as-is rather than folded into Finding B's fix.

**Disposition:** open, minor. Lower severity than Finding B was — `DailyNotePath` is stateless, side-effect-free path formatting, not a stateful service — but technically still matches rule 6's literal regression signature (direct import of a concrete application-layer class into a feature file).

### Finding D — spec corrected to match implementation, not the reverse

Spec §11 named `Application`'s facade fields `pages`/`folders`; the shipped code has always used `pageOperations`/`folderOperations`. Per explicit direction, the frozen spec was corrected rather than renaming working code with no functional reason to change. The Startup sequence's matching `pages.open(...)` shorthand was corrected to `pageOperations.open(...)` in the same commit.

**Disposition:** permanent, fully closed.

## Why These Are Preferred

Decision 2 follows the same re-grounding pattern every phase's ADR has recorded — verify the target text against the actual code before implementing it. Decision 3 is the first case in this migration where "wire or delete" resolved to neither cleanly: a real architectural distinction (fake wiring vs. a clean, reusable, currently-unreachable component) made "keep the component, remove only the fake part" the correct answer, not a compromise between the two options originally offered.
