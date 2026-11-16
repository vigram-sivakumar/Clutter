# Resume Clutter foundation work

Last updated: 2026-11-15. Documentation revision: 0.49, implementation25.
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
| Next | I1b: actual per-page editor/context updates, protected drafts and immutable-media API integration; G-Q remains before real data |

## Branch and delivery state

Stay on architecture/clutter-foundation. User confirms proof24 applied. Implementation25 is incremental over exact24
content tree acd69f3be3fd1af8b9874b0d981439081b3b6713; new user commit/push is not assumed. No agent commit/push, apps/app/main changes
or user-vault writes. Current workspace holds later uncommitted content; inspect
actual Git/files rather than stale local HEAD before resuming elsewhere.

Preserve repaired-main backup and old native sessions. No main switch/merge/rebase/
reset, generated bundle/runtime/cache/artifacts or test-store staging. Shared source
planners and SQL transaction engine are reused; new page adapter is not another
policy implementation. Old aggregate/native profiles remain comparison controls.

## Exact next work — I1b integration

1. Read [I1a result](i1/result.md), [contract](i1/contract.md),
   [F009](adr/F009-scoped-core-implementation-entry.md) and
   [runtime ownership](runtime-ownership.md). F009 is accepted only for disposable
   implementation, following the user's “proceed”. I1a is implemented; I1 is not done.
2. Continue the same private workspace in packages/foundation-runtime. Bind actual
   per-page EditorViews/contexts to the shared API with private grants, staged Y
   updates, origin-aware history, remount/catch-up and durable protected drafts.
   Add semantic operations to the same catalogue/PageOperations, never a UI save path.
3. Integrate immutable-media operations through Core/Vault ports, preserving the
   qualified publication/closure rules and coherent multi-page version sets. The
   I1a Vault already supports multiple guarded root changes in one Space sequence.
   Its full-body paragraph dev adapter is not a live editor protocol or final schema.
4. Automate changed integration routes; preserve prior keyboard/native passes.
   Browser-dependent regressions attempted25 are blocked by the missing Playwright
   executable (prior system Chromium also failed sockets). Do not install/bypass or
   infer browser/native passes. Arrange supported execution for I1b before acceptance.
   No new manual testing is needed merely to apply25.
5. Keep G-Q blocking existing/user-vault writes, production runtime/discovery/grants,
   native flush, final format/history/retention, migration and fixed D11 budgets.
   No main branch changes, installed CLI claims, provider enablement or full-I1 pass.

Developer checks: `npm run foundation:test` and `npm run foundation:typecheck` at
repo root (Node24.22.1+, usual root dependencies and existing nested locked PM/Y
experiment dependencies installed). The bundle changes the private workspace,
root scripts/workspace lock metadata, scoped rule note and foundation docs only.
Do not stage artifacts/out/runtime/cache/temp stores or push backup refs.

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
