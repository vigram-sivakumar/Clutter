# Resume Clutter foundation work

Last updated: 2026-11-15. Documentation revision: 0.47, review23.
Read [AGENTS](AGENTS.md), this checkpoint and [README](README.md) first.

## Current position

Architecture qualification continues on **architecture/clutter-foundation**.
No production rebuild, accepted stack or provider implementation. Product decisions
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
| Next | Bounded per-page root / atomic Space version-set proof (PK01–10), then explicit G-Q baseline blockers |

## Branch and delivery state

Stay on architecture/clutter-foundation. User confirms delivery22 done; its exact
content base is85cc9499fce70f0a3c8c698d45c378c905331603. Exact new user commit/push was
not supplied. Review23 is docs-only over22; no agent commit/push and no production
or main changes. This workspace holds later uncommitted foundation content; inspect
actual Git state, not just the stale local HEAD, before resuming elsewhere.

The separate accidental generated-output repair on main preserved five app fixes
and added narrow root ignore rules. Keep that backup and saved native sessions.
No main merge/rebase/reset or app/runtime/cache/artifacts/test-store staging.
Tiny PNG/PDF fixtures are source inputs. Apply helpers must guard this single branch.

## Exact next work — bounded page-partition proof

1. Read [readiness review](architecture-readiness.md), [F008](adr/F008-page-roots-and-atomic-version-sets.md)
   and [frozen PK01–10](page-partition-contract.json). All PK cases are not-run.
   Architecture review recommends PM/Y + shared TS core + SQLite/external files,
   but production format, native host/runtime and G-Q remain unaccepted.
2. In the existing isolated experiment, qualify per-page engine payloads inside
   one Space transaction system. Define exact page/commit/version-set and asset
   manifests before coding. Do not duplicate the SQL transaction engine or public
   command policy; preserve aggregate21/22 as controls.
3. Re-prove atomic task move with unchanged canonical task page; old/new reader
   snapshots and historical note/task/cover/pin closure; crash/retry receipts and
   stale ownership refusal. An unchanged old note must not resolve current task data.
4. Record actual encoded/written bytes and untouched heads. Aggregate whole-Space
   encoding and full retained-history startup verification are source-level scale
   risks, not measured failures. No broad performance pass from tiny fixtures;
   D11/reference host/Space-size/active-Space targets must be fixed before benchmarks.
5. Preserve all earlier user native passes. Browser regression availability remains
   blocked in this environment; do not invent passes or request a blanket Mac replay.
   After PK review, close exact remaining G-Q native/runtime/security/format/budget
   evidence and supersession scope before accepting a production baseline.

## Current recommendation and decision ownership

[Architecture review](architecture-review.md) owns comparison/recommendation;
[readiness](architecture-readiness.md) owns evidence/gate/module assessment;
[decision register](decision-register.md) owns decision dispositions. F006/F007/F008
stay Proposed; frozen old JG and new PK specifications keep original execution
fields, while executions live in evidence. This review creates no production folder
scaffolding, runtime result, accepted budget or API/format implementation.

Native shell choice remains open. Rust may implement platform mechanisms, never a
second domain core. Node's116.19MiB size is user-reported executable/Git-blob size,
not measured RSS/installer cost. Installed topology and full native flush remain gates.

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
