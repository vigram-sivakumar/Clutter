# Resume Clutter foundation work

Last updated: 2026-11-16. Documentation revision: 0.51, media implementation27.
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
| Next | Targeted native editor/media composition and lifecycle qualification; I1/G-Q remain open |

## Branch and delivery state

Stay on architecture/clutter-foundation. User confirms26 applied;27 is incremental
over exact26 content tree 4ff986bd46b50274684bf3bba8764d424414fa09. Do not infer27
applied/committed until reported. No agent commit/push, apps/app/main/user-vault
changes. Current local HEAD is old; inspect files/content trees. This bundle changes
docs/foundation and packages/foundation-runtime only; no dependency/lock changes.
No generated runtime/cache/node_modules/test stores are delivered.

Preserve repaired-main backup and old native sessions. No main switch/merge/rebase/
reset, generated bundle/runtime/cache/artifacts or test-store staging. Shared source
planners and SQL transaction engine are reused; new page adapter is not another
policy implementation. Old aggregate/native profiles remain comparison controls.

## Exact next work — targeted native editor/media integration

1. Read [media27 result](i1/media-result.md), [media contract](i1/media-contract.md),
   [editor26 result](i1/editor-result.md), F009 and runtime-ownership.md. Actual media
   API/immutable publication/history/editor compatibility are implemented. Do not
   redo I1a/editor/media API work or start broad architecture/candidate research.
2. Freeze a bounded native composition/test contract before the host code: one
   running NEW Core service/Space, peer-bound editor contexts, same UI/CLI/MCP API,
   supported targeted two-view/history/protection/media/owner-restart cases. Do not
   point the old joined/native Store profile at schema3 or reuse it as new Core.
   Existing native/manual sessions must remain intact. Final shell/runtime remains
   unselected; a qualification host is not shipping architecture acceptance.
3. Implement browser-safe renderer/codec wiring behind the existing ports. The
   current qualified DOM adapter imports Node-based dev codecs/Buffer/hash helpers;
   it cannot be assumed to bundle into WK/browser unchanged. Keep filesystem/Node
   mechanisms in the service; do not add browser-side mutation/file fallbacks.
4. Qualify image/PDF/cover presentation and resource lifetime on the selected test
   host. API associations exist; inline media nodes/placement, object-URL disposal,
   PDF sandbox/security/general decoders and full UI are NOT delivered by27.
   Current admission is deliberately bounded PNG + conventional-xref PDF,256KiB,
   not a production image/PDF decoder or security guarantee.
5. Native close/reload must compose EditorSession.prepareClose/sync with outstanding
   media operations. EditorSession protects editor.apply work, NOT unsent image
   bytes or pending media.import/replace requests. Resolve those exact outcomes or
   persist request+bytes safely before allowing close. Do not silently discard them
   or assume published-but-unreferenced objects are a recoverable user intent.
6. Arrange only the targeted changed-route native checks once a concrete build is
   ready; no broad old keyboard/manual replay or browser restriction bypass.
   No manual/native test is needed just to apply27. Existing app/main stays unchanged.
7. Keep G-Q before real data: production runtime/discovery/auth/grant lifecycle,
   native flush, final schema/codec/version-set/retention/migration, full features,
   fixed D11 host/workloads/performance and safe migration remain unqualified.

Developer checks: `npm run foundation:test` (63) and `npm run foundation:typecheck`
at repo root (Node24.22.1+, normal root + existing nested PM/Y dependencies). Legacy
media12/page10/entity14/Node84 regressions also pass after factoring shared helpers.
Media files/byte/admission policy is now shared SOURCE in the actual runtime package;
older proof files re-export/import it. No copied second publisher or business owner.
Schema3 refuses earlier temp schema1/2 without migration; leave old stores intact.
All roots/protected snapshots/bytes remain retained; no automatic release/pruning/GC.
Conservative rebase/recovery conflicts preserve the live/protected draft. No full
native/browser/geometry/IME/window-close/flush or production qualification inferred.

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
