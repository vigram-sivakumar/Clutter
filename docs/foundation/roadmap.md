# Foundation roadmap

Revision 0.56, 2026-11-16. This roadmap describes work and dependencies; the current
checkpoint/authorization is in [START-HERE](START-HERE.md). Product scope is in
product-contracts.md, not independently redefined here.

## Current deliverable — H01 host/runtime qualification contract32

[Normative contract](runtime-qualification/contract.json), [guide/inventory](runtime-qualification/README.md):
Tauri/Electron shortlist + Swift/WK control with identical independent Node/Core;
12 required cases,Space-size recipes and trial targets fixed before comparison.
No built candidate, benchmark, actual Mac reference binding or shipping selection.

NEXT user applies32 and supplies safe host inventory JSON.33 binds exact host/
versions/instruments →34 matched builds →35 controlled Mac comparison →36 scoped
ADR or explicit blocked result. No further broad research or manual NC28 replay.
Original budgets preserved; full mixed-product workloads/real-data G-Q stay blocking.

Scoped I1 is complete per [review](i1/completion-review.md);80 prior automated cases,
TS/84 regressions and guided NC28 passes are historical, not new H01 executions.

## Historical deliverable — I1b media implementation27

[Media27](i1/media-result.md) implements media.import/replace/remove/list/read in
the same Core/catalogue. Immutable external objects precede SQL association commits;
historical/protected closure is retained and indexes audited against engine links.
Cover replacement is explicit/atomic; notes/tasks use the same operations.19 new
cases pass (63 runtime total), strict TS and old media12/page10/entity14/Node84 pass.
11 new real publication/SQL process-death trials pass. Shared helpers moved once;
no new dependencies/lock changes, old evidence/main/app/user data untouched.

Next: targeted native composition contract/build with browser-safe codec wiring,
actual image/PDF/cover presentation and resource/close lifecycle. Pending media
requests/selected bytes are not protected by EditorSession; resolve/journal them
before host close. No native/security/general decoder/inline placement/production
qualification follows from API tests. I1/G-Q remain open; no broad manual replay.

## Historical deliverable — I1b editor implementation26

[Editor26](i1/editor-result.md) adds real EditorSession/context API, actual PM/Y
EditorViews in a jsdom composition and SQLite protected-draft storage.23 new cases
plus21 I1a runtime cases, strict TypeScript and84 old Node cases pass. Tests include
peer isolation, two views/undo/remount, missed hints, exact unknown-result retries,
failed-save/protection close guards, explicit recovery and4 process-death trials.
No browser/native/geometry/window-close/IME/flush or production acceptance follows.

Next I1b media operations in the same Core/catalogue and immutable Vault/platform
ports; then supported targeted browser/native qualification. I1 and real-vault G-Q
are still open. No new architecture search or broad old manual replay. Retention/
release/GC, production grant lifecycle and complete layout state remain gated.

## Historical deliverable — I1a implementation25

F009 is adopted for disposable implementation only. [I1a](i1/result.md) implements
one typed catalogue, PageOperations/Core service, portable client, desktop draft
session, SQLite multi-root commit adapter and CLI/MCP stdio adapters.21 new tests
and strict TypeScript pass. Existing app/user data untouched. I1 is partial.

Next I1b binds actual per-page EditorViews/context grants/updates/history/protection,
then immutable-media operations through the same Core API and atomic Vault port.
Supported browser/native execution remains required for that changed route; no
broad replay of the old manual session. G-Q still blocks real-vault cutover/release.
Root workspace lock changes register the private package only, no dependencies.

## Historical deliverable — proof24 and I1 entry plan

[PK01–10](r08-page-closure.md) pass headlessly through shared planners/Store commits:
per-page writes, atomic task move, coherent old/current task/cover snapshots,
transitive pins/leases,10 crash boundaries plus interrupted import and API parity.
Regressions: entity14/media12/Node84/two old headless ports/one native-metadata port.
No new native/browser or performance result. Aggregate controls stay intact.
Next: [scoped implementation entry](implementation-entry.md), Proposed F009, then
shared Core/API plus disposable desktop/CLI/MCP page slice. Actual per-page editor
binding/protection is part of I1, not inferred from PK. No production/user-vault
cutover until existing G-Q native/runtime/format/budget/security/migration gates.
Historical progress below records earlier checkpoints, not current next actions.

## Progress and next deliverables

| ID  | State                                                                                                                                                                                                                            | Work and output                                                                                                                                                                                                          | Depends on                | Exit evidence                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R00 | Documentation prepared                                                                                                                                                                                                           | Foundation pack 0.1–0.43: confirmed scope, ownership/API proposals, ADRs, initial test/spike specifications and resumable handoff                                                                                        | User clarification        | Remote 0.9 user commit verified at 1215044; R07 prepared, no agent commit/push                                                                                                     |
| R01 | Complete — 2026-11-14                                                                                                                                                                                                            | [Inventory](current-capability-inventory.md): 45 source/wiring capability entries with target mapping                                                                                                                    | R00                       | [Selected run](evidence/r01-2026-11-14.json): 30 files/1,003 assertions passed across initial/targeted runs; initial load errors/setup corrections and static/target gaps explicit |
| R02 | Draft prepared; policy review open                                                                                                                                                                                               | [R02](editor-interaction-spec.md) and [case catalogue](editor-interaction-cases.json): 72 shared/profile seed contracts, not execution                                                                                   | R01                       | 60 shared, 10 profile proposals, 2 confirmed table cases; other Q policies/variation qualification remain open                                                                     |
| R03 | Conditional drafts prepared; review open                                                                                                                                                                                         | [Model](document-model-spec.md), [API](command-api-spec.md) and [registry/scenarios](model-api-contract-cases.json): semantic identity, placement, closure and logical signatures                                        | R01; consume R02          | DM-01–DM-15, 51 operation sketches and 24 unexecuted scenarios; M-01–M-07/Q-01–Q-09 and full wire/encoding qualification remain                                                    |
| R04 | Conditional draft prepared; qualification open                                                                                                                                                                                   | [Persistence spec](vault-persistence-spec.md) and [PF catalogue](persistence-contract-cases.json): backend commit/ack, roots, history/recovery/outbox and failure contracts                                              | R03 draft                 | P-SQL/P-ROOT/P-TEXT compared; 30 unexecuted fault cases and PS-01–PS-07 open; no backend/native proof                                                                              |
| R05 | Conditional draft prepared; qualification open                                                                                                                                                                                   | [Protocol](provider-sync-spec.md), [feasibility](provider-feasibility.md) and [SC cases](provider-sync-cases.json): lifecycle, packages, ordering and ownership gates                                                    | R03/R04 drafts            | 30 unexecuted scenarios; SY-01–SY-08 open, SY-04 ownership blocker; official sources reviewed, no real-provider proof                                                              |
| R06 | Conditional drafts prepared; experiment setup open                                                                                                                                                                               | [Editor qualification](editor-qualification-plan.md), [platform](platform-boundaries-spec.md), [security](local-security-api-spec.md), [budgets](qualification-budgets.json) and [readiness](qualification-readiness.md) | R02–R05 drafts            | 102 seed/timing instances + 16 probes, 18 HQ scenarios, all not-run; candidate locks/native environment and relevant policy decisions still required                               |
| R07 | Two scoped slices executed; table modes and guided cross-view undo/redo reported working; native report reviewed; NM-09 saved passes/captures verified; VoiceOver deferred; matched history gate green; bounded durable owner proof passes | [Isolated experiment](experiments/r07-two-view/README.md) and [Mac guide](experiments/r07-two-view/native-macos/README.md); native build/input and provider work remain                                                  | R06                       | Latest Linux: 84 Node checks, 66 table + 21 selection + 11 origin passes; raw diagnostics retained. Reported native table substeps pass; full parity unqualified                   |
| R08 | Review prepared; bounded joined G-J passed; native/model gates open                                                                                                                                                                                                                          | Architecture baseline review and accepted/superseding ADRs                                                                                                                                                               | R07 for related scope     | Compare complete combinations; resolve blockers; identify every affected existing rule before production changes                                                                   |
| R09 | Planned; production work requires explicit scope                                                                                                                                                                                 | Implement one production vertical slice across app/CLI/MCP, two views, task identity, persistence/history/recovery                                                                                                       | R08                       | Contract tests, native input, failures and code review demonstrate agreed behaviour                                                                                                |
| R10 | Planned                                                                                                                                                                                                                          | Expand initial feature coverage, detailed UI specs and release qualification; enable only qualified opt-in providers                                                                                                     | R09                       | Declared release matrix passes; no untested provider/Windows support claims                                                                                                        |
| R11 | Deferred                                                                                                                                                                                                                         | Live cloud collaboration/page-sharing roles and automatic backup feature as separately scoped increments                                                                                                                 | New product/service phase | T-22/T-23 and new security/hosting contracts before enabling; not initial blockers                                                                                                 |

R00 means the documents were prepared, not that G0 inventory or architecture
qualification is complete. R03–R06 produce reviewable proposals; experiments may
require their revision. Do not write an immutable complete spec and disregard
contradicting runtime evidence. Work on independent specification details may
overlap, but dependent technical choices remain gated.

## R01 review package and R02 input

The [inventory](current-capability-inventory.md) now records the capability map, conflicts between old docs and live source, known
coverage gaps, proposed ownership mapping and remaining decisions that actually
affect R02/R03. Avoid a new broad questionnaire. Resolve routine details from
confirmed contracts; ask one focused question only for a material product gap.

## Definition of ready for qualification

Fixtures have exact expected results; schema/commands and persistence outcomes
are explicit; candidate versions are pinned; histories/assets/undo have owners;
performance budgets and failure points are named. macOS test availability is known,
with blocked native results reported honestly. Provider transport tests cannot
substitute for native editor tests or vice versa.

## Definition of ready for production

Related acceptance contracts have evidence; core correctness blockers are resolved;
ADRs state accepted choices/trade-offs and replacement of existing rules; scoped
UI/error states and command signatures are reviewable. Clean up/reject experimental
alternatives explicitly; do not wire competing implementations into production.

## Maintenance

Use Planned / Next / In progress / Blocked / Complete / Deferred with evidence
links and dates. A completed draft is not a qualified capability. Keep the exact
next task in START-HERE aligned with this table. This is a dependency roadmap,
not invented calendar estimates or a commitment to every proposed filename.

R01 completion means the bounded inventory was delivered, not a passing full-suite
or native acceptance result. Initial load failures/resolved setup and source-level task
projection freshness risk remain visible. R02 draft is prepared with policy review open. R03 conditional schema/API drafts
are prepared. R04 persistence/history/outcome/outbox draft is prepared. R05 provider draft is prepared. R06 preparation is drafted. R07 first slice ran; native/broader semantic qualification preparation
is next; preserve
M-01–M-07 and Q-01–Q-09 rather than choosing defaults silently. Production work
is still gated.

The user's latest clarification explicitly rejects treating current Markdown
interactions as the target for every candidate. R02 profiles keep that distinction
visible. R02 approval and R07 execution are different gates; the drafted catalogue
is not proof that an engine passes, and exploratory profile comparison is allowed.

R03 completion here is draft preparation, not implementation readiness or accepted
canonical encoding. The operation catalogue is a logical signature registry, not
a working API. Qualify retries, failure atomicity and reconstructable history in
R04/R07 before accepting a storage baseline or publishing adapter contracts.

R04 is specification preparation, not fault-injection execution or a selected
backend. R05 proposes provider ordering/tombstone/baseline rules and preserves SY-04 coherence as a blocker;
its files must not be interpreted as an active shared SQLite database. Actual native
and provider support remain R07 evidence gates after detailed contracts/budgets.

R06 supplied proposed budgets and concrete scenario expansion, not a ready locked
candidate or native execution. [Readiness](qualification-readiness.md) identifies
entry conditions for scoped exploration versus binding acceptance. The current
implementation may be replaced completely; no engine or framework is mandatory.

R07's first slice is exploratory evidence, not completion of R07. The raw history
candidate fails nested-origin undo, and immediate final-cell Tab fails both the
two-view integration and raw control. [Findings](experiments/r07-two-view/findings.md)
are release/selection blockers; a green core diagnostic is not acceptance.

Second-slice [findings](experiments/r07-two-view/follow-up-findings.md) and
[evidence](evidence/r07-02-2026-11-14.json) demonstrate targeted alternatives; they
do not repair or accept the raw composition. Preserve controls and compare complete
capabilities, native behaviour and costs before R08. No provider CRDT merge or
production persistence decision is implied by local origin-aware history tests.

A separate native host/checklist/report runner is prepared in revision 0.12. The
Swift/AppKit build and all native cases remain unexecuted on this Linux host. User
Mac execution is the next evidence step; [preparation evidence](evidence/r07-03-2026-11-14.json)
records helper/regression checks without treating them as native acceptance.

The user attempted the first native build and reported Swift property/actor errors.
[Patch 04 evidence](evidence/r07-04-2026-11-14.json) records targeted source corrections;
Mac compilation/launch then succeeded, as recorded in the native progress log.

Revision 0.17 implements the [confirmed table contract](table-interaction-contract.md).
[Native progress](NATIVE-TEST-PROGRESS.md) records build/fixture observations and the
revised NM-01 retest. New [Linux evidence](evidence/r07-06-2026-11-14.json) preserves
raw structural undo failures while guarding normal candidates. Native/full R07
qualification and architecture acceptance remain separate.

Patch 06 preserves the original active table cell, caret/selection and focus when
adding either axis. Linux regression is recorded; native focus retest is next.

Revision 0.17 adds the confirmed editing/selected-cell modes and removes the
rejected Escape-to-handle shortcut. User reports 06 row/column focus works; no
full native case or candidate-wide acceptance inferred. [07 evidence](evidence/r07-07-2026-11-14.json)
records Linux regressions and the next native mode check.

Revision 0.17 records guided native table-mode passes from the user conversation
(candidate unspecified, no JSON reviewed) and advances the current action to
NM-02 cross-view undo. This is a documentation-only checkpoint, not a new lab build
or completed R07 gate. [Progress evidence](evidence/r07-08-2026-11-14.json).

Revision 0.18 records the guided FOREIGN undo/redo variation as user-reported
working in both candidates. Guarded-step exact result/refusal and JSON are not
reviewed; other history variations remain open. Next: NM-03 input-source
availability, then real native composition, or NM-04 if unavailable. No code or
new automated test execution; next delivery must account for unconfirmed patch 08.

Revision 0.19 records native composition as unavailable (no enabled input source)
and four guarded-step native menu Undo/Redo substeps as user-reported passes.
Next is Origin-aware menu routing. Native IME/full focus/editor qualification
remains open; no lab code or automated test rerun. See [progress](evidence/r07-10-2026-11-14.json).

Revision 0.20 records the same native menu Undo/Redo checks as user-reported passed
in Origin-aware too. Next is NM-04 menu dismissal with original-caret preservation,
then window focus. Native composition remains unavailable; no full NM-04 or
architecture acceptance. [Progress](evidence/r07-11-2026-11-14.json).

Revision 0.21: menu-dismissal paragraph-caret checks reported successful in both
candidates; next is NM-04 window-switch focus. No full case/architecture acceptance.
[Progress](evidence/r07-12-2026-11-14.json). Local docs only; lab07 unchanged.

Revision 0.22: both directional candidate-window View B caret-restoration checks
reported passed. Next is NM-05 backward selection replacement, then undo.
[Progress](evidence/r07-13-2026-11-14.json). No new lab source or automated run.

Revision 0.23: backward-selection replacement/undo reported passed in both
candidates. Next NM-05 external formatted paste. [Progress](evidence/r07-14-2026-11-14.json).
No new lab source or automatic execution; native composition remains unavailable.

Revision 0.24: external bold paste and Paste and Match Style reported passed in
both candidates. Next NM-05 plain cut/paste between A/B.
[Progress](evidence/r07-15-2026-11-14.json). Local docs only; lab07 unchanged.

Revision 0.25: cross-view cut/paste and rich/plain-style table replacements reported
working in both candidates. Next table paste undo, then saved report review.
[Progress](evidence/r07-16-2026-11-14.json). Local docs only; lab07 unchanged.

Revision 0.26: final table-paste undo reported passed in both candidates, completing
the guided clipboard sequence. Capture/review saved native report before remaining
NM-06–NM-08 checks. [Progress](evidence/r07-17-2026-11-14.json). No full matrix acceptance.

Revision 0.27 reviews the first native 07 report: exact build/source hashes and
passing fixture repetitions; no saved manual verdicts or later ready capture.
Conversation successes remain separate. Triple-click selecting a cell is
reproduced/fixed in both candidates through shared public text-range selection;
next is NM-09 Mac retest and one saved verdict/capture verification. Full native,
IME, persistence/API parity and architecture gates remain open.
[09 evidence](evidence/r07-19-2026-11-14.json). Delivery handles exact 07/08 docs bases.

Revision 0.28: user reports 09 triple-click replacement/undo working in both
candidates. Verify saved NM-09 Pass/attempt/capture before remaining native cases.
[Progress](evidence/r07-20-2026-11-14.json). Local docs only; lab09 unchanged.

Revision 0.29: fresh09 native report verified: NM-09 stored pass/attempt/ready capture
in both candidates, exact source/web hashes, restored2×2 table and A/B equality.
Next NM-06 VoiceOver experience/availability. [Review](evidence/r07-21-2026-11-14/review.json).
No new lab source or automated execution; full architecture/native gates remain open.

Revision 0.30: user corrects familiarity and deprioritises VoiceOver. NM-06 remains
deferred/untested while other qualification proceeds; next NM-07 toolbar formatting
and focus. [Priority record](evidence/r07-22-2026-11-14.json). Lab09 unchanged.

Revision 0.31: Guarded-step Bold toolbar/typing and Origin Command-B/typing reported
passed. Origin has no Bold button; no toolbar route claimed. Next step view lifetime
and retained history. [Progress](evidence/r07-23-2026-11-14.json). Lab09 unchanged.

Revision 0.32: step view close/reopen and reopened-A undo/redo preserving B work
reported passed. Next NM-08 same-session injected save-failure protection.
[Progress](evidence/r07-24-2026-11-14.json). No on-disk durability claim or new build.

Revision 0.33: NM-08 injected save/protection failures and return to normal close
reported passed. Both switches off. Next record/review NM-07/NM-08 verdicts, then
consolidate handoff and remaining gaps. [Progress](evidence/r07-25-2026-11-14.json).
No disk/OS-crash/provider durability or complete architecture acceptance.

Revision 0.34 consolidates the current manual session and latest raw report. User
confirms all performed tests passed; duplicate clicks are not extra runs, and
NM-08 reported pass stays distinct from raw UI not-run. No more session reruns
requested. Next [matched history/authority qualification](r07-qualification-review.md),
then durable core/app/CLI/MCP parity before R08 selection. VoiceOver deferred and
IME unavailable; no whole-matrix or architecture acceptance. Docs/evidence patch10.

Revision 0.35 executes the [matched comparison](r07-matched-comparison.md):30 cases,
21 applied/pass,8 refusals,1 lifecycle gap; all 12 live command cases pass. Strict
qualification remains red for three explicit history boundaries. Next context-owned
Origin history and narrower disjoint-refusal guards, then durable authority/API
parity. No architecture winner, full native parity, provider or production work.
Bundle11 supports exact09/10 bases; no manual session reruns.

Revision 0.36 closes the three history gates under the unchanged contract: 30 cases,
24 pass/6 explicit protective refusals, strict 0. 84 Node and seven new lifecycle
browser cases pass; prior raw failures remain diagnostic. Next [durable-authority
proof](r07-history-ownership.md), then architecture/ADR review. No native 12 pass,
production work or accepted backend/editor/framework claimed. Patch12 over11.

Revision 0.37 executes the separate [durable-owner proof](r07-durable-authority.md):
18/18 Linux cases, atomic state/revision/receipt, stable retries across restart,
exclusive owner, recovery generations and tiny in-DB closure. Existing 84 Node
checks and unchanged strict history/CLI/MCP comparison pass. Next R08 review compares
complete combinations and drafts proposed ADRs/remaining gates. Joined editor/native
integration, external media, performance, full task lifecycle and provider work are
not qualified. No accepted backend/framework or production authorization. Patch13
requires exact12; no broad manual rerun or agent commit/push.

Revision0.38 prepares the [architecture review](architecture-review.md), proposed
F006/F007, complete-combination alternatives, old-rule impact and [gap ledger](architecture-gap-disposition.md).
G-R prepared, not an accepted baseline. Next JG-01–10 joins actual PM/Y editors to
one real durable owner. G-N native and G-M entity/external-asset closure remain
explicit follow-ups before related acceptance; all13 JG cases not-run. This is
docs-only/no new runtime execution. User confirms13 applied;14 exact13 base.

Revision0.39 executes [JG-01–10](r08-joined-core.md): two real editors, shared
CLI/MCP and a real durable owner; ten Linux passes. Earlier storage/history/table
regressions pass; raw controls retained. Next JG-11 actual Mac/installed-headless
candidate, then already-recorded G-M entity/external-asset closure before related
baseline acceptance. No accepted stack or production implementation. Frozen0.38
contract remains historical; current executions are in evidence/r08-15-2026-11-14.json.

Revision0.40 prepares [Mac runner16](r08-native-runner.md): isolated WK host, pinned
runtime, headless smoke and explicit context handoff. Eight Linux helper checks and
retained core/storage regressions pass; native build/run remains not-run. Next user
launch and observed setup, then JN-01 only. JG-11/security/distribution and JG-12/13
remain open. No new production or broad exploratory scope. Bundle16 supports13–15.

Revision0.41 records actual Mac16 setup/Swift compilation and signing failure.
Correction17 fixes script layout/signing sequence;8 updated Linux helper checks
pass. Next Mac launch retry before JN-01. No native-signing/JG-11 acceptance yet.

Revision0.42: actual Mac app launched, screenshot exposed blocked CSS.18 enables
same-origin styles and adds rendered layout checks (8 helper +10 joined passes).
Next corrected Mac layout confirmation, then JN-01; no interaction acceptance yet.

Revision0.43 pauses JN-01 for actual reload failure.19 provides same-session
recovery plus future native document-start bootstrap/protected reload.10 helper
and10 joined Linux cases pass; next verify user's saved/protected data using the
original session, not a new Space. New Swift/Mac reload gate remains open.

## Compiler follow-up29 — 2026-11-16

User applied/committed28 (e2613ec2), but Mac Swift compilation failed at
Main.swift:107: callAsyncJavaScript requires `in:in:`. Fix29 corrects the label
and adapts the completion closure. No Ready/NC28 manual pass is recorded.
Apply29, rerun `npm run native:core28`, and report Ready or compiler output first.
Do not use --new/reset for this failure; no valid28 session was created yet.
Prior77 runtime/TS/regression evidence remains historical, not a Mac compile pass.
Current instructions: START-HERE.md. No main/production/runtime owner changes.

## Native interaction follow-up30 — 2026-11-16

User confirms29 runs; screenshot Ready. NC28-01 remains incomplete: one remount
click left A closed, toolbar Undo/Redo jumped caret. Fix30 recreates A immediately
over the same context and retains local selection/history. Toolbar preserves mapped
current caret/range and focuses its target view; keyboard history defaults unchanged.
Three focused automated checks added; actual Mac retest pending. See fix30 review
for current test results. Older29 compiler-failure next-action text is superseded.

NEXT: apply30; safely close current lab; run `npm run native:core28 -- --new` for an
explicit NEW corrected synthetic run, preserving old bundle/store/report/locator.
Reopen runs its original bundle and cannot load patched source. No upgrade/reset
of an existing Space is attempted. Never use --new for recovery. Retest NC28-01
only; do not claim its Pass or advance02 until user confirms both issues fixed.
START-HERE.md is the current checkpoint. No main/app/real-vault changes.
