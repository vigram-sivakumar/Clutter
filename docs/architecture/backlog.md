# Architecture Backlog

The single source of truth for architectural work on Clutter. Every item here is a validated finding from `investigation/00-15` as corrected/confirmed by `investigation/16-validation-report.md`. This supersedes the tier lists inside `investigation/15-final-recommendations.md` and `investigation/16-validation-report.md`'s own "Updated Architecture Backlog" section — those documents remain as historical record of *how* these priorities were derived; this file is what gets worked from going forward.

Per `contributing.md`: every architectural change requires a backlog item, and every completed item must be recorded in `implementation-log.md` before being marked Done here.

**Status values**: `Not Started` | `In Progress` | `Blocked` | `Done` | `Deferred`

---

## ARCH-001 — Fix aliases frontmatter data-loss bug

- **Description**: `FrontmatterSerializer.serializePage()` never re-emits `aliases` frontmatter, and `PageFrontmatter`'s TS interface has no `aliases` field, despite `AliasExtractor`/`PageBuilder`/`PageRebuilder`/`PageIndex` all reading and indexing it. The first app-initiated save of a page with hand-authored `aliases:` frontmatter silently deletes them.
- **Origin report**: `investigation/07-data-model.md`
- **Validation status**: ✅ Confirmed (`16-validation-report.md` #1)
- **Priority**: Critical
- **Complexity**: Small — but not purely additive. The serializer's other fields are flat `key: value`; `aliases` needs a multi-line-list serialization branch mirroring the parser's existing special-cased read path.
- **Architectural risk**: Low — purely additive to the serializer's field list; no existing behavior changes for pages without aliases.
- **Dependencies**: None.
- **Acceptance criteria**: A page with `aliases:` frontmatter round-trips through save without data loss; `PageFrontmatter` interface includes `aliases`; a round-trip test (extend `DocumentRoundTrip.test.ts` per report 07's citation) asserts aliases survive a save.
- **Status**: Not Started

---

## ARCH-002 — Fix case-mismatched CSS imports (Badge, Checkbox) and outlined-variant typo

- **Description**: `Badge.tsx` imports `./badge.css`; the file on disk is `Badge.css`. `Checkbox.tsx` imports `./checkbox.css`; the file on disk is `Checkbox.css`. Both fail to resolve on case-sensitive filesystems. Separately, `Badge.css:91` has `.adge--outlined` (missing the leading `b`), so the documented `outlined` badge variant renders unstyled.
- **Origin report**: `investigation/03-design-system.md`
- **Validation status**: ✅ Confirmed byte-for-byte (`16-validation-report.md` #19)
- **Priority**: Critical
- **Complexity**: Trivial — three one-line fixes.
- **Architectural risk**: None.
- **Dependencies**: None.
- **Acceptance criteria**: Import statements match on-disk filenames exactly; `.adge--outlined` corrected to `.badge--outlined`; a build on a case-sensitive filesystem (Linux CI) succeeds.
- **Status**: Not Started

---

## ARCH-003 — Remove unguarded `console.log` calls in `useMenuKeyboard.ts`

- **Description**: 5 (not 7, per validation) unguarded `console.log` calls fire on every arrow-key/Enter/Space menu interaction in production.
- **Origin report**: `investigation/03-design-system.md`
- **Validation status**: ⚠️ Partially Confirmed — direction and severity correct, count corrected from 7 to 5 (`16-validation-report.md` #21)
- **Priority**: Critical (trivial cost)
- **Complexity**: Trivial.
- **Architectural risk**: None.
- **Dependencies**: None.
- **Acceptance criteria**: Zero `console.log` calls remain in `useMenuKeyboard.ts`; menu keyboard navigation behavior unchanged.
- **Status**: Not Started

---

## ARCH-004 — Delete dead double-`var()` declarations in `theme.css`

- **Description**: `--tab-active: var(var(--state-active))` (invalid, double-wrapped) appears in both the dark (`theme.css:73`) and light (`theme.css:198`) blocks, immediately followed by a correct redeclaration a few lines later that wins by cascade. The broken lines are dead but a landmine for the next editor.
- **Origin report**: `investigation/01-design-tokens.md`
- **Validation status**: ✅ Confirmed, exact lines (`16-validation-report.md` #22)
- **Priority**: Critical (trivial cost)
- **Complexity**: Trivial.
- **Architectural risk**: None.
- **Dependencies**: None.
- **Acceptance criteria**: Both broken declarations removed; tab active-state styling unchanged (verified visually or via snapshot).
- **Status**: Not Started

---

## ARCH-005 — Delete dead `editor.css`

- **Description**: `apps/app/src/design-system/styles/editor.css` is confirmed dead code via exhaustive repo-wide search (static imports, dynamic `import.meta.glob`, Storybook configs, second workspace/Vite entry — all ruled out). Its 6 referenced custom properties (`--node-bullet`, `--interactive-disabled`, `--lh-body-medium`, `--node-collapse-ring`, `--node-halo-border`, `--margin-24px`) are undefined everywhere in the repo outside their own usage inside this file.
- **Origin report**: `investigation/01-design-tokens.md`
- **Validation status**: ✅ Confirmed dead code — this was the investigation's single highest-uncertainty open question, now definitively resolved (`16-validation-report.md` #20)
- **Priority**: Medium (downgraded from urgent now that "silent production bug" is ruled out)
- **Complexity**: Trivial to delete — but see acceptance criteria for the one remaining open question.
- **Architectural risk**: Low, contingent on the acceptance-criteria check below.
- **Dependencies**: None.
- **Acceptance criteria**: Before deleting, confirm whether the visual features this file describes (node bullets, collapse ring, selection halo, child indentation) are implemented via some other live mechanism in the shipped document editor. If yes, delete `editor.css` outright. If no, this becomes a separate, differently-scoped item (implement or consciously drop those visuals) rather than a simple deletion — do not close this item without that check.
- **Status**: Not Started

---

## ARCH-006 — Add `Workspace.test.ts`

- **Description**: No test file for `Workspace` exists anywhere in the repository, and no other test asserts the mutual-exclusivity invariant (`activePageId` XOR `activeFolderId`) directly. Spec §10 explicitly calls for unit tests covering this invariant and subscriber notification.
- **Origin report**: `investigation/06-navigation.md` (left as "Unknown"), resolved by `investigation/16-validation-report.md`
- **Validation status**: ✅ Confirmed absent — newly resolved from "Unknown" (`16-validation-report.md` #18)
- **Priority**: Medium
- **Complexity**: Small — `Workspace` is synchronous, single-threaded, dependency-free.
- **Architectural risk**: None (adding a test cannot regress behavior).
- **Dependencies**: None.
- **Acceptance criteria**: A `Workspace.test.ts` exists asserting: (1) `openPage` clears `activeFolderId`, (2) `openFolder` clears `activePageId`, (3) subscribers are notified on each mutation, (4) `toggleFolderExpanded`/`isFolderExpanded` round-trip correctly.
- **Status**: Not Started

---

## ARCH-007 — Close the Rule 10 (path-string confinement) violation — expanded scope

- **Description**: Path-string manipulation (splitting, template-literal composition) occurs outside the designated `VaultPath` helper in more places than originally scoped. Confirmed sites: `MoveService.ts` (7 sites, not the originally-cited 5), `VaultSyncService.ts`, `DailyNoteService.ts`, `Vault.ts` (`getReservedFolder` **and** `moveFolder`'s descendant-path-rewrite logic — the latter newly discovered by validation, despite `ARCHITECTURE_RULES.md` itself naming `moveFolder` as a historical offender), `PagePathResolver.ts`, `FolderPathResolver.ts` (both newly confirmed non-compliant — previously assumed likely-clean per an ADR-015 citation that turned out not to hold on direct inspection).
- **Origin report**: `investigation/09-application-architecture.md`, `investigation/07-data-model.md`, `investigation/11-dependency-graph.md`
- **Validation status**: ⚠️ Partially Confirmed — core claim correct, original scope understated (`16-validation-report.md` #2)
- **Priority**: High
- **Complexity**: Medium — mechanically similar substitutions across ~9 files, no new subsystem required. `Vault.moveFolder`'s site needs extra care (multi-step, order-sensitive mutation across folder + all descendant folders + all descendant pages).
- **Architectural risk**: Low functionally (pure refactor, same string outputs expected) but the `Vault.moveFolder` site specifically carries moderate risk given its order-sensitivity — needs dedicated test coverage before/after.
- **Dependencies**: Should extend `VaultPath` with join/split primitives (its own doc comment already anticipates this) before migrating call sites.
- **Acceptance criteria**: All ~9 confirmed sites use `VaultPath` exclusively for path-string operations; zero `.split('/')`/template-literal path composition remains outside `vault/ingest/VaultPath.ts` and `platform/` (`vault/providers/`); existing move/archive/restore/sync tests pass unchanged.
- **Status**: Not Started

---

## ARCH-008 — Reconcile `NavigationRouter` spec-vs-code drift

- **Description**: Spec §8 lists 9 methods; only 3 (`openArchive`, `openInbox`, `openTemplates`) are implemented. The spec explicitly states `createTask`/`createTag` should be deleted from this class — they exist instead as throwing stubs (`Error('...is not implemented.')`), disclosed via ADR-012 but never reconciled back into the spec text.
- **Origin report**: `investigation/06-navigation.md`, `investigation/09-application-architecture.md`
- **Validation status**: ✅ Confirmed (`16-validation-report.md` #3)
- **Priority**: Medium
- **Complexity**: Trivial for the spec-text amendment. The separate question of whether to delete the throwing stubs is blocked — see dependencies.
- **Architectural risk**: None for the spec-text fix. Deleting the stubs risks a compile error at any currently-unconfirmed UI call site.
- **Dependencies**: Before deleting `createTask`/`createTag`, must resolve whether any live UI can reach them (not resolved by any validation pass — see `investigation/16-validation-report.md`'s "Still Genuinely Open" section).
- **Acceptance criteria**: `docs/architecture-specification.md` §8 accurately reflects either the shipped method list or an explicit "not yet built" note for the 6 missing methods, and either documents `createTask`/`createTag`'s stub status or reflects their removal.
- **Status**: Not Started

---

## ARCH-009 — Amend two trivial spec/code type mismatches

- **Description**: (a) Spec §3 specifies `getReservedFolder(kind): Folder` (non-optional); shipped code returns `Folder | undefined`, and both call sites already null-check defensively. (b) Spec §10 specifies `activePageId`/`activeFolderId` as `string | undefined`; shipped code uses `string | null`, and all consumers already agree with the code.
- **Origin report**: `investigation/07-data-model.md`, `investigation/06-navigation.md`
- **Validation status**: ✅ Confirmed, both (`16-validation-report.md` #5, #6)
- **Priority**: Low
- **Complexity**: Trivial — two one-line spec text edits. Code changes are not recommended (the code's contract is the more correct/defensive one in both cases).
- **Architectural risk**: None.
- **Dependencies**: None.
- **Acceptance criteria**: Spec text matches shipped type signatures for both `getReservedFolder` and `Workspace.activePageId`/`activeFolderId`.
- **Status**: Not Started

---

## ARCH-010 — Correct report 09's Rule 7 evidence wording

- **Description**: Report 09 states "zero imports from `core/` into `features/`" as Rule 7 evidence. This is technically inaccurate — type-only imports from `core/` into `features/` do exist and are correctly permitted (matching the pattern already used correctly in the same report's Rule 6 section). The underlying architectural claim (no *value* imports) is correct; the sentence should say so explicitly.
- **Origin report**: `investigation/09-application-architecture.md`
- **Validation status**: ⚠️ Partially Confirmed — conclusion correct, wording imprecise (`16-validation-report.md` #9)
- **Priority**: Trivial
- **Complexity**: Trivial — documentation wording fix only.
- **Architectural risk**: None.
- **Dependencies**: None.
- **Acceptance criteria**: `investigation/09-application-architecture.md`'s Rule 7 section reads "zero value imports" rather than "zero imports."
- **Status**: Not Started

---

## ARCH-011 — Correct report 11's `Vault` fan-out count and framing

- **Description**: Report 11 claims `Vault` has 5 non-test consumers outside `core/vault/`, described as "narrow fan-out... consistent with rule 3." A re-grep applying the report's own consistent methodology finds ~10, including 5 UI-layer sidebar files the original grep missed. This inverts the report's own characterization — `Vault`'s blast radius is comparable to, not narrower than, `Workspace`'s.
- **Origin report**: `investigation/11-dependency-graph.md`
- **Validation status**: ❌ Not Reproducible as originally stated (`16-validation-report.md` #12)
- **Priority**: Medium
- **Complexity**: Trivial — documentation correction.
- **Architectural risk**: None directly, but the mischaracterization could lead a future contributor to under-scrutinize `Vault`-shape changes on the mistaken belief its fan-out is narrow.
- **Dependencies**: None.
- **Acceptance criteria**: `investigation/11-dependency-graph.md`'s `Vault` fan-out count and consumer list corrected to match the validated ~10-file count; "narrow fan-out" framing removed or corrected.
- **Status**: Not Started

---

## ARCH-012 — Fund the `Workspace` view-state extension

- **Description**: `Workspace` has exactly two mutually-exclusive scalar fields (`activePageId`, `activeFolderId`) and no concept of a filtered/virtual "view." ADR-014 Decision 4 already designed and then explicitly declined to build six view-level navigation intents for exactly this reason, calling the needed work "sized closer to a phase of its own." This single gap is the shared blocker for Smart Collections, Virtual folders, and a dedicated Pinned-pages destination.
- **Origin report**: `investigation/10-product-architecture.md`, `investigation/14-scalability.md`
- **Validation status**: ✅ Confirmed, including direct verification of ADR-014's own text (`16-validation-report.md` #35, #36)
- **Priority**: Top (product-architecture)
- **Complexity**: Large — this is a scoped phase, not a single change. Requires a `Workspace` API extension (new "active view" state) plus corresponding `VaultQuery` filtered-read methods.
- **Architectural risk**: Medium — touches a subsystem with wide fan-out (see ARCH-011); must preserve the existing mutual-exclusivity invariant while adding a third navigation-target concept.
- **Dependencies**: Should land after ARCH-006 (Workspace test coverage) so the existing invariant is protected before extending the class. Should be estimated and funded as its own deliverable before Smart Collections/Virtual folders/Pinned-view are estimated individually.
- **Acceptance criteria**: A design/ADR for the `Workspace` view-state extension exists and is accepted before implementation begins; the extension does not regress the existing mutual-exclusivity invariant; at least one of the three dependent features (Smart Collections, Virtual folders, Pinned view) can be built against it without a second `Workspace` change.
- **Status**: Not Started

---

## ARCH-013 — Add a parent-indexed map to `Vault`; establish the first performance benchmark

- **Description**: Every `VaultQuery` method (`getChildPages`, `getFavoritePages`, `getArchivedPages`, `getRootFolders`, etc.) is an unmemoized O(n) scan over the whole vault. `Vault.refreshProjections()` rebuilds tag/task projections from every page on every single mutation. No parent-indexed structure (`Map<parentId, Page[]>`) exists anywhere. No perf/benchmark test exists anywhere in the repo (TS or Rust side).
- **Origin report**: `investigation/07-data-model.md`, `investigation/13-performance.md`, `investigation/14-scalability.md`
- **Validation status**: ✅ Confirmed, all sub-claims independently re-verified including the repo-wide (not just `core/vault/`) absence of any benchmark file (`16-validation-report.md` #29–#34)
- **Priority**: Medium (Tier 2 — not urgent at current "hundreds of pages" scale, but cheap now and expensive to retrofit under pressure later)
- **Complexity**: Medium — one additive, fully-disposable (Rule 8-compliant) index maintained incrementally alongside `Vault`'s existing id/path maps, plus a new synthetic-fixture benchmark test.
- **Architectural risk**: Low — the index remains fully rebuildable from source, consistent with Rule 8 ("derived data is disposable").
- **Dependencies**: None technically, but should precede any `Workspace` view-state work (ARCH-012) that adds new filtered-view queries, since those will otherwise inherit the same O(n)-scan pattern from day one.
- **Acceptance criteria**: A `Map<parentId, Page[]>`-shaped index exists and is maintained incrementally; `VaultQuery.getChildPages`/`getChildFolders` use it instead of a full scan; a benchmark test exists against a synthetic large-vault fixture (recommend starting at 10,000 pages) establishing a baseline for future regression detection.
- **Status**: Not Started

---

## ARCH-014 — Converge the two independent by-path indexes

- **Description**: `Vault.pagesByPath` and `PageIndex.pagesByPath` (`core/vault/knowledge/PageIndex.ts`) are two separate, non-shared structures. `PageIndex` is rebuilt fresh on every lazy-projection invalidation-then-access cycle, duplicating work `Vault`'s own map already does.
- **Origin report**: `investigation/07-data-model.md`, `investigation/12-simplification-opportunities.md`
- **Validation status**: ✅ Confirmed (`16-validation-report.md` #15)
- **Priority**: Medium
- **Complexity**: Medium — `PageIndex` currently depends only on model *types*, not the `Vault` class; unifying the two indexes would introduce a new `core/vault/knowledge/` → `core/vault/models/` coupling that does not exist today.
- **Architectural risk**: Medium — must check the new coupling against Rule 7 (dependencies point downward) before implementing, not after. This was a risk newly surfaced by validation, not present in the original recommendation.
- **Dependencies**: Consider sequencing after ARCH-013 (parent-indexed map), since both touch `Vault`'s indexing strategy and are cheaper to design together than sequentially.
- **Acceptance criteria**: A single by-path index exists (either `PageIndex` derives from `Vault.pagesByPath`, or the alias/filename lookups are folded into `Vault` itself); the layering direction is confirmed compliant with Rule 7 before merge, documented explicitly in the PR.
- **Status**: Not Started

---

## ARCH-015 — Resolve the sidebar read-access inconsistency (three-way, not two-way)

- **Description**: Originally framed as "Tags/Tasks read raw `Vault`; Notes/DailyNotes read via `VaultQuery`." Validation found this is a three-way split: Tags/Tasks read `Vault` only; Notes reads `VaultQuery` only; `Sidebar.DailyNotes.tsx` takes **both** props and uses both. No sidebar area is fully self-consistent.
- **Origin report**: `investigation/04-components.md`, `investigation/05-ux-behaviors.md`, `investigation/12-simplification-opportunities.md`
- **Validation status**: ⚠️ Partially Confirmed — real inconsistency, originally understated as two-way (`16-validation-report.md` #16)
- **Priority**: Medium
- **Complexity**: Small — DailyNotes is already halfway migrated (already takes `VaultQuery`), which lowers the effort versus the original framing. Tags/Tasks need `VaultQuery`-equivalent methods for `vault.tags()`/`vault.tasks()` if none already exist.
- **Architectural risk**: Low — read-only query surface, no write-path changes.
- **Dependencies**: Verify `VaultQuery` has (or can cheaply gain) equivalent methods for `tags()`/`tasks()` before starting.
- **Acceptance criteria**: All four sidebar areas (Notes, DailyNotes, Tags, Tasks) read exclusively through `VaultQuery`; no sidebar component takes a raw `Vault` prop.
- **Status**: Not Started

---

## ARCH-016 — Close the Tags/Tasks/Search "looks done, isn't" UX gap

- **Description**: Tags and Tasks sidebars render fully-styled, hover-responsive lists via the same components used everywhere else, but every interaction is a no-op — the `Task` checkbox is enabled-looking with no handler at all. Search is a live, clickable sidebar tab whose entire content is placeholder text. All deliberate (ADR-012/013/014/016) but the shipped UI gives no signal distinguishing "not built" from "broken."
- **Origin report**: `investigation/04-components.md`, `investigation/05-ux-behaviors.md`, `investigation/08-feature-architecture.md`
- **Validation status**: ✅ Confirmed, including the exact no-op mechanism (`16-validation-report.md` #25)
- **Priority**: Product/UX decision required before implementation
- **Complexity**: Small — a purely visual "inert" state on the affected rows/tab, no facade work required.
- **Architectural risk**: None.
- **Dependencies**: None technically; does not need to wait for `TagOperations`/`TaskOperations` to land.
- **Acceptance criteria**: A user can visually distinguish "not yet built" from "broken" on the Tags, Tasks, and Search tabs without reading source code.
- **Status**: Not Started (blocked on product sign-off, not engineering)

---

## ARCH-017 — Decide the icon/emoji picker roadmap question

- **Description**: `PageMetadata.icon`/`FolderMetadata.icon` is fully modeled, persisted, round-tripped, and test-covered, but no UI anywhere lets a user set it.
- **Origin report**: `investigation/02-icons.md`
- **Validation status**: ✅ Confirmed (`16-validation-report.md` #24)
- **Priority**: Product decision
- **Complexity**: N/A until scoped.
- **Architectural risk**: N/A.
- **Dependencies**: Product decision precedes any engineering estimate.
- **Acceptance criteria**: A documented product decision exists — either an icon/emoji picker is scoped as a near-term feature, or the "external file editing only" stance is explicitly documented as intentional.
- **Status**: Not Started (blocked on product decision)

---

## ARCH-018 — Decide the Trash/recoverable-delete priority question

- **Description**: Delete is currently permanent and unrecoverable by design. Architecturally small to add (a new `'trash'` Gate operation kind, same shape as the existing `'archive'` kind) but is a real product-trust question, not purely an engineering one.
- **Origin report**: `investigation/08-feature-architecture.md`, `investigation/10-product-architecture.md`
- **Validation status**: Not independently re-verified by any validation pass (informational/product finding, no code claim to check)
- **Priority**: Product decision
- **Complexity**: Medium once scoped (new Gate operation kind, restore facade method, retention/expiry policy, UI).
- **Architectural risk**: Low — follows the existing `archive` shape, no new subsystem.
- **Dependencies**: Product decision precedes engineering estimate.
- **Acceptance criteria**: A documented product decision exists on whether Trash is prioritized, and at what relative priority to Version History (report 10 notes these solve different problems despite looking similar to a user).
- **Status**: Not Started (blocked on product decision)

---

## ARCH-019 — Confirm whether the Notes/Daily-Notes overflow-menu asymmetry is intentional

- **Description**: The Note overflow menu includes `duplicate` and `add-to-favorite`; the Daily Note overflow menu omits both, with no in-code rationale comment — unlike every other Notes/Daily-Notes divergence in the codebase, which is consistently explained.
- **Origin report**: `investigation/05-ux-behaviors.md`
- **Validation status**: ✅ Confirmed — exact item-set difference reproduced, absence of rationale comment confirmed (`16-validation-report.md` #28)
- **Priority**: Product decision (low urgency)
- **Complexity**: Trivial once decided (add or remove the two menu items).
- **Architectural risk**: None.
- **Dependencies**: None.
- **Acceptance criteria**: Product confirms whether the asymmetry is intentional; if not, the menu config is updated; if so, a rationale comment is added matching the pattern used for every other divergence.
- **Status**: Not Started (blocked on product decision)

---

## ARCH-020 — Treat Plugins and Collaboration as "write the ADR first" roadmap items

- **Description**: Both fail `implementation-rules.md` §5's "would require inventing a new architecture" test. Plugins has no placeholder anywhere in the architecture docs (unlike Cloud Sync/Version History, which are named, scoped gaps). Collaboration directly conflicts with the Persistence Gate's single-writer assumption.
- **Origin report**: `investigation/10-product-architecture.md`
- **Validation status**: Not independently re-verified by any validation pass beyond the underlying `Workspace`/Gate facts already confirmed under ARCH-012/ARCH-007's evidence.
- **Priority**: Roadmap governance
- **Complexity**: N/A — this item's "acceptance criteria" is a governance rule, not a code change.
- **Architectural risk**: High if skipped — any estimate for either feature given without an ADR first is not grounded in real scope.
- **Dependencies**: None.
- **Acceptance criteria**: Neither Plugins nor Collaboration is added to `roadmap.md` as an estimated feature; both, if and when prioritized, enter as "write the ADR proposing the new architecture" work items first.
- **Status**: Not Started (standing governance rule, not a discrete task)

---

## ARCH-021 — Stand up ESLint import-boundary enforcement

- **Description**: No ESLint configuration exists anywhere in the repository (confirmed independently, repo-wide, not just `apps/app/`). Every one of the twelve architecture rules that `ARCHITECTURE_RULES.md` describes as having "the target mechanical enforcement" is currently enforced by code-review convention alone. The one confirmed rule violation in the codebase (ARCH-007, Rule 10) is direct evidence of what convention-only enforcement predictably produces at scale — and validation found it was even more widespread than the original review scoped, which is itself further evidence for this item's priority.
- **Origin report**: `investigation/15-final-recommendations.md` (top recommendation), `investigation/09-application-architecture.md`
- **Validation status**: ✅ Confirmed independently, repo-wide (`16-validation-report.md` #4)
- **Priority**: Top (meta — ranked above individual bug fixes because it is the one change that keeps every other fix in this backlog from silently drifting again)
- **Complexity**: Medium — standing up `eslint-plugin-boundaries` (or equivalent) and writing rules for at least Rules 2, 3, 6, and 7 (the four with the clearest mechanical shape), then wiring into CI.
- **Architectural risk**: Low-to-moderate rollout risk — a new import-boundary config will likely generate false positives against already-documented, deliberate exceptions (e.g. `DailyNoteService`'s Rule 1 exception, the `DailyNotePath` value-import in `DailyNotesList.tsx`) that need explicit allowlisting before the rule can ship clean.
- **Dependencies**: None technically, but sequencing it before ARCH-007 (Rule 10 migration) means the migration's own completeness can be verified mechanically rather than by manual grep.
- **Acceptance criteria**: ESLint is configured and run in CI; at minimum, Rules 2 (Gate-only writes), 3 (Vault mutation confinement), 6 (UI never constructs application-layer services), and 7 (downward-only dependencies) are mechanically enforced; known deliberate exceptions are explicitly allowlisted, not silently passing; a rule violation fails CI, not just code review.
- **Status**: Not Started

---

## Deferred / Not Yet Backlogged

The following were flagged by `investigation/16-validation-report.md` as genuinely unresolved and require further investigation before they can become backlog items with acceptance criteria:

- Whether any live UI element can reach `NavigationRouter.createTask()`/`createTag()`'s throwing stubs (blocks the "delete the stubs" half of ARCH-008).
- The full 23/57 dead-icon count in `iconRegistry.ts` (only 5 were spot-checked during validation; report 12's pruning recommendation should wait for the exhaustive list).
- ESLint rollout risk against already-documented rule exceptions (e.g. `DailyNoteService`'s Rule 1 exception) — relevant to a future backlog item for standing up import-boundary lint enforcement, not yet written up as its own item pending that risk assessment.
