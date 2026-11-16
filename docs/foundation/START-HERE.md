# Resume Clutter foundation work

Last updated: 2026-11-16. Documentation revision: 0.50, editor implementation26.
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
| Next | I1b media API integration, then targeted supported browser/native qualification; I1/G-Q remain open |

## Branch and delivery state

Stay on architecture/clutter-foundation. User confirms25 applied;26 is incremental
over exact25 content tree f36a7752aac02cf692f7932e4a4ac8b896fc5f55. Do not infer
that26 is applied/committed until reported. No agent commit/push, apps/app/main or
user-vault changes. Current local HEAD is old; use actual files/content trees.
Only docs/foundation, packages/foundation-runtime and workspace-lock metadata change.
No new external package versions: jsdom29.1.1 was already locked, now declared as a
direct test dependency. Generated output/node_modules/temp DBs are not delivered.

Preserve repaired-main backup and old native sessions. No main switch/merge/rebase/
reset, generated bundle/runtime/cache/artifacts or test-store staging. Shared source
planners and SQL transaction engine are reused; new page adapter is not another
policy implementation. Old aggregate/native profiles remain comparison controls.

## Exact next work — I1b media integration

1. Read [editor26 result](i1/editor-result.md), [editor contract](i1/editor-contract.md),
   [I1a result](i1/result.md), F009 and runtime-ownership.md. Actual editor/context/
   protection integration has now run against real SQLite and real EditorViews in
   jsdom. Do not repeat I1a or start another architecture/candidate search.
2. Add image/PDF/cover association operations to the SAME catalogue/PageOperations.
   Put immutable byte publication/flush/read behind Vault/platform ports. Reuse the
   qualified media admission/publication/closure rules; do not copy a second policy
   or transaction engine. Preserve atomic multi-page/root/outcome behavior and
   coherent historical references. Existing media proofs are inputs, not a pass of
   those new runtime operations. Tasks remain full pages with body/cover/embeds.
3. After media integration, arrange a supported targeted browser/native run of the
   changed route before claiming I1 complete. The23 new DOM cases are not native
   typing, geometry, focus/window-close integration, IME or macOS durability passes.
   No browser install/bypass or broad old manual-session replay. No manual test is
   required just to apply26; the production app is not wired to these modules.
4. Preserve current editor guarantees: private trusted-peer/page/context grants;
   raw updates body-only, known accepted base, complete dependencies, no lossy
   unknown nodes; exact pending request across unknown replies/recovery; view closure
   does not dispose context history; restart/recovery explicitly resets undo history.
   Native host must call prepareClose/sync and re-establish hint subscription on
   reconnect. A red macOS close button is NOT connected by this DOM-only slice.
5. Retain F009 disposable enforcement and real-data G-Q gates: production runtime/
   discovery/auth/grant lifecycle, native flush, final schema/format/version-set/
   retention/migration, fixed D11 workloads and performance remain unqualified.
   No main switch/merge/rebase/reset, real-vault access or provider enablement.

Developer checks: `npm run foundation:test` (44) and `npm run foundation:typecheck`
at repo root, Node24.22.1+. Use normal root install plus the existing nested locked
PM/Y experiment install. The explicit dev renderer/engine composition is temporary;
actual runtime modules import no experiment code. jsdom tests disable automatic
scroll handling (no layout engine) and fail on ANY uncaught DOM event error.
Schema2 refuses earlier I1 temporary stores without migration; leave them in place.
Protected snapshots are retained, not automatically released/pruned. Conflicting
foreign paragraph replacement refuses rebase without hiding local text; recovery
against a different canonical base refuses explicitly and leaves the snapshot intact. Do not claim
active-recovery cleanup, a final format or complete view-layout/cursor persistence.

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
