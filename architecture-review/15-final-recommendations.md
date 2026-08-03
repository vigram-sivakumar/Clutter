# 15 — Final Recommendations

Synthesis report, written last, after reports 00–14. This is the action-oriented output of the whole investigation: what to do, in what order, and why. Every item is traced to its originating report(s); nothing here is a new claim not already established elsewhere in this review.

## The One Fact That Changes the Risk Picture

Reports 08, 09, 10, and 14 each independently flagged the same open question: whether any ESLint import-boundary configuration exists to mechanically enforce the rules `ARCHITECTURE_RULES.md` repeatedly describes as having "the target mechanical enforcement" (Rules 2, 3, 4, 6, 7). **This investigation checked directly: no ESLint configuration exists anywhere in this repository** (`find` for any `eslint*` file, repo-wide, returns nothing; confirmed by the absence of any lint script producing meaningful output in `apps/app/package.json`). **Verified.**

This matters more than any single bug found in this review. Every one of the 12 architecture rules that report 09 found passing does so **today, by convention and code-review discipline alone** — a genuinely impressive result given the codebase's size, but one with zero mechanical backstop. Rule 10's violation (below) is not a one-off lapse; it is what convention-only enforcement predictably produces at scale, and it is the closest thing this investigation found to a leading indicator for how the other 11 rules will erode if contributor count or velocity increases without this gap being closed.

**This is the top recommendation of the entire investigation, ranked above every individual bug fix below**: stand up ESLint import-boundary rules for at least Rules 2, 3, 6, and 7 (the four with the clearest mechanical shape — restricting `writeFile`/`deleteFile`/`moveFile` and `Vault` mutation-method call sites to `vault/persistence`/`vault/sync`; banning `new` on application-layer classes outside `Application.ts`; enforcing the downward-only layer diagram). This single investment protects the return on everything else this architecture has already gotten right.

## Tier 0 — Fix Immediately (build-breaking or data-loss, near-zero cost)

1. **Fix the aliases data-loss bug.** (Report 07.) `FrontmatterSerializer.serializePage()` never re-emits `aliases` frontmatter, so the first app-initiated save of a page with hand-authored `aliases:` silently deletes them. Add `aliases` to the serializer's field list and to `PageFrontmatter`'s TS interface. Confirm with a features/UX pass (report 07's own flagged follow-up) whether any UI path can currently write aliases — if yes, this is not latent, it's live, and should be treated as a hotfix.

2. **Fix the two case-mismatched CSS imports** (`badge.css`→`Badge.css`, `checkbox.css`→`Checkbox.css`) **and the `.adge--outlined` typo.** (Report 03.) Plausible build break on any case-sensitive filesystem (Linux CI, most Docker). Trivial to fix, should be checked against actual CI logs first (report 03's own flagged next step) to confirm whether this is already failing silently somewhere.

3. **Resolve `editor.css`'s import status.** (Report 01.) Either it's imported from somewhere this investigation didn't find (in which case six undefined custom properties — `--node-bullet`, `--interactive-disabled`, etc. — are producing broken editor node-bullet/halo/indentation styling in production today) or it's ~190 lines of dead code. This is the single highest-uncertainty, potentially-highest-impact unresolved question in the whole design-system audit and should be the first thing whoever owns the document editor checks.

4. **Remove the 7 `console.log` calls in `useMenuKeyboard.ts`.** (Report 03.) Zero cost, currently firing on every menu interaction in production.

## Tier 1 — Fix Soon (architecture-rule violations with clear fixes)

5. **Close the Rule 10 (path-string confinement) violation.** (Reports 07, 09, 11.) `MoveService.ts`, `VaultSyncService.ts`, `DailyNoteService.ts`, and `Vault.ts` (`getReservedFolder`) all do path-string splitting/composition outside the designated `VaultPath` helper — and `ARCHITECTURE_RULES.md`'s own rule-10 rationale already names most of these files as historical offenders from a prior audit that only partially completed. Extend `VaultPath` with the join/split primitives its own doc comment already anticipates, migrate the four sites, and confirm `PagePathResolver`/`FolderPathResolver` (flagged as **Likely** but not directly re-verified — report 11's own gap) are actually clean rather than taken on the strength of an ADR's claim.

6. **Reconcile `NavigationRouter`'s spec-vs-code drift.** (Reports 06, 09, 10.) Six spec'd view-filter methods (`openFavorites`, `openAllNotes`, etc.) don't exist; two spec-forbidden methods (`createTask`/`createTag`) do exist, as throwing stubs. Both halves have real, disclosed rationale (unbuilt product surfaces; ADR-012's deliberate disposition) but neither has been reconciled back into the frozen spec's text, which currently reads as simply wrong on both counts. Write the spec amendment — this is cheap (it's a documentation fix) and directly serves the "spec is the source of truth" premise the whole documentation set depends on.

## Tier 2 — Fund as a Scoped Phase (real work, but narrow and already-designed)

7. **Fund the `Workspace` view-state extension.** (Report 10, its own top recommendation; report 14.) This is the single highest-leverage architectural investment available on the current roadmap: it is the shared, named blocker for Smart Collections, Virtual folders, and a dedicated Pinned-pages destination simultaneously (ADR-014 Decision 4 already scoped and then explicitly declined this work as "sized closer to a phase of its own"). Scheduling these three as independent backlog items risks solving the same problem three times or once-but-underfunded. This should be estimated and funded as one deliverable before any of the three dependent features is estimated individually.

8. **Add a parent-indexed structure to `Vault`.** (Reports 07, 13, 14.) `getChildPages`/`getChildFolders` and every `VaultQuery` method currently do a full O(n) scan of the entire vault, on every call, with no memoization; every mutation triggers a full projection rebuild rather than an incremental one. Fine today ("hundreds" of pages, the codebase's own explicitly stated design point), unmeasured at scale, and fixable with one additive, fully-disposable (Rule 8-compliant) index — a `Map<parentId, Page[]>` maintained incrementally alongside the existing id/path maps. Pair this with the repo's first perf benchmark test (report 13's recommendation 4) so this stops being a "Likely"/"Hypothesis" finding and becomes a tracked number.

## Tier 3 — Product/UX Decisions (need a product owner, not just an engineer)

9. **Close the Tags/Tasks/Search "looks done, isn't" gap.** (Reports 04, 05, 08.) Tags and Tasks sidebars render fully-styled, hover-responsive lists via the same components used everywhere else in the app, but every interaction is a no-op — worse, the `Task` checkbox is enabled-looking with no handler at all, which is a worse signal than a disabled control. Search is a live, clickable sidebar tab whose entire content is the string "Work inprogress...". None of this is accidental (ADR-012/013/014/016 all disclose it), but the current shipped UI gives a user no way to distinguish "not built yet" from "broken." A cheap, purely-visual "inert" state on these rows/tab — no facade work required — would close the perception gap immediately, independent of when `TagOperations`/`TaskOperations` actually land.

10. **Decide, explicitly, whether an icon/emoji picker is on the roadmap.** (Report 02.) `PageMetadata.icon`/`FolderMetadata.icon` is fully modeled, persisted, round-tripped, and test-covered — but there is no UI anywhere to set it. This is either a near-term gap to close or a deliberate "external file editing only" product stance that should be documented as such rather than left ambiguous.

11. **Decide whether Trash (recoverable delete) is a near-term priority.** (Reports 08, 10.) Delete is currently permanent and unrecoverable by design (`docs/durability-model.md` states this explicitly: "no path back"). Report 10 flags this as arguably higher product-trust priority than several roadmap items ahead of it, and notes the fix is architecturally small — a new `'trash'` Gate operation kind, same shape as the existing `'archive'` kind, not a new subsystem.

12. **Treat Plugins and Collaboration as "write the ADR first" roadmap items, not estimated features.** (Report 10.) Both fail `implementation-rules.md` §5's own "would require inventing a new architecture" test — Plugins has no placeholder anywhere in the docs (unlike Cloud Sync/Version History, which are named, scoped gaps); Collaboration directly conflicts with the Persistence Gate's single-writer assumption at its foundation. Any estimate given for either today, without that ADR first, is not grounded in real scope.

## What Not to Touch

Repeated across multiple reports as things that are working correctly and should not be "fixed": the deliberate Notes/Daily-Notes behavioral divergence (report 05); the 12-primitive design-system's current scope (reports 01–03); the knowledge-graph/embeds/aliases projections existing ahead of a UI consumer (reports 07, 09 — genuinely Rule-8-compliant, not dead code); the prop-drilling-over-context wiring pattern (report 11 — a legitimate, explicit choice at the app's current size, not a gap). Simplification pressure should not be applied to any of these.

## Sequencing Rationale

Tier 0 items are cheap and risk-asymmetric (data loss, build breaks) — fix regardless of anything else. The ESLint recommendation is ranked above all of Tier 1–2 despite being "meta" because it's the single change that makes every other fix in this report durable rather than a one-time correction that will drift again. Tier 1 items are narrow, already-scoped corrections to known drift. Tier 2 is real, fundable work with a known shape — the value of doing this investigation was precisely to make Tier 2's scope legible before it's estimated, per report 10's own framing. Tier 3 requires a product decision this investigation cannot and should not make unilaterally; it surfaces the decision, not the answer.

## Confidence Level

Every recommendation above is a direct restatement of a **Verified** or **Strong Evidence** finding from reports 00–14, with the single exception of the ESLint-absence fact, which was independently confirmed by direct filesystem search during the writing of this report (see "The One Fact That Changes the Risk Picture," above) rather than inherited from an earlier report.

## Closing Note

The most important meta-finding of this entire investigation is not any individual bug: it is that **Clutter's architecture governance is unusually good relative to its enforcement.** The specification, the twelve rules, the ADR trail, and the durability vocabulary are not aspirational documentation — reports 07, 08, 09, and 11 each independently verified rule compliance against source and found the documentation's claims almost entirely true. That is rare, and it is the reason this investigation could produce concrete, high-confidence findings instead of speculation. The gap this review surfaces is not "the architecture is wrong" — it is "the architecture is right, and currently held up by review discipline alone, in a codebase that will outgrow what review discipline alone can catch." Closing that gap (recommendation 0, above) is what makes every other finding in this review stay true a year from now instead of becoming report 16's opening paragraph.
