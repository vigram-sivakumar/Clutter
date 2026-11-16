# Resume Clutter foundation work

Last updated: 2026-11-16. Documentation revision: 0.59, matched host build retry35.
Read [AGENTS](AGENTS.md), this checkpoint and [README](README.md) first.

## Current position

Architecture qualification continues on **architecture/clutter-foundation**.
Disposable Core implementation has begun under F009; no accepted production stack,
real-vault cutover or provider implementation. Product decisions
remain in product-contracts.md; historical progress is in CHANGELOG.md/roadmap.md.
This current checkpoint supersedes earlier next-action text in historical records.

| Area | Verified status |
| --- | --- |
| Product/model/editor/contracts | Confirmed scope plus explicitly conditional technical specifications; full feature/release matrix remains open |
| R07 history build12 | Frozen matched strict contract:24 passes/6 protective refusals, no gaps/failures; preserved raw controls |
| R07 durability build13 |18 bounded Linux cases; separate real SQLite owner and CLI/MCP |
| Joined build15 | JG-01–10 pass with actual PM/Y views, one accepted Y root and shared durable owner |
| Native build20 | User reports JN-01–04 pass, including failed-close protection/reopen, restart and app-closed same-Space CLI read; no replay needed |
| Native report reviewed | evidence/r08-native-manual-2026-11-15/review.json: actual build20 Mac arm64/Node24.22.1/SQLite3.53.4; raw JN01/02, HN01/02 and synced final PROTECTED root; later checks are user reports |
| Native limits | IME unavailable; VoiceOver deferred; distribution/security/full release matrix and explicit native reload-safety trial unqualified |
| Entity build21 |14 Linux cases pass for proposed canonical task page/unique placement, atomic multi-note move, historical read/restore conflict,6 real process-death phases, CLI/MCP parity and stored Y closure |
| Media build22 |12 Linux media cases pass with13 real crash phases;14 entity,84 Node and2 old-profile headless regressions pass; browser reruns environment-blocked |
| Review23 | Recommendation/module ownership/gate assessment complete; F006/F007 evidence updated, F008 and frozen PK01–10 proposed; no new runtime tests |
| Page proof24 | PK01–10 pass headlessly,10 multi-page crash boundaries plus interrupted import; single-page writes, snapshot/pin/lease closure; no new native/browser/performance claim |
| I1a implementation25 |21 integration tests and strict TypeScript pass: shared page CRUD/Core, SQLite multi-root commits, CLI/MCP stdio clients, desktop draft session; actual editor binding pending |
| I1b editor26 |23 additional actual EditorView/context tests pass in jsdom; shared update/protection/recovery API, peer-bound grants, exact pending requests;44 total runtime tests + strict TypeScript; no fresh native/browser qualification |
| I1b media27 |19 additional media/editor cases pass (63 runtime total),11 publication/SQL process-death trials; prior media12/page10/entity14/Node84 and strict TS pass |
| Native build28 |Browser-safe bundle + NEW Core host + durable media ingress + Mac WK/PDFKit host prepared;77 automated cases/TS and legacy regressions pass; Mac compilation/manual cases NOT RUN |
| Native compiler29 | User committed28 as e2613ec2; Mac compile failed at WebKit argument label. Fix29 prepared; no Ready/manual pass |
| Native interaction30 | User confirms fix30 works: NC28-01 remount/toolbar corrections PASS (user report; raw report not inspected) |
| Native media | NC28-02 user-reported PASS; raw report not inspected |
| Native media protection | NC28-03 user-reported PASS: unsafe close refused, journal-protected close/reopen retained request, retry saved it |
| Native text protection | NC28-04 all guided stages user-confirmed; supplied app-closed CLI JSON returns PROTECTED, sequence38 |
| I1 scoped milestone | Complete for tested disposable profile; raw native reports not audited; production G-Q remains open |
| H01 contract32 | Candidate configurations,12 hard cases,Space-size recipes and trial targets prepared; all host comparisons not-run |
| Actual H01 Mac | User32 commit44c624ac; M4 Pro/Mac16,7/48GiB/14 logical CPUs/macOS26.6.2(25G83),native arm64 supplied |
| Preflight33 | Hardware evidence bound, exact candidate version metadata selected, safe tool/environment helper ready; artifact locks and instruments still unverified |
| Actual preflight33 | User commit5bbd7f10; hardware/OS match, Xcode/Swift/SDK/Rust/APFS SSD and probe tools supplied; power/thermal fields unknown |
| P-36 access UX | User confirms connect once per integration/device, default all current/future local Spaces, optional restrictions; no per-Space codes/prompts |
| Build34 | Matched native wrapper/packaging sources ready;7 support tests+80 runtime+TS pass on Linux; Mac build/GUI/metrics not-run |
| Actual build34 | User commit8ed5331c: Swift signed/strict-verified/headless-smoke PASS; Electron nested signature FAIL; Tauri missing-icon macro FAIL |
| Retry35 | Missing icon and nested signing flow corrected;12 support tests pass; actual Mac retry pending |
| Next | Apply35; retry original34 run ID, preserve Swift pass/locks/Core; paste final build summary/error. No GUI or benchmark yet |

## Branch and delivery state

Stay on architecture/clutter-foundation. User confirms28 committed as e2613ec2, then29 applied and native window works
(screenshot Ready). User confirms34 applied/committed8ed5331c and supplies actual build log.
Fix35 is incremental over exact34 tree6f1dbc13628771024d30c19b48043c8d625bf4ca. Mac launch now user-confirmed; full
NC28-01 remount/toolbar issues are confirmed fixed by user after30; user-reported PASS,
not a raw report audit. No agent commit/push, main/apps/app/user-
vault changes. Local HEAD is stale; use files/content trees. Cumulative source changes are
foundation docs, private runtime and three root npm scripts only; no lock/dependency
changes. Generated bundles/cache/reports use Git's internal clutter-native28 path,
not source directories, so cannot be staged on main or the foundation branch.

Preserve repaired-main backup and old native sessions. No main switch/merge/rebase/
reset, generated bundle/runtime/cache/artifacts or test-store staging. Shared source
planners and SQL transaction engine are reused; new page adapter is not another
policy implementation. Old aggregate/native profiles remain comparison controls.

## Exact next work — retry failed native builds, preserving Swift34

Read retry35 review and original user build log in evidence/host-build-retry-35-
2026-11-16. User34 commit8ed5331c. H-S ACTUALLY built/signed/deep-strict verified/
packaged CLI+MCP smoke passed. H-E failed nested framework signature; H-T failed
missing icon at generate_context. No GUI/benchmarks or winner. Do not repeat inventory.

1. Apply35/commit docs/foundation only. Run:
   `node docs/foundation/runtime-qualification/build34/run.mjs --retry 2026-11-16T09-58-25-103Z-7838dcfb`
2. Retry verifies previous source/common/CoreData/Swift artifact/archive/locks/SHA
   records, preserves original run and Swift pass, rebuilds only failed candidates
   in new output directory. Original dependency locks reused, no version resolution
   or downgrade. Keep retry args across Node24.22 bootstrap. Do not delete outputs.
3. Tauri gets valid explicit icons/icon.png; Electron signs actual Mach-O leaves
   then nested bundles then outer app, preserves entitlements/flags, excludes CoreData.
   Strict deep verification remains.12 support tests pass; Mac fix unproven until run.
4. Obtain final summary or exact error. If retry says inputs changed, report it;
   no reset/clean/bypass. Subsequent GUI/readiness/metrics remain separate, not-run.
   Core/browser/worker/native shell source unchanged; prior80/TS not rerun for35.
5. P-36 remains confirmed: one integration connection/device, all CURRENT/FUTURE
   local Spaces by default, optional advanced restrictions; no per-Space codes.
   Space writers/internal tickets stay separate; production credential auth unqualified.
6. Preserve main/app/real vaults/old native sessions, all old evidence, H01/pins/budgets.
   No old manual replay or another architecture framework search. Swift pass alone
   cannot choose a winner; known packaging mistakes are fixed within same contract.

## Proof24 facts and limits

PK01–10 pass under the recorded headless Linux profile. One page edit encodes only
that page; task move updates two note heads/indexes/receipt atomically without
changing task body/cover. Same note root resolves old/current task data by snapshot
context. Pins/leases retain root/file references through restart; no GC or lease
expiry. Ten actual process-death phases and interrupted import recover/retry safely.
Same-path second writer refuses; complete alias/discovery/fencing is not qualified.

Shared planners/admission/file publisher/transaction engine reused. Regressions:
entity14, media12, Node84, two old snapshot/joined headless cases and one old native
context metadata case pass. No new browser run/native test or budget approval.
Structural byte counters are not physical SQL/WAL, speed, memory or startup targets;
initial deep historical audit remains intentionally measured, not optimized away.

The new query API is a proof surface. heads/metrics are diagnostics. Page session
Y updates/protection and a pin/lease metadata cursor are not implemented here.
I1a now has a concrete limited catalogue and injected scopes; production peer grants
and the live context protocol remain gated.
Frozen PK/JG contracts keep original not-run fields; actual results are separate
in evidence/r08-24-2026-11-15.json. No old evidence or confirmed product scope changed.

## Media proof interpretation

Both notes and tasks are first-class page IDs for body/cover associations. Current
body schemas/rendering are only subsets; tasks are NOT restricted to those subsets
in the intended product. Immutable hash-named external files precede SQL references;
root/history metadata has no second writable file-byte copy. Pins retain files,
current-reference removal never unlinks, and orphans remain unreachable. No GC.

12 media cases cover13 real child-process death boundaries and a few injected
pre-flush exceptions (not actual fsync syscall/power-loss faults).14 entity and84
Node checks plus2 legacy/joined headless-port cases pass. Two fresh browser suites
could not launch Chromium because Unix sockets are denied in this environment;
recorded attempts are blocked, not passing or new semantic assertion failures.
No more user manual tests requested. Native rendering, general PDF/image security,
Mac F_FULLFSYNC/directory behavior, Windows and power-loss guarantees remain open.

## Entity interpretation and remaining limits

Build21 proposes task body/title/properties once in a task entity; note task_slot
blocks own at most one placement. Inbox means no note slot; placement index is
read-derived. One coarse Space Y root is a bounded closure proof, not a measured
production storage/partition choice. Restore note content only when task ownership
matches; it does not rewind independent task bodies. These conservative proof
policies remain proposals, not new user-approved restore UX. No native entity
binding, clipboard UI/cross-note undo, task-page restore, recurrence, delete or
migration acceptance. Entity IDs/paragraphs/task slots are a schema subset.

## Handoff discipline

Preserve manual passes even when picker clicks/captures are incomplete. Keep raw
reports immutable and separate user observations from captured execution. Do not
restart product discovery, replay native tests, enable provider sync or change
production based on these proofs. Keep ADRs Proposed until an explicit decision.
Update this checkpoint, roadmap and changelog together at meaningful handoffs.

New agent: continue JG-13 from this checkpoint on the single foundation branch;
inspect current Git state rather than assuming local paths or patch application.
