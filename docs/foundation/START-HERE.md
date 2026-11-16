# Resume Clutter foundation work

Last updated: 2026-11-16. Documentation revision: 0.56, H01 host/runtime contract32 prepared.
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
| Next | Apply32; run safe host-inventory command on Mac and supply JSON; then bind host/version/instrument manifest before builds/timing |

## Branch and delivery state

Stay on architecture/clutter-foundation. User confirms28 committed as e2613ec2, then29 applied and native window works
(screenshot Ready). User confirms31 applied. Contract32 is incremental over exact31 tree
e0e4a28b672f58b8a273b3f9c53e243c39f02af1. Mac launch now user-confirmed; full
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

## Exact next work — H01 reference-host inventory, not another contract rewrite

User confirms checkpoint31 applied. I1/NC28 remains complete within its recorded
scope. [H01 contract](runtime-qualification/contract.json) and
[guide](runtime-qualification/README.md) now fix candidate families/gates/recipes/
trial targets. Existing qualification-budgets.json remains unchanged. No H01 candidate
build, performance result, reference binding or shipping choice is inferred.

1. User applies32 over exact31 tree e0e4a28b672f58b8a273b3f9c53e243c39f02af1 and
   commits docs/foundation only.32 includes one read-only inventory helper, no runtime
   installs/downloads/new app/Space and no product/old runtime code changes.
2. Run `node docs/foundation/runtime-qualification/host-inventory.mjs` on user Mac
   and obtain its safe JSON. No usernames/hostname/serial/tokens/endpoint/vault access.
   It archives Git-internal facts and refuses another branch. Linux inventory/checks
   are not Mac results. Do not ask for NC28 manual replay or use --new.
3. Next33 binds actual host, exact candidate/toolchain/runtime/archive/version/hash
   pins and feasible physical-footprint/presentation instruments. Missing display/
   power/volume/instrument metadata remains explicitly unresolved; inventory alone
   does not approve a host or permit normative timing.
4. Matched candidates: H-T Tauri2 + separate common Node owner; H-E Electron + same
   owner (count embedded+extra runtime); H-S Swift/WK control. Single TS semantic
   Core/PM/Y/SQLite path stays fixed. Rust/Swift are mechanism ports, no reducers.
5. Build34 → compare35 → scoped ADR36, or explicit failed/blocked gate. No open-ended
   editor/framework research or moving thresholds after results. Full mixed-product
   W workloads and real-vault G-Q remain separately blocking; paragraph host profiles
   do not claim those features or product performance. Preserve old sessions/main.

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
