# 16 — Validation Report (Phase 0)

This report is a skeptical re-verification pass over reports 00–15, performed *after* the original investigation and *before* any implementation work. It treats every prior finding as a hypothesis, not a fact, and re-derives each one directly from the current source tree rather than trusting the original reports' citations. Four independent validation passes were run, grouped by impact tier, each explicitly instructed to catch staleness, overstatement, or incomplete evidence rather than confirm what was already written:

- **Pass 1 (Critical)** — reports 15, 09, 07
- **Pass 2** — reports 11, 12, 06
- **Pass 3** — reports 01–05
- **Pass 4** — reports 13, 14 (and their underlying sources in 07/08/11)

Verified at commit `d368a64` (clean working tree at time of validation). No application source code was modified during validation.

## Headline Result

**Nothing in the original investigation was fabricated, reversed, or contradicted by current code.** Every citation checked resolved to matching content in the current source. Where this pass earned its keep was not correcting errors of direction, but correcting errors of **completeness and degree**: two findings turned out to be broader/worse than originally scoped, two open questions left as "Unknown" are now definitively resolved, two numeric claims were off, and one framing claim (Vault's fan-out being "narrow") turned out to be backwards. This is exactly the outcome a validation phase exists to produce — the original reports' methodology and overall picture hold up; a handful of specific claims needed sharpening before being acted on.

---

## Recommendation & Finding Status Table

| # | Finding / Recommendation | Origin | Status | Priority | Action |
|---|---|---|---|---|---|
| 1 | Aliases frontmatter data-loss bug (silently dropped on save) | 07, 15 Tier 0 | ✅ Confirmed | Critical | Proceed — fix is trivial (2-field change) but note: serializer needs a multi-line-list branch for `aliases`, mirroring the parser's existing special case, not a flat `key: value` append |
| 2 | Rule 10 violation: `MoveService`, `VaultSyncService`, `DailyNoteService`, `Vault.getReservedFolder` do path-string manipulation outside `VaultPath` | 09, 15 Tier 1 #5 | ⚠️ Partially Confirmed — **scope larger than reported** | High | Proceed, but re-scope: add `MoveService` (2 more sites: lines 21, 58), `Vault.moveFolder` (lines 445, 467 — explicitly named in the rule's own rationale as a historical offender, wrongly implied clean), `PagePathResolver.ts`, `FolderPathResolver.ts` (both previously "Likely compliant, not verified" per report 11 — now confirmed **non-compliant**). Migration surface is ~9 files, not 4 |
| 3 | `NavigationRouter` spec-vs-code drift (6 methods missing, `createTask`/`createTag` throw despite spec saying delete) | 06, 09, 15 Tier 1 #6 | ✅ Confirmed | Medium | Proceed — amend spec text (trivial); separately resolve whether any live UI can reach the throwing stubs before deciding whether to delete them too (still open, see below) |
| 4 | No ESLint configuration exists anywhere in the repo | 15 | ✅ Confirmed (independently re-verified repo-wide, not just `apps/app/`) | Top (meta) | Proceed — this remains the single highest-leverage recommendation; note rollout risk of false positives against already-documented exceptions (e.g. `DailyNoteService`'s Rule 1 exception) |
| 5 | `getReservedFolder` spec/code optionality mismatch (`Folder` vs `Folder \| undefined`) | 07 | ✅ Confirmed | Low | Proceed — amend spec to `Folder \| undefined` (code's defensive null-checks are the more correct contract; both call sites already handle it) |
| 6 | `Workspace.activePageId`/`activeFolderId` type mismatch (`string \| undefined` spec vs. `string \| null` code) | 06, 12 | ✅ Confirmed | Low | Proceed — amend spec to `string \| null` |
| 7 | Rule 2 (one write path through Gate) — PASS | 09 | ✅ Confirmed exactly | — | No action, spot-check clean |
| 8 | Rule 6 (UI never constructs application-layer services) — PASS | 09 | ✅ Confirmed exactly | — | No action, spot-check clean |
| 9 | Rule 7 (dependencies point downward) — PASS | 09 | ⚠️ Partially Confirmed — conclusion right, wording imprecise | Trivial | Tighten report 09's sentence from "zero imports from `core/` into `features/`" to "zero **value** imports" (type-only imports do exist and are correctly permitted) |
| 10 | No React Context exists for domain data (prop-drilling only) | 11 | ✅ Confirmed exactly | — | No action |
| 11 | Fan-out counts: Workspace (7), PageOperations (3), FolderOperations (1), VaultQuery (7), NavigationRouter (6) | 11 | ✅ Confirmed exactly, all five | — | No action |
| 12 | Fan-out count: Vault (5 non-test consumers) | 11 | ❌ **Not Reproducible as stated** — true count is ~10 under the report's own consistent methodology | Medium | Correct report 11's count and its "narrow fan-out... consistent with rule 3" framing — Vault's real blast radius is comparable to Workspace's, not narrower. Not a rule violation, but a mischaracterization worth fixing before anyone uses this framing to deprioritize Vault-shape-change review |
| 13 | `DailyNotesList.tsx` value-imports `DailyNotePath` (not type-only) | 09, 11 | ✅ Confirmed | Low | Proceed as scoped — small, low-risk cleanup |
| 14 | `NavigationRouter` never touches `Workspace` directly (only via `FolderOperations.open()`) | 06 | ✅ Confirmed | — | No action |
| 15 | Two independent by-path indexes: `Vault.pagesByPath` vs `PageIndex.pagesByPath` | 07, 12 | ✅ Confirmed | Medium | Proceed, but note new risk found: unifying them would create a new `core/vault/knowledge/` → `core/vault/models/` `Vault`-class coupling that doesn't exist today (currently `PageIndex` only depends on model *types*) — check against Rule 7 before implementing |
| 16 | Tags/Tasks read raw `Vault`; Notes/DailyNotes read via `VaultQuery` (a two-way inconsistency) | 04, 05, 12 | ⚠️ Partially Confirmed — **actually a three-way inconsistency** | Medium | Proceed, but re-scope: `Sidebar.DailyNotes.tsx` takes **both** `Vault` and `VaultQuery` props, not `VaultQuery` alone. No sidebar area is fully consistent; standardizing on `VaultQuery` is still the right target, and DailyNotes is already halfway there |
| 17 | `Workspace.refresh()`'s single call site's compliance with spec §10's two-condition contract | 06 (left as **Unknown**) | ✅ **Now Confirmed compliant** | — | Resolved — remove from open-questions list. Both conditions independently verified against `PageOperations.ts:260-334` |
| 18 | Whether `Workspace.test.ts` exists | 06 (left as **Unknown**) | ✅ **Now Confirmed absent** — no such file exists anywhere in the repo, and no other test asserts the mutual-exclusivity invariant directly | Medium | New, concrete action item: write `Workspace.test.ts` covering the mutual-exclusivity invariant and subscriber notification, per spec §10's own testing-strategy requirement |
| 19 | Two case-mismatched CSS imports (`Badge.tsx`/`Checkbox.tsx`) + `.adge--outlined` typo | 03 | ✅ Confirmed byte-for-byte | Critical (Tier 0) | Proceed immediately |
| 20 | `editor.css`'s import/dead-code status | 01 (left as the single highest-uncertainty open question) | ✅ **Now definitively resolved: dead code**, not a live production bug | Medium (downgraded from urgent) | Delete the file, or wire it up if the visual features it describes (node bullets, collapse ring, selection halo, indentation) are in fact missing from the shipped editor today via some other mechanism — that narrower question is the one remaining follow-up, not "is it imported" |
| 21 | `useMenuKeyboard.ts` has 7 unguarded `console.log` calls | 03 | ⚠️ Partially Confirmed — **actual count is 5, not 7** (confirmed independently by two separate passes) | Trivial | Proceed — delete all 5; direction and severity unchanged, only the count was wrong |
| 22 | Double-`var()` bug in `theme.css` (`--tab-active`, dark + light blocks) | 01 | ✅ Confirmed, exact lines | Trivial | Proceed |
| 23 | ~40% of icon registry (23/57) unused | 02 | ✅ Confirmed (5/5 spot-checked icons had zero consumers; full count not re-derived exhaustively but sample fully consistent) | Low | Proceed as scoped |
| 24 | No emoji/icon picker UI exists despite full data-model support | 02 | ✅ Confirmed | Product decision | Needs a product answer, not an engineering fix |
| 25 | Tags/Tasks sidebar rows are fully inert (`onClick={() => {}}`, `Checkbox` has no `onCheckedChange`) | 04, 05 | ✅ Confirmed, including the exact no-op mechanism | Product/UX | Proceed with the cheap "inert" visual-state fix (report 15 Tier 3 #9) |
| 26 | `Checkbox` primitive has no accessible-name mechanism | 03 | ✅ Confirmed | Medium | Proceed |
| 27 | `button--muted` is an unreachable variant, used only via raw `className` bypass | 03 | ✅ Confirmed | Low | Proceed — add `'muted'` as a real variant or replace the bypass |
| 28 | Notes vs. Daily Notes overflow-menu item-set asymmetry (`duplicate`/`add-to-favorite` missing for Daily Notes, no rationale comment) | 05 | ✅ Confirmed — no in-code rationale found, unlike every other Notes/Daily-Notes divergence | Product decision | Confirm with product whether intentional |
| 29 | `Vault.refreshProjections()` full-vault rebuild on every mutation | 07, 13 | ✅ Confirmed | Medium (Tier 2) | Proceed with parent-indexed map recommendation |
| 30 | `VaultQuery` methods are unmemoized O(n) scans, all 8 methods | 07, 13 | ✅ Confirmed, zero exceptions across full file read | Medium (Tier 2) | Proceed |
| 31 | `useVault`'s subscription re-renders the whole shell on any mutation | 11, 13 | ✅ Confirmed, and **broader than stated** — a second, independent unscoped `useVault` subscription exists inside `useActivePage` (called from `PageHost.tsx`), not just the one at `AppLayout` | Medium | Proceed; note actual re-render fan-out is slightly wider than originally described |
| 32 | No virtualization/memoization in `FolderTree`/`DailyNotesList`/`toCollectionPageModel` | 04, 08, 13 | ✅ Confirmed, zero matches in all three files | Low (pre-emptive) | No action needed at current scale; revisit if vault size grows |
| 33 | No perf/benchmark test exists anywhere (broadened to whole repo incl. Rust) | 07, 13 | ✅ Confirmed repo-wide, TS and Rust side both checked | Medium | Proceed — build the synthetic large-vault fixture |
| 34 | No parent-indexed map (`Map<parentId, Page[]>`) exists in `Vault` | 07, 13, 14 | ✅ Confirmed | Medium | Proceed — this is the single root-cause fix for findings 29/30 combined |
| 35 | `Workspace` has no filtered/virtual-view state (only `activePageId`/`activeFolderId`) | 10, 14 | ✅ Confirmed independently of ADR-014's own description | Top (product) | Proceed — fund as its own phase per report 10's recommendation |
| 36 | ADR-014 "Decision 4" exists and names the six deleted view-intent methods as blocked on the `Workspace` gap | 10 | ✅ Confirmed — direct quote verified against the ADR file | — | No action; citation is sound |

---

## Changes to Investigation

### Findings Withdrawn
**None.** No finding from reports 00–15 was found to be false, reversed, or contradicted by current code across all four validation passes.

### Findings Strengthened (worse/broader than originally scoped)
- **Rule 10 violation (path-string confinement)** — the migration surface is roughly double what report 09 scoped: `MoveService` has 7 offending sites, not 5; `Vault.moveFolder` itself is a live violation despite `ARCHITECTURE_RULES.md`'s own rule-10 rationale naming it as a historical offender and report 09 implying it was now clean; `PagePathResolver.ts` and `FolderPathResolver.ts` — the two files report 11 explicitly left as "Likely compliant, not independently re-verified" — are confirmed **non-compliant** on direct inspection, with zero `VaultPath` usage in either file.
- **`useVault`'s re-render fan-out** — a second, independent unscoped subscription exists inside `useActivePage` (nested under `PageHost`), not just the one at `AppLayout`'s level as originally described. The finding's direction (whole-shell, unscoped re-render on any mutation) is unchanged but understates the actual fan-out.

### Findings Requiring Correction (numeric or framing errors)
- **Vault's fan-out count** — report 11 claims 5 non-test consumers; a re-grep applying the report's own consistent methodology (the same exclusion rules used for every other subsystem) finds 10, including five UI-layer sidebar files the original grep missed. This inverts report 11's own characterization: Vault's blast radius is **comparable to, not narrower than**, Workspace's.
- **Tags/Tasks vs. Notes/DailyNotes read-access split** — originally framed as "two consistent patterns, one outlier pair." Actually a three-way split: Tags/Tasks read raw `Vault` only; Notes reads `VaultQuery` only; `Sidebar.DailyNotes.tsx` takes **both** props and uses both. No sidebar area is fully self-consistent.
- **`useMenuKeyboard.ts` console.log count** — claimed 7, actual 5 (confirmed independently by two separate validation passes with matching results). Likely caused by miscounting a multi-line call's line range as multiple calls.

### Findings Newly Resolved (previously left as "Unknown")
- **`Workspace.refresh()`'s compliance with spec §10's two-condition contract** — report 06 explicitly left this open. Now resolved: fully compliant. Both conditions independently verified by reading the actual call site (`PageOperations.updateDraftTitle`, `PageOperations.ts:260-334`) and its sole caller (`PageHost.tsx:178`).
- **Whether `Workspace.test.ts` exists** — report 06 explicitly left this open. Now resolved: **it does not exist anywhere in the repository**, and no other test file asserts the mutual-exclusivity invariant directly (spot-checked `FolderOperations.test.ts`, which exercises `Workspace` incidentally but only asserts one side of the invariant in any given test). This is a new, concrete, actionable gap.
- **`editor.css`'s dead-code-vs-live-bug status** — report 01's single highest-uncertainty open question. Now resolved via an exhaustive repo-wide search (static imports, dynamic `import.meta.glob`, Storybook configs, a second workspace/package, a second Vite entry — all checked and ruled out): it is dead code, not a silently-broken live stylesheet. All six referenced custom properties are undefined everywhere in the repo outside their own usage inside the dead file.

### Newly Discovered Findings (surfaced by validation, not present in the original 16 reports)
- `Vault.moveFolder` (lines 445, 467) does raw path-string slicing on both folder and page paths during descendant rewriting — a live Rule 10 violation in a method `ARCHITECTURE_RULES.md` itself names as a historical offender.
- `PagePathResolver.ts` and `FolderPathResolver.ts` are confirmed non-compliant with Rule 10 (previously unverified, assumed likely-clean on the strength of an ADR-015 citation).
- A second, independent unscoped `useVault` subscription exists inside `useActivePage`, widening the re-render fan-out beyond what report 11/13 described.
- `Sidebar.DailyNotes.tsx` mixes raw `Vault` and `VaultQuery` props rather than being a clean `VaultQuery`-only example, making the sidebar read-access inconsistency three-way rather than two-way.
- Report 09's Rule 7 evidence sentence ("zero imports from `core/` into `features/`") is technically inaccurate as literally written (type-only imports do exist); the underlying architectural claim (no *value* imports) is correct and the report should be reworded, not retracted.

---

## Updated Architecture Backlog

This supersedes report 15's tier list as the single source of truth for implementation sequencing, incorporating every correction above.

### Tier 0 — Fix Immediately (unchanged from report 15, all fully re-confirmed)
1. Fix aliases frontmatter data-loss bug (note the multi-line serialization wrinkle found in Pass 1, finding 1).
2. Fix the two case-mismatched CSS imports + `.adge--outlined` typo.
3. Delete the (5, not 7) `console.log` calls in `useMenuKeyboard.ts`.
4. Delete `theme.css`'s two dead double-`var()` declarations.

### Tier 0.5 — Newly Resolved, Cheap (promoted by this validation pass)
5. **Delete `apps/app/src/design-system/styles/editor.css`** — confirmed dead code via exhaustive repo-wide search. If the visual features it describes (node bullets, collapse ring, selection halo, child indentation) are in fact missing from the shipped editor today, that's a separate, narrower follow-up (check whether those visuals are implemented elsewhere) — but the "is this file live" question is closed.
6. **Add `Workspace.test.ts`** covering the mutual-exclusivity invariant and subscriber notification — confirmed to not exist anywhere, a direct gap against spec §10's own stated testing strategy. Cheap: `Workspace` is synchronous, single-threaded, dependency-free.

### Tier 1 — Fix Soon (re-scoped)
7. **Close the Rule 10 violation — expanded scope.** Extend `VaultPath` with join/split primitives and migrate all ~9 confirmed sites: `MoveService.ts` (7 sites, not 5), `VaultSyncService.ts`, `DailyNoteService.ts`, `Vault.ts` (`getReservedFolder` **and** `moveFolder`'s descendant-rewrite logic — the latter is new), `PagePathResolver.ts`, `FolderPathResolver.ts` (both newly confirmed non-compliant). Treat `Vault.moveFolder`'s site with extra care — it sits inside a multi-step, order-sensitive mutation, unlike the other, simpler composition/split call sites.
8. Reconcile `NavigationRouter` spec-vs-code drift (amend spec text for both the 6 missing methods and the 2 forbidden-but-present stubs). Separately: confirm whether any live UI can reach `createTask`/`createTag`'s throwing stubs before deciding whether to also delete them (still genuinely open — no pass in this validation resolved it, since it requires an exhaustive UI reachability trace not in any of the four passes' scope).
9. Amend the two trivial spec/code type mismatches (`getReservedFolder`, `Workspace.activePageId`/`activeFolderId`).
10. Tighten report 09's Rule 7 wording ("zero imports" → "zero value imports").
11. Correct report 11's Vault fan-out count and "narrow fan-out" framing.

### Tier 2 — Fund as a Scoped Phase (unchanged priority, one re-scoped item)
12. Fund the `Workspace` view-state extension (Smart Collections/Virtual folders/Pinned-view blocker) — fully re-confirmed, unchanged priority.
13. Add a parent-indexed map to `Vault` + the repo's first perf benchmark — fully re-confirmed, unchanged priority.
14. Converge the two independent by-path indexes (`Vault.pagesByPath`/`PageIndex.pagesByPath`) — re-confirmed, but flag the new `core/vault/knowledge/` → `core/vault/models/` coupling risk found in Pass 2 before implementing (check against Rule 7).
15. **Resolve the sidebar read-access inconsistency — re-scoped as three-way, not two-way.** `Sidebar.DailyNotes.tsx` needs to drop its raw `Vault` prop in addition to Tags/Tasks adopting `VaultQuery`; DailyNotes is already halfway migrated, which slightly lowers the effort versus the original two-way framing.

### Tier 3 — Product/UX Decisions (unchanged, all re-confirmed)
16. Close the Tags/Tasks/Search "looks done, isn't" gap.
17. Decide the icon/emoji picker roadmap question.
18. Decide the Trash/recoverable-delete priority question.
19. Confirm whether the Notes/Daily-Notes overflow-menu asymmetry (`duplicate`/`add-to-favorite`) is intentional.
20. Treat Plugins and Collaboration as "write the ADR first" items.

### Still Genuinely Open (not resolved by this validation pass — flag for a future Pass 5 or implementation-time check)
- Whether any live UI element can reach `NavigationRouter.createTask()`/`createTag()`'s throwing stubs (item 8 above).
- The full 23/57 dead-icon count (5/5 spot-checked, not exhaustively re-derived).
- Whether the visual features `editor.css` describes are implemented via some other live mechanism, now that the file itself is confirmed dead.
- ESLint rollout risk against already-documented rule exceptions (e.g. `DailyNoteService`'s Rule 1 exception) — flagged by Pass 1 as a real but unmeasured implementation risk for recommendation #4.

---

## Confidence Level

Every status in the table above reflects a fresh, independent read of current source performed by this validation pass, not an inherited citation. Where a pass's own evidence was incomplete (e.g., the full 23-icon dead count, or `createTask`/`createTag` UI-reachability), this report says so explicitly rather than rounding up to Confirmed.

## Next Investigation Areas

1. Resolve `NavigationRouter.createTask()`/`createTag()`'s UI-reachability question before deciding whether to delete the throwing stubs.
2. Re-derive the full 23/57 dead-icon list exhaustively (only 5 were spot-checked).
3. After Tier 0/0.5/1 items land, run a fresh, lightweight Pass 5 limited to whatever changed — a validation report has the same staleness risk as the investigation it validates, and should not be treated as permanently authoritative once implementation begins.
