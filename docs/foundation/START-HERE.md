# Resume Clutter foundation work

## Current checkpoint — saved manual trace analysis45, 2026-11-16

Latest confirmed user-applied commit: a1403932 (44). Manual plan:
2026-11-16T14-42-17-901Z-f8d8efff, H-T PID29254. User completed/saved the GUI trial;
validator reports acquisition=readable-schema-gate-only, export0 and required
schemas. Source plan SHA143ae04553f895325d05b2df55e5f192e911d073032ece14b4f5a2763ee57fc1.
Raw trace is on user's Mac under Git-internal manual44/<plan>/manual.trace. It is
not in this Linux agent workspace. Recording success is not latency acceptance.

NEXT: apply45, then from repo root run:

```bash
node docs/foundation/runtime-qualification/analysis45/run.mjs --plan 2026-11-16T14-42-17-901Z-f8d8efff
```

No app/GUI or new recording needed. Fixed bounded exports: runloop-events,
visual-chain, frame lifetimes, displayed surfaces and time-info. Shared42 exporter/
XML loader reused. Inspector keeps references local to each file, exposes only
finite numeric/PID/column metadata and candidate enum/semantic-key evidence, and
never computes latency or infers causal linkage from overlap.46 Linux tests pass
(6 new+40 regressions); actual Mac45 analysis pending. Traces/raw XML stay private.

Read freeze-readiness-review.md for what can be baselined now and what blocks final
technology acceptance. Structural contracts are baseline candidates; final host,
production format/authority and representative qualification remain open. Most H01
hard cases are not closed. This is not one/two patches from full host qualification.

After this ONE saved-pilot analysis, missing/unmapped native input/producer/frame/
clock links must produce an exact H11 blocker and scoped common observable. No more
generic table fishing, recording repeats or timeout tweaks.43 CLI entry remains
retired. No host winner or gate waiver. Preserve manual/API/editor passes, both43
failures and44 acquisition success. Product P37–39/shared UI/single Core unchanged.

## Handoff authority

This checkpoint is the single current next action. Dated next-action text in the
progress log/older proofs is historical. AGENTS owns evergreen rules; CHANGELOG and
NATIVE-TEST-PROGRESS retain history; scoped evidence distinguishes user reports,
raw artifacts and Linux tests. Do not infer Mac execution from source availability.
For a new chat, provide latest branch access and ask it to read AGENTS + START-HERE.
No automatic commit/push/main work. Source/traces remain in their existing locations.



Last updated: 2026-11-16. Documentation revision: 0.69, manual acquisition passed; bounded analysis/freeze review45.
Read [AGENTS](AGENTS.md), this checkpoint and [README](README.md) first.

## User scope correction — greenfield, no existing-user/data migration

User explicitly confirms no users/data need migration. P-37 and
[greenfield scope](greenfield-scope.md) supersede earlier migration/cutover gates.
No legacy converter/backward-compatible facade/dual writer/staged rollout project
is required. Initial schema/format, future version envelopes, backup/recovery and
portability remain. Keep completed build36/evidence/pins unchanged; no rebuild for this planning
clarification. Scope is included in37; user application of37 is pending.

## Evidence chronology (historical scope per row)

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
| Actual retry35 | User commit476e7f71: Swift retained/verified PASS; Electron nested sign/strict verify/CLI+MCP smoke PASS; Tauri stopped by RETRY_DEPENDENCY_MANIFEST_CHANGED before compile |
| Normalization36 | Exact Cargo difference supplied: same pins, CLI inline tables/features=[]; generator fixed and partial retry ancestry validated;15 support tests pass |
| Actual36 | User31df10cf reports all three build/sign/strict verify/CLI+MCP smoke PASS; GUI/performance not-run |
| GUI37 actual | All3 Ready screenshot-confirmed; edits/save/reopen retention user-confirmed PASS |
| Actual38 | Mac counter calibration/compile and experimental size limits PASS; source user1bcd2783 |
| Actual39 | Mac probe pass;16 unavailable WebKit processes, trace finalization timeout and export10; metrics blocked |
| Actual40 | All16 mismatches confirmed same-file/canonical-path aliases by user; native read failures0 |
| Actual41 |0 unavailable, trace graceful exit0/export success;79 tables/51 schema names confirmed; parser corrected42 |
| Actual42 | Exports1101 process/9 frame/7 surface rows; no established input/renderer/presentation join |
| Actual43 | Both controlled CLI trials blocked: record1/TOC10; no repeat or winner |
| Actual44 | User saved GUI recording; validator readable-schema-gate-only/export0, H11 measurement still open |
| Next | Apply45; analyze saved manual plan, review exact blockers and freeze readiness; no recording |

## Earlier delivery notes (historical)

Stay on architecture/clutter-foundation. User confirms28 committed as e2613ec2, then29 applied and native window works
(screenshot Ready). User confirms35 applied/committed476e7f71 and supplies actual retry+Cargo diagnostic.
GUI37 is incremental over exact36 tree9839e2cae0454521e026fff7e2a033af724dd4f6. Mac launch now user-confirmed; full
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

## Exact next work — Tauri-only retry after confirmed normalization diagnosis

User35 commit476e7f71. Swift and Electron both have actual signed/deep-strict verified/
packaged CLI+MCP smoke PASS. Tauri has not recompiled after icon correction because
byte guard stopped it. User now supplies exact Cargo difference: CLI converted ONLY
tauri/tauri-build bare version strings into equivalent inline tables with empty
features; versions unchanged, package.json identical. See36 evidence. Do not ask diagnostic again.

1. Apply36/commit docs/foundation only. Run
   `node docs/foundation/runtime-qualification/build34/run.mjs --retry 2026-11-16T10-19-43-465Z-627d2e3f`
2. Generator emits exact observed normalized Cargo bytes. Full-file equality still
   mandatory; no version/feature changes, ad-hoc parser relaxation or re-resolution.
3. Retry ancestry resolves original34 Tauri locks and Swift archive plus Electron35
   archive, verifies recorded parent-report/profile/source/CommonCore/lock/artifact
   hashes, reuses both pass artifacts, rebuilds only Tauri in new output. It must not
   assume missing35 lock files/archive copies exist or rebuild already-passed apps.
4.15 support tests pass, including actual Cargo byte fixture, partial history and
   tamper rejection. Core/browser/native wrappers/signing/pins/worker unchanged;
   prior80/TS not rerun. Actual Mac Tauri result after36 pending. Obtain summary/error.
5. No GUI, benchmarks, NC28 replay, new inventory or production/user-vault changes.
   P-36 all current/future local Spaces one-time integration connection remains.
   Main/old artifacts/reports/sessions/dependency locks remain untouched.

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

New agent: continue the current saved-trace analysis45 action at the top of this checkpoint;
inspect current Git state rather than assuming local paths or patch application.
