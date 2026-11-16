# Clutter foundation continuation instructions

These instructions apply to this folder and its isolated experiments. Existing
production architecture rules still govern production; this pack does not replace
them by implication.

- Read START-HERE.md first, then NATIVE-TEST-PROGRESS.md, the current roadmap item
  and relevant contract/evidence. Inspect git state and preserve the user's work.
- Stay on architecture/clutter-foundation. Keep foundation work isolated here.
  Do not pull unrelated main changes, reset/clean, replace this branch, modify
  production, commit or push merely because a roadmap describes future work.
- The user permits replacing the entire implementation. Existing Markdown/editor
  mechanics impose no target constraint; effort/migration have zero selection weight.
- table-interaction-contract.md owns confirmed table behaviour. Enter moves down
  the same column and stops at the bottom; Shift+Enter is an in-cell break; Tab/
  Shift+Tab arrive at text end; final Tab stays put; handles add rows/columns.
  Adding an axis preserves the original active cell, caret/selection and focus.
  Escape keeps the same cell highlighted without a caret; selected-cell Tab/
  Shift+Tab move the highlight without entering text; Enter resumes editing.
  Triple-click selects all text inside the cell as a text range, not a cell.
  Do not route Escape to handles. Selection mode belongs to each view.
  Do not restore the withdrawn auto-growth or whole-cell-selection defaults.
- Preserve earlier test artifacts and raw controls. Legacy controls intentionally
  implement old policies and are not current product acceptance oracles. An expected
  diagnostic failure is never counted as a passing product acceptance test.
- Distinguish confirmed policy, provisional implementation, executed Linux tests
  and observed native results. Never infer complete native/editor acceptance from
  fixture checks, screenshots of practice edits, a successful build or test totals.
- Update START-HERE, the progress log, changelog and scoped evidence when code,
  requirements or meaningful native results change. Keep one current next action.
  Record blocked/not-run honestly; retain failing attempts and identify the build.
- Preserve explicitly confirmed manual results even if UI verdict clicks are
  missing or duplicated. Keep raw attempts intact; do not count clicks as test
  executions or require reruns just for bookkeeping.
- Guide manual testing one concrete variation at a time. Do not mark all NM-01
  passed from one successful substep. Ask one example-based question only for a
  genuinely unresolved material decision, not a settled requirement.
- Read r07-history-ownership.md and the unchanged matched contract before further
  qualification. The bounded 30-case strict gate now exits 0:24 passes,6 explicit
  protective refusals, no gaps/failures. It is not full architecture acceptance.
  Keep the original failing baseline/raw controls and the context-owned lifecycle
  boundary. Do not reintroduce view-owned manager disposal or global undo locks.
- The origin candidate's structural history guard is conservative and provisional;
  native input, full semantic undo, CLI/MCP/durability parity and provider consistency
  remain separate gates. No editor/framework/storage architecture has been accepted.
- Deliver uniquely named incremental patches with a verified prior-content base.
  Match the downloaded filename exactly in quoted commands for
  /Users/sivakuv3/Downloads/Arc browser/. Explain prerequisites. Remember the user
  may be in the experiment subdirectory; change to the git root before git apply.

- Historical checkpoint revision 0.37: read r07-durable-authority.md and r07-29 evidence.
  The separate P-SQL proof passes 18 bounded Linux cases; never describe it as the
  full editor's durable integration, external attachment ordering or power-loss proof.
  Next R08 review package proposes complete combinations/ADRs and remaining gates.
  Do not rerun the user's manual session, enable providers or implement production
  from these results. Stable operation identity survives transport/owner restart;
  adapter retry must not generate a new operation after an unknown reply.

- Revision0.38 prepares architecture-review.md, architecture-gap-disposition.md,
  proposed F006/F007 and joined-core-contract.json. All13 JG cases are not-run;
  next JG-01–10 is isolated real-owner/full-editor qualification, not production.
  Recommendation PM/Y + TS owner + SQLite is not accepted. J proposes one Y-state
  persisted payload; decoded PM JSON is not another writable root. Freeze envelope,
  state transition/schema before code; preserve old comparisons/native reports.
  User confirms13 applied; review14 base is exact13. No broad manual replay.

- Historical checkpoint0.39: read r08-joined-core.md and evidence/r08-15-2026-11-14.json.
  JG-01–10 now pass; their0.38 frozen contract remains historically not-run and must
  not be mistaken for current execution status. Next prepare the actual joined
  Mac/installed-headless JG-11 candidate; old Swift lab is not this integration.
  JG-12/13 entity/external assets remain G-M gates. Do not reopen broad research,
  replay the old manual session, accept a stack or implement production from G-J.
  Bundle15 supports exact13/14 because14 application is unconfirmed. New proof
  stores one accepted Y BLOB; never add a competing PM JSON/Markdown save path.

- Historical0.40: r08-native-runner.md and r08-16 evidence. Native runner is prepared,
  not Mac compiled/run. Next user launches npm run native:joined and reports setup;
  only then guide JN-01. Eight Linux helper checks are not JG-11 acceptance.
  Separate Swift host uses pinned packaged runtime and explicit context handoff;
  no production security/lease/shell decision. Do not ask for private endpoint files.
  Bundle16 preflights13/14/15;15 application unconfirmed after corrected command.
  Use temporary extraction variable so downloaded folder renaming cannot break apply.

- Historical0.41: user Mac committed16 as60b0505b, Swift compiled, signing blocked by
  unsigned CLI script in MacOS. Correction17 moves it to Resources/bin and signs
  the outer app last; strict verification remains. Next apply17/retry native:joined,
  get actual launch result before JN-01. No native signing pass inferred; Swift/domain
  unchanged,8 updated Linux helper checks pass. Preserve raw16 failure/evidence.

- Historical0.42: screenshot shows joined Mac launched/HEADLESS revision1, but CSS was
  blocked by style-src lacking self. Correction18 adds same-origin styles only;
  reproduced layout assertion fails before and passes after.8 helper +10 joined
  cases pass. Next quit old test app/apply18/relaunch, confirm side-by-side layout
  before JN-01. Bundle supports16/17; source fingerprint17 not independently reviewed.

- Historical0.43: accidental reload blanked the user's joined page because URL bootstrap
  was consumed. Data deletion is unverified. First recover SAME session using
  native:joined:reopen, not fresh native:joined. Helper requires existing store and
  original bundle, records canonical/protected/last capture, opens original app with
  new report path. Avoid another old-host reload. Source19 adds native document-start
  bootstrap/protected reload;10 helper +10 joined Linux passes, new Swift not Mac-tested.
  Never guarantee recovery of uncommitted/unprotected text or discard the old session.

## Historical checkpoint — revision0.44 / build20

Read START-HERE's build20 action first. User has reopened visible editors, then
reported alternating table-cell whitespace clicks jumping into adjacent cells.
Pause JN-01 for targeted Mac retest of20. Keep native reports and earlier manual
passes; do not infer JN-01 or native reload acceptance. Source needs a new packaged
app to take effect; reopener deliberately runs the original binary. Preserve old
session/store, use normal protected quit and archive setup before fresh builder.
Linux pointer path did not reproduce native symptom; injected adjacent hit proves
the pre20 adapter lacked DOM-cell bounds. No new architecture decision.

## Historical checkpoint — revision0.45 / build21

START-HERE now owns the single current next action: JG-13 external image/PDF file
closure. JN01–04 user passes and raw report review retained; no native replay.
Fourteen entity cases pass with six real crash phases through common Store/host.
Normalized task ownership/restore policies are proof proposals, not approved UX or
production format. Original frozen JG contract is unchanged; evidence is separate.
No production/main changes or agent commit/push. User repaired accidental generated
output on local main separately; preserve backup and sessions, stage no outputs.
Build21 patch base is exact20 / remote17d63b3; do not assume applied until reported.

## Historical checkpoint — revision0.46 / build22

START-HERE owns next action: architecture decision-readiness review, not another
broad/manual editor session. Media12 passes across13 actual crash boundaries;
entity14, Node84 and2 old-profile headless checks pass. Fresh browser suites could
not launch due to environment Unix socket restrictions; retain raw attempts and
prior historical passes without inventing new ones. Linux fsync/inert-byte tests
do not qualify Mac fullsync, power loss, native media renderer or PDF security.
Tasks remain full pages with body/cover/embeds intended; media associations use
the same page ID operations as notes. Tiny PNG/PDF files are source test fixtures.
Build22 supports exact20/21 since21 application unconfirmed. Never touch main,
commit generated objects/stages or discard native sessions/repair backup.

## Historical checkpoint — revision0.47 / review23

User confirms22 applied/done. Review23 is docs/static evidence review only over
exact22. START-HERE/readiness/F008 own next bounded PK01–10 proof; all PK not-run.
Recommend PM/Y + shared TS core + SQLite, not a selected shell/runtime or accepted
production format. Per-page payloads inside atomic Space transactions must re-prove
coherent historical task/cover/media version sets; do not freeze whole-Space Y state
from21/22. Preserve aggregate controls, shared commit path and previous manual passes.
No broad research/native replay, source packages or new performance claims in23.
D11 targets/reference-host/Space-size dimensions remain proposals; source scale risk
is not a benchmark failure. Before production, close exact G-Q and rule-impact gates.
Current main/source/user data/backups remain untouched; use one foundation branch.

## Historical checkpoint — revision0.48 / proof24

User confirms23 done. PK01–10 now pass headlessly with shared task/media planners
and one Store transaction path, not new per-interface reducers. Actual native/
EditorViews/new context-update/protection route NOT qualified by PK. Source entity
planners and validators were factored once, reused by old aggregate and page ports.
User clarified UI/CLI/MCP are peers and objects to duplicate owners. Use “Space
service” for the one running Core application service plus Vault adapter; authority/
owner are historical synonyms, not another component. Read runtime-ownership.md.
Next is F009 scoped I1 entry decision and concrete Core/API/catalogue/port contract,
then disposable-only three-interface implementation. No broad research/manual loop
or empty packages. F009 remains Proposed; G-Q still blocks real-vault writes, final
format/native/discovery/grants/flush/budgets/migration and full production acceptance.
Read START-HERE/implementation-entry/r08-page-closure for exact next steps. All old
manual passes/evidence/PK/JG/budgets retained; no main/production/agent commit/push.

## Historical checkpoint — revision0.49 / implementation25

User confirms24 applied and authorizes proceed after Core/desktop clarifications.
F009 is accepted for disposable I1 only. Read START-HERE and i1/result.md. I1a has
real code in private packages/foundation-runtime: inferred catalogue/types/schemas,
sole internal PageOperations and SpaceService, portable client/desktop draft session,
SQLite multi-root commit port, shared CLI/MCP adapters.21 integration tests and
strict TypeScript pass. No installed CLI, actual editor binding, media API or
protected-draft implementation is claimed; next I1b closes those named routes.
One atomic transaction primitive and MCP framer are factored/reused by old proofs.
Root package/lock changes only add scripts/private workspace metadata; no dependencies.
Only the dev composition imports the prior qualified Y codec; runtime imports no
experiments. Preserve OS-temp factory/marker/identity enforcement, old app save path,
all raw controls/evidence and real-vault G-Q gates. No main/commit/push/manual replay.
The two browser-dependent legacy suites attempted25 are BLOCKED after DO01/NP01–03:
missing Playwright executable. Do not report them as full passes or install/bypass.
Package25 requires exact24; stage explicit new package/root paths along with docs.

## Historical checkpoint — revision0.50 / editor implementation26

User confirms25 applied and authorizes proceed. START-HERE is the single current
handoff; read i1/editor-result.md and editor-contract.md. Real runtime EditorSession
plus editor.open/apply/protect/recovery now use the same PageOperations/SpaceService.
23 actual EditorView/jsdom cases and21 existing runtime tests pass; strict TS and
84 old Node checks pass. DOM tests fail on uncaught events and explicitly disable
scroll geometry. They are NOT browser/native/IME/window-close/flush acceptance.
The actual PM/Y adapter lives in explicit dev composition; runtime imports no proofs.
Known-base/latest validation refuses unknown XML, trailing bytes, incomplete Y
updates and non-body changes; paragraph IDs are assigned in the original user tr.
SQLite schema2 adds actor-bound receipts and immutable protected roots/pending exact
commands without changing canonical heads. Refuse old temp schema1; no auto migration.
Context history outlives view destruction; epoch/recovery resets are explicit.
Protected snapshots remain retained; no automatic release/GC/full grant lifecycle.
Next is I1b media API integration, then supported targeted browser/native changed-
route qualification. I1/G-Q remain open. Do not rerun broad research/old manual
sessions, touch main/apps/app/user vaults or stage generated output/node_modules.
Bundle26 base is exact25; no agent commit/push. Stage docs/foundation,
packages/foundation-runtime and package-lock.json only. Track raw attempts and all
prior evidence; first expanded failures and their corrections are retained in26.

## Historical checkpoint — revision0.51 / media implementation27

User confirms26 applied. START-HERE owns current next action: targeted native host/
browser-safe renderer/media lifecycle integration contract, then a concrete build.
Media.import/replace/remove/list/read now use the same catalogue/PageOperations/
SpaceService; no media owner or renderer file writes. Canonical Y links -> immutable
object metadata/files; root reference indexes audited by engine on composition.
Publication flush/link/dir-sync precedes the existing SQL root/ref/outcome commit.
Media files/formats/admission/association helpers were moved once into runtime;
old proof modules import/re-export them. No duplicate publisher/policy.19 new cases
pass (63 runtime total), strict TS, old media12/page10/entity14/Node84 pass;11 new real
publication/SQL process-death trials. No native/browser/security/performance pass.
Schema3 refuses earlier temp schema1/2; no migration/GC/unlink of referenced bytes.
Native host still must handle Node dev codecs vs browser bundle, actual image/PDF
presentation, inline placement and resource disposal. Crucially editor protection
covers raw editor.apply only; unsent/pending media requests need resolve/journal +
close gating before real UI. Published orphan bytes are NOT user-intent recovery.
Keep old manual/native sessions, prior evidence/frozen/lock/budgets, main/apps/app/
real data untouched. No agent commit/push/manual replay.27 is exact26 incremental;
stage docs/foundation and packages/foundation-runtime only, no generated paths.

## Current checkpoint — revision0.52 / native build28 prepared

User confirms27 applied. Read START-HERE + i1/native-result + native/README and
native-contract.json. NEW Core native host/browser-safe replica/codec/Blob lifetime/
PDFKit bridge/durable exact media ingress/close-reload guard are prepared.77 runtime
cases, strict TS and legacy media12/page10/entity14/Node84 pass. No Mac Swift compile,
image/PDF/native input/traffic-light/flush pass: NEXT USER runs native:core28 and
reports Ready or compiler/setup output. Then NC28-01 only, not all old manual cases.
Native UI reads case steps from the single contract JSON; reports retain manual
attempts without auto-passing. Private bootstrap/tokens excluded from reports.
Generated apps/caches/reports are Git-internal clutter-native28, never staged. Root
scripts added, no dependencies/locks/main/apps/app/user-vault changes. Same-session
reopen reuses original bundle/store and refuses a live window; normal repeat refuses
existing session unless explicit --new. Keep prior locators/sessions/repair backup.
Media ingress persists exact commands+bytes and replays through existing Core only;
failed journal refuses close. Freeze guards typing/undo/buttons/admitted async media.
Browser graph has no Node/fs/SQL/old semantic models; Node graph excludes old Store.
Shared envelope/projection/rebase sources preserve prefix bytes; client verifies SHA.
Empty notes now follow note schema and remain saveable. General UI/decoder/security/
conflict/retention/grants/discovery/native power-loss/D11/migration gates remain open.
No agent commit/push.28 base is exact27; stage docs/foundation, packages/foundation-
runtime and package.json only. Do not infer28 applied/compiled until user reports it.

## Compiler follow-up29 — 2026-11-16

User applied/committed28 (e2613ec2), but Mac Swift compilation failed at
Main.swift:107: callAsyncJavaScript requires `in:in:`. Fix29 corrects the label
and adapts the completion closure. No Ready/NC28 manual pass is recorded.
Apply29, rerun `npm run native:core28`, and report Ready or compiler output first.
Do not use --new/reset for this failure; no valid28 session was created yet.
Prior77 runtime/TS/regression evidence remains historical, not a Mac compile pass.
Current instructions: START-HERE.md. No main/production/runtime owner changes.
