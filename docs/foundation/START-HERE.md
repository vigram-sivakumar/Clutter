# Resume Clutter foundation work

Last updated: 2026-11-14. Documentation revision: 0.27.
Read AGENTS.md and this file first in a new chat or agent session. It is the checkpoint, not a
second product specification. [README](README.md) identifies authoritative docs.

## Current position

Product direction has been clarified with the user. Technical architecture is
not finalized. Foundation documents, proposed ADRs and acceptance specifications
exist; production implementation has not started. The first isolated R07
qualification slice has now run, with blocking observations. R01 is complete as a bounded capability audit, with
45 entries and selected existing-test evidence. R02 now has a reviewable interaction
specification and 72 seed cases; the full catalogue remains unqualified and
Q-01–Q-09 policy review remains open.
R03 now has conditional model/API drafts, 51 logical operation signatures and 24
unexecuted contract scenarios. M-01–M-07 model gaps and Q-01–Q-09 interaction gaps
remain explicit. R04 adds a conditional persistence specification and 30 unexecuted
fault cases across P-SQL/P-ROOT/P-TEXT; PS-01–PS-07 are still open. R05 adds a conditional provider protocol, official-source feasibility record and 30
unexecuted SC scenarios. SY-01–SY-08 remain open; SY-04 coherent task reconciliation
blocks provider enablement. R06 prepared qualification contracts. R07 has two executed Linux exploratory slices and now a prepared native Mac host.
Targeted selection/origin-history alternatives pass their scoped Linux checks;
raw failures remain controls. The user has now built/launched the Mac host after
compiler correction 04 and shown four guarded-step fixture passes. The first native JSON
has now been reviewed; it matches 07 but contains no saved manual verdicts. Native table feedback confirms a new contract; implementation
and Linux regression checks were updated in 05. Patch 06 preserves the original
cell/caret/focus on handle insertion; the user reports row/column focus works.
Patch 07 implements confirmed editing/selected-cell modes and removes the rejected
Escape-to-handle behaviour. The user reports the guided mode checks work and asks
to proceed. Candidate unspecified for table checks; no full-case acceptance inferred.
Both candidates’ guided cross-view undo/redo checks are now reported working.
Exact guarded-step output/warning remains unknown. The 07 report has no manual
attempts; conversation reports and stored evidence must stay distinct.
Read [native progress](NATIVE-TEST-PROGRESS.md), [table contract](table-interaction-contract.md)
and [triple-click evidence](evidence/r07-19-2026-11-14.json). No architecture is accepted.

| Area                                  | Verified status at this checkpoint                                                                                                                                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product requirements/behaviour        | Recorded in product-contracts.md and product-behaviour.md; remaining detail gaps are explicit                                                                                                                                                              |
| Architecture/API/history/sync         | Proposed contracts, not implemented target mechanisms                                                                                                                                                                                                      |
| Technology selection                  | PM/Tiptap and local SQLite are candidates; no accepted replacement decision                                                                                                                                                                                |
| Existing test evidence                | 30 selected Linux files/1,003 assertions passed across initial and targeted reruns. Initial load errors and setup corrections are retained in inventory/evidence.                                                                                          |
| Native/platform/provider tests        | Mac build/launch and guarded-step fixture passes reported; revised NM-01 and remaining native/manual/provider work pending.                                                                                                                                |
| Documentation checks                  | Formatting, relative links, requirement/test IDs and sequential patch application checked in handoff                                                                                                                                                       |
| Existing production and old documents | Unchanged by the foundation deliveries                                                                                                                                                                                                                     |
| Remote/user checkout                  | Remote 0.9 commit 1215044 verified and matched local docs; branch safely fast-forwarded. User reports R07-01 applied; R07-02 and native R07-03 prepared; application of 02 not independently verified. No new remote commit verified or agent commit/push. |

## Repository and delivery state

Use the single branch `architecture/clutter-foundation`. Initial source baseline
was main `cae604273115c0c6c0d3ac34533b1e9834e9c778`; this is provenance, not a request
to reset to that commit. Preserve all later user commits and unrelated work.
At the R01 start, remote branch `f22a5cd182c171ae9bfaf22f7ac320019fb9a4ec`
contained the user's three documentation commits and exactly matched the local
0.3 files; this checkout was safely fast-forwarded to it. Production source is
unchanged from main `cae6042`. At R07 start, the user's remote foundation commit
`1215044bb61339a98dc128229bf31f69aab769d7` contained the exact local 0.9 docs. After
staging those matching contents, this worktree fast-forwarded to that user commit.
No stash, reset, force checkout, production merge or new agent commit/push occurred.
The earlier main advances were observed only; R01 evidence keeps its historical
baseline. R07 work is uncommitted and isolated under this folder. Inspect a new environment rather
than assume these statuses, scratch paths or installed dependencies.

Delivered patch order:

1. Initial foundation docs, revision 0.1: `Clutter-Foundation-Docs.patch` (the user
   may have downloaded it as `Clutter Foundation Docs.patch`).
2. Scope update, revision 0.2: `Clutter Foundation Scope Update.patch`.
3. Sync/roadmap/resume update, revision 0.3: `Clutter Foundation Resume Update.patch`.
4. R01 audit/checkpoint update, revision 0.4: `Clutter Foundation Capability Inventory.patch`,
   based on remote commit `f22a5cd` (the prior three are confirmed committed there).
5. R02 specification, revision 0.5: `Clutter Foundation Editor Interactions.patch`,
   incremental over the exact 0.4 inventory delivery contents.
6. R03 model/API, revision 0.6: `Clutter Foundation Model API.patch`, incremental
   over the exact 0.5 delivery contents.
7. R04 persistence, revision 0.7: `Clutter Foundation Persistence.patch`, incremental
   over the exact 0.6 delivery contents.

8. R05 provider sync, revision 0.8: `Clutter Foundation Provider Sync.patch`,
   incremental over the exact 0.7 delivery contents.

9. R06 qualification preparation, revision 0.9: `Clutter Foundation Editor Qualification.patch`,
   incremental over the exact 0.8 delivery contents.

10. R07 first experiment, revision 0.10: `Clutter R07 Two View Experiment 01.patch`,
    incremental over verified user commit 1215044 (the exact 0.9 contents).

The combined `Clutter Foundation Provider and Editor Recovery.patch` was an
alternative 0.7-to-0.9 delivery covering R05 and R06. Verified commit 1215044
contains those contents; do not reapply either route.

11. R07 blocker comparisons, revision 0.11: `Clutter R07 Editor Blocker Investigation 02.patch`,
    incremental over exact 0.10 experiment-01 contents (regardless of user commit hash).

12. R07 native host preparation, revision 0.12: `Clutter R07 Native Mac Harness 03.patch`,
    incremental over exact 0.11 experiment-02 contents. Apply 02 before this patch.

13. Native compiler correction, revision 0.13: `Clutter R07 Mac Compiler Fix 04.patch`,
    incremental over exact 0.12/patch-03 contents. User reports 03 committed as cdafd1c7.

14. Confirmed table interactions/progress, revision 0.14: `Clutter R07 Table Interaction Update 05.patch`,
    incremental over exact 0.13/patch-04 contents. Quit the old native host before rebuilding.
15. Preserve original table focus, revision 0.15: `Clutter R07 Preserve Table Focus 06.patch`,
    based on exact 05 contents.
16. Selected-cell/editing modes, revision 0.16: `Clutter R07 Table Selection Modes 07.patch`,
    based on exact 06 contents.
17. Native progress checkpoint, revision 0.17: `Clutter R07 Native Progress 08.patch`,
    documentation only over exact 07 contents; no lab rebuild required.
18. Triple-click fix and accumulated native progress, revision 0.27: `Clutter R07 Triple Click Fix 09.zip`.
    Includes verified alternative patches for exact 07 or 08; apply helper selects by preflight.
    Do not apply both alternatives. Rebuild native:mac after the fix.

Each update is incremental over its predecessor's file contents, not a particular
user-created commit hash. If this file is present at revision 0.17, do not blindly
reapply those patches. Inspect actual files and git state; do not use reset/clean,
force checkout or re-create the branch to hide divergence.

## Read order

1. [Roadmap](roadmap.md), then [R01 inventory](current-capability-inventory.md) and
   its [executed evidence](evidence/r01-2026-11-14.json).
2. [R02 interaction specification](editor-interaction-spec.md),
   [case catalogue](editor-interaction-cases.json) and policy ledger Q-01–Q-09.
3. [R03 document model](document-model-spec.md), [command API](command-api-spec.md)
   and [operation/scenario catalogue](model-api-contract-cases.json), including M-01–M-07.
4. [R04 persistence](vault-persistence-spec.md) and [failure catalogue](persistence-contract-cases.json),
   including PS-01–PS-07.
5. [R05 protocol](provider-sync-spec.md), [provider feasibility](provider-feasibility.md)
   and [SC catalogue](provider-sync-cases.json), including SY-01–SY-08.
6. [R06 editor qualification](editor-qualification-plan.md), [instances](editor-qualification-instances.json),
   [platform](platform-boundaries-spec.md), [security](local-security-api-spec.md),
   [budgets](qualification-budgets.json), [HQ cases](host-security-cases.json) and
   [readiness](qualification-readiness.md).
7. [R07 experiment](experiments/r07-two-view/README.md), [findings](experiments/r07-two-view/findings.md)
   and [first evidence](evidence/r07-2026-11-14.json), then
   [second findings](experiments/r07-two-view/follow-up-findings.md) and
   [second evidence](evidence/r07-02-2026-11-14.json). Keep candidate configurations distinct.
   Then read [Mac run guide](experiments/r07-two-view/native-macos/README.md) and
   [native preparation evidence](evidence/r07-03-2026-11-14.json).
8. [Product contracts](product-contracts.md) and [behaviour](product-behaviour.md).
9. [System architecture](system-architecture.md) and [shared API](shared-api.md).
10. [Sync/platform](sync-and-portability.md) and [history](history-and-collaboration.md).
11. [Decision register](decision-register.md), [ADRs](adr/README.md),
    [acceptance matrix](acceptance-matrix.md) and [qualification plan](qualification-spike.md).
12. [Delivery discipline](delivery-plan.md), current repository guidance and relevant
    source/tests. Old production rules remain binding until explicitly superseded.

## Guardrails for resuming

- The user explicitly permits replacing 100% of the existing implementation.
  Current Markdown interactions are not a complete
  target for new candidates. Preserve reliability and Clutter semantics, compare
  declared source/structured profiles, and do not force PM to mimic Markdown keys
  or select an engine by assuming its defaults.
- The user's clarified product scope overrides withdrawn 0.1 proposals. Use the
  current specs rather than earlier chat recommendations. Do not reopen settled
  questions unless a specific contradiction or failure requires a decision.
- All new architecture/specification documents stay in `docs/foundation/`; preserve
  old documentation. Do not rewrite root architecture rules in a documentation task.
- One shared domain API supports app/CLI/MCP. Keep canonical entity state and
  derived views separate; independent replicas/history are deliberate, not extra owners.
- Provider sync is optional and unqualified. No shared-live-SQLite approach, automatic
  merge promise, implied page-level permissions from provider-folder access, or
  assumption that background sync runs after every process exits.
- Architecture quality, reliability and UX decide choices. Record migration/effort
  for planning with zero decision weight. Existing code is evidence, not a constraint.
- Do not treat a completed specification or earlier research count as a passing
  implementation. Earlier PM focus-patch/FTS findings need original artifacts and
  reproduction; those artifacts are not embedded in this foundation pack.
- Current authorized continuation includes the isolated R07 experiment, not a
  production rebuild. Preserve unqualified tests and report blocking observations.

## Exact next action: native NM-09 triple-click fix

Read AGENTS.md and NATIVE-TEST-PROGRESS.md. User-reported earlier manual passes
are preserved. The first uploaded 07 JSON is reviewed and retained: matching build
hashes and passing fixture repetitions, but all stored manual cases not-run and
zero attempts. Do not claim those user reports are confirmed by stored verdicts.
NM-03 remains unavailable. Triple-click cell selection was then reported as a bug.

Quit the old lab with Command-Q after retaining its saved JSON. Apply the
Clutter R07 Triple Click Fix 09 bundle (the helper checks whether 07 or documentation
08 is present and applies the matching verified patch). Rebuild with native:mac.
In Experiment > Guarded step candidate select NM-09, run Fixture checks, then
triple-click Four. Expected the word's text selected in editing mode, not the
whole cell in cell-selection mode. Observe this before replacement/undo and the
Origin-aware repeat. Previously reported manual successes remain historical;
new build retest is scoped to the fix and affected interactions.

After this fix's retest, verify one manual verdict actually saves: select NM-05,
click Pass, confirm the picker says pass, then Reveal saved JSON report and review
a fresh file. The uploaded 07 report has no manual attempts and only startup
capture readiness; do not infer the current capture is broken or re-run all tests.

09 bundles all pending documentation progress since 07. Since 08 application was
never confirmed, delivery contains two verified patch alternatives, one over 07
and one over 08; its helper applies only one matching preflight and stops on
other file states. No reset/clean, force application, branch change or agent commit.

Latest Linux evidence: 61 Node checks (one raw-failure diagnostic), six support
checks, 66 table-browser candidate passes; raw unguarded structural row/column
undo failures are preserved separately. Default origin prototype now conservatively
refuses structural handle undo after foreign changes. Full semantic inverses remain
unqualified, not solved by calling every refusal a final UX. Existing native/browser
fixtures and all earlier raw evidence remain historical records.

Keep production untouched and one branch. No candidate, canonical store, framework
or provider protocol is accepted. Shared-document OS windows, full native IME/menu/
VoiceOver, schema/task lifecycle, API/durability parity and provider gates remain open.
Do not infer them from this table implementation or another candidate's checks.

## Session close protocol

At each meaningful handoff: update this checkpoint's date, completed roadmap IDs,
exact next action, verified evidence/limitations and actual branch/patch status.
Update roadmap statuses and changelog in the same change. Link specifications and
run artifacts rather than duplicate their rules here. Never mark tests passed
without execution, or assume that the user applied a patch because it was delivered.

## Reusable new-chat instruction

> Continue Clutter foundation work on architecture/clutter-foundation. Read
> docs/foundation/START-HERE.md, then follow its read order and current roadmap task.
> Inspect git state and repository guidance first. Preserve existing work, stay on
> this branch and keep new documentation under docs/foundation/. Report what is
> confirmed, proposed and tested separately. Follow the checkpoint's authorized
> scope; do not restart product discovery or implement a production rebuild by assumption.
