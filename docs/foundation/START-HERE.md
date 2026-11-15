# Resume Clutter foundation work

Last updated: 2026-11-15. Documentation revision: 0.46, build22.
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
| Next | Architecture decision-readiness review: reconcile evidence and remaining G-Q blockers before baseline selection |

## Branch and delivery state

Work stays on architecture/clutter-foundation. Remote17d63b3 is exact20, tree
f8e3b85c383bd656eb1b5e25df3035a98205e073. Delivery21 application is unconfirmed;
build22 supports exact20 or21 with a single matching preflight. No agent commit or
push; this workspace holds later foundation changes. Never reset to the historical
main cae604273115c0c6c0d3ac34533b1e9834e9c778 provenance baseline.

The user's accidental generated-output commits on local main were repaired by a
separate guarded utility, preserving five app fixes and adding root ignore rules;
reported result c3bb1d6d. Push success is not directly supplied in this thread.
Foundation is not merged into main. Keep repair backup and saved native sessions.
Apply helpers guard the foundation branch; stage only source/docs/evidence under
this folder, never app bundles, runtimes, caches, artifacts/ or local test stores.
The tiny PNG/PDF fixtures are intentional source inputs, not generated app output.

## Exact next work — decision-readiness review

1. Read [media result](r08-media-closure.md), [entity result](r08-entity-closure.md),
   architecture-review.md, architecture-gap-disposition.md and the gate/decision
   register. Frozen JG contract not-run fields are historical; executions are separate.
2. Reconcile bounded JG01–10, four user-reported native cases (raw capture limits),
   entity14 and media12 against the intended architecture. Preserve reported passes.
3. Produce a concrete recommended baseline/module ownership with a table of proved,
   proposed and still-blocking G-Q decisions. Explicitly cover reference workload/
   budgets/Space-root partitioning, packaged runtime footprint, native file flush,
   installed discovery/grants/security/distribution, format/migration and fresh
   browser-regression availability. Do not silently mark these accepted.
4. Update Proposed ADRs and implementation gates around that review. Do not start a
   production rebuild or more broad exploratory spikes without a concrete gap.
   Ask only for material product choices, one example/question at a time if needed.

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
