# Acceptance matrix

Status: release-level specification. Bounded executions do not pass whole rows.
Current revision0.56: [scoped I1](i1/completion-review.md) is complete for the tested
disposable profile;80 prior runtime cases/strict TS/84 old regressions and guided
NC28-01…04 user reports are retained. CLI PROTECTED/sequence38 supplied; raw native
reports not audited. [H01](runtime-qualification/contract.json) now fixes the next
host/runtime cases; all candidate builds/measurements not-run. It cannot pass full
release rows or mixed-product D11 from paragraph host fixtures. Product scope and
existing recorded evidence remain unchanged.

| Test | Requirements                 | Gate and required observation                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-01 | P-03, P-23, P-30, P-34       | Initial/native: reviewed keyboard/IME/accessibility matrix across text, tables, image/PDF and read-only embeds. Backward/drag/cross-block selection, near-focus Home, emoji clusters, toolbar focus, native menus and immediate replacement are reliable. Capture settled and transient mismatches separately.                                                                                                                                                                              |
| T-02 | P-01, P-04, P-08, P-14, P-15 | Initial: same document in multiple panes/windows; alternating edits converge, selection/scroll/navigation stay local; rename/move retain destinations; suspended window reconciles by revision.                                                                                                                                                                                                                                                                                             |
| T-03 | P-05                         | Initial: A/B view and tool changes; A undo reverses eligible A edits only. Exercise overlapping text, move/delete dependencies, context closure and tab switching; unsafe inverse is explicit.                                                                                                                                                                                                                                                                                              |
| T-04 | P-02, P-06, P-09, P-24       | Initial: app/CLI/MCP semantic parity including tasks/history; stale local writes reject, repeated IDs do not duplicate, changed payload under same ID rejects, headless access works and uses the same local-save/history/pending-sync pipeline; JSON results distinguish local durability and provider state.                                                                                                                                                                              |
| T-05 | P-06, P-07, P-13             | Initial: close last view, fail save, lose/remove Space, kill/restart; protect pending work and prevent false saved state or stale-completion resurrection.                                                                                                                                                                                                                                                                                                                                  |
| T-06 | P-06, P-12, P-18, P-34       | Initial: inject DB/file/media-publication failures and inspect post-restart outcomes; no unavailable required image/PDF reference is reported durable; separately qualify OS/power crash guarantees.                                                                                                                                                                                                                                                                                        |
| T-07 | P-02, P-16                   | Initial: race app/CLI/MCP startup and authority takeover; one local authority per Space, safe locks/deduplication, no split ownership.                                                                                                                                                                                                                                                                                                                                                      |
| T-08 | P-07, P-13, P-14, P-15       | Initial: missing layout destinations, archived/deleted entities, dialogs/focus/embedded controls; correct command targets and content-independent layout recovery.                                                                                                                                                                                                                                                                                                                          |
| T-09 | P-09, P-10, P-22, P-30, P-34 | Initial: native/Markdown fixtures preserve supported IDs/media/opaque data or report loss; stale checkout refuses unsafe overwrite; read-only page embeds do not duplicate canonical bodies.                                                                                                                                                                                                                                                                                                |
| T-10 | P-11, P-12, P-18             | Initial: rebuild indexes and compare task/search/backlink facts; consistent export/snapshot closure for later backup, backend diagnostics and media roots. Automatic backup scheduling/rotation is not a pass requirement.                                                                                                                                                                                                                                                                  |
| T-11 | P-12, P-17, P-18, P-21       | Initial: list/compare/pin/export/restore; pin prevents automatic pruning including assets, unpin releases protection, stale restore rejects; winners and overwritten sync versions remain reconstructable through compaction.                                                                                                                                                                                                                                                               |
| T-12 | P-05, P-08, P-19, P-21, P-27 | Provider gate: two isolated stores, concurrent whole-document states, deterministic same winner regardless of delivery order/clock skew; retain both received states including late loser. Include dirty/IME view protection, remote undo boundary, task move/delete ownership and offline restart. Crash after local save/before upload and after remote ingest/before cursor persistence; restart retains outbound work and safely replays inbound. No automatic merge/presence required. |
| T-13 | P-19, P-21, P-24             | Provider gate: actual iCloud and Drive opt-in, permissions/credentials/path, partial/missing/duplicate delivery, disable/re-enable, invalid packages and no hidden AI/network transfer. Verify no upload echo, no false all-device-synced claim, expired-cursor rescan and app/CLI restart catch-up without assuming a daemon. A mock pass cannot certify provider support.                                                                                                                 |
| T-14 | P-17, P-22, P-26             | Initial: interrupted schema migrations, task/history/opaque-content decoder compatibility, older-client safe refusal; IDs and historical reconstruction preserved.                                                                                                                                                                                                                                                                                                                          |
| T-15 | P-03, P-08, P-11, P-19       | Initial/provider as relevant: pre-agreed small/typical/large document, PDF/image, task and history workloads; publish latency/memory/save/catch-up distributions against agreed budgets.                                                                                                                                                                                                                                                                                                    |
| T-16 | P-01, P-10, P-13, P-34       | Initial: current capability keep/redesign/retire inventory, image/PDF display/import/export and missing media; math/diagrams/drawings are outside planned scope.                                                                                                                                                                                                                                                                                                                            |
| T-17 | P-25, P-26, P-29             | Initial: template copy applies properties without tracking; custom types belong to notes/tasks, same-label variants never generate collection columns; collections show predefined fields and do not add custom properties.                                                                                                                                                                                                                                                                 |
| T-18 | P-01, P-13, P-26, P-27       | Initial/provider: task inbox independence/page identity, cut move/copy new identity, single placement, task/note delete/restore, archive visibility and indentation without subtasks; restore/move cannot duplicate a task.                                                                                                                                                                                                                                                                 |
| T-19 | P-28, P-31, P-32             | Initial/provider: controlled-clock fixed date/relative labels, separate schedule/deadline/reminder toggle; any-block reminders; archive suppresses and restore ignores missed reminders; repeat only on completion, upcoming original-schedule slot, empty next body, retry/reconnect idempotency.                                                                                                                                                                                          |
| T-20 | P-17, P-30, P-33             | Schema initially; before comment feature ships: text/block conversion leaves page reference, live embeds read-only; delete block removes thread, undo/version restore recovers both without unrelated reanchoring.                                                                                                                                                                                                                                                                          |
| T-21 | P-35                         | Initial structure: domain/protocol/policy modules contain no macOS-only imports; adapter and composition boundaries explicit; portable ID/path/format fixtures. Windows native support still needs Windows qualification when implemented.                                                                                                                                                                                                                                                  |
| T-22 | P-05, P-19, P-20, P-21, P-33 | Deferred cloud gate: live multi-person editing, presence, semantic operation convergence, roles/history access, offline revocation, anchored comments and selective undo on isolated replicas. Not an initial release blocker.                                                                                                                                                                                                                                                              |
| T-23 | P-12, P-18                   | Deferred automatic-backup gate: schedule, rotation and restore to clean device with documents/history/assets; snapshot contract preserved initially, but no automatic-backup feature claimed.                                                                                                                                                                                                                                                                                               |

## Evidence levels

Use domain/property tests for invariants, generated sequences for lifecycle,
integration/failure tests for persistence/IPC, protocol parity tests for CLI/MCP,
and actual browser/native input tests. Record revision, environment, fixture,
expected/actual state, seed/actions, artifact links and pass/fail/blocked.
Skip is not pass; a patched dependency is a distinct candidate. Defined traceability
is not runtime verification. Keep deferred gates out of initial pass totals.

## R02 specification reference

[Editor interaction specification](editor-interaction-spec.md) and its
[case catalogue](editor-interaction-cases.json) define the initial EI-001–EI-072
seed contracts behind T-01/T-02/T-03 and relevant T-04/T-05/T-08/T-09/T-11/T-12/
T-14/T-18/T-19/T-20 cases. None was executed as part of R02. The 60 shared cases
and 12 profile proposals are not a reported pass count. Required variation expansion
and Q-01–Q-09 policy review are explicit. Existing R01 fixture successes are not
new-architecture/native proof.

Do not freeze current Markdown Enter/marker/indent behaviour as universal acceptance
for structured candidates. Compare shared guarantees and required Clutter semantics;
report source/structured profile UX separately. Exploratory profile runs may inform
review without turning unresolved proposals into binding acceptance or failures.

## R03 model and API references

[Document model](document-model-spec.md), [command specification](command-api-spec.md)
and [operation/scenario catalogue](model-api-contract-cases.json) add DM-01–DM-15
and MC-01–MC-24. These are conditional logical contracts and unexecuted scenarios,
not passing domain/protocol tests. They cover identity/single placement, operation
replay-before-stale-guard ordering, local versus provider authority, restore/pin
closure, recurrence deduplication and failure protection relevant to T-02–T-14/
T-17–T-20. They are not exhaustive coverage of all 51 operation sketches.

R04/R06 must expand actual schemas/limits/failure-point cases and R07 must execute
them. R02 profile choices and M-01–M-07 cannot be silently resolved in an adapter
or an invented storage schema. A JSON catalogue that parses is not evidence that
any proposed command implementation exists or preserves these invariants.

## R04 failure specification reference

[Vault persistence](vault-persistence-spec.md) and [PF-01–PF-30](persistence-contract-cases.json)
provide candidate-specific fault/restart contracts for T-04–T-07/T-10–T-14/T-18/T-19
and related context/root cases. All are unexecuted. Distinguish process kill from
actual OS/power durability, single-file atomic replace from multi-entity commit,
complete snapshot from database-only copy, and index rebuild from canonical repair.
The existing R01 run and static catalogue validation do not pass these new gates.

## R05 provider qualification boundary

[SC-01–SC-30](provider-sync-cases.json) expand provider qualification with explicit
forbidden outcomes. All remain not-run; SY-04 ownership reconciliation is a release
blocker, and native/provider routes require independent evidence.

## R06 qualification preparation

T-01/T-02/T-03 consume [editor qualification instances](editor-qualification-instances.json)
and native evidence rules in [the plan](editor-qualification-plan.md). T-04/T-07/T-21
consume [HQ cases](host-security-cases.json); T-15 consumes proposed [budgets](qualification-budgets.json).
All new instances/scenarios are not-run. [Readiness](qualification-readiness.md)
separates exploratory setup, binding acceptance and native/provider availability.

## R07 first-slice evidence

This table remains unqualified as a full matrix. [R07 evidence](evidence/r07-2026-11-14.json)
provides partial core/browser observations; it does not mark whole T/EI cases passed.
Raw undo violates origin preservation and immediate final-cell Tab fails the tested
profile in both integration and control. Native/platform/provider gates stay open.

## R07 second-slice comparison

[Second R07 evidence](evidence/r07-02-2026-11-14.json) improves targeted selection
and origin-history results; it does not qualify the complete T/EI matrix. Synthetic
composition guards are not native IME proof, and raw-control failure is not a pass.
First-candidate persistence/CLI/MCP evidence does not transfer to the origin candidate.

## Native host preparation

Use [NM-01–NM-08](experiments/r07-two-view/native-macos/cases.json) as bounded manual
entry checks, not full T-01/T-02/T-03 qualification. Swift compilation/native
execution remain not-run; [preparation evidence](evidence/r07-03-2026-11-14.json)
does not supersede native gates. Actual reports must retain observed failures and
record input source/chords and unsupported cases.

## Entity closure evidence — build21

JG-12 has14 bounded Linux passes against the proposed canonical-task/Y aggregate
representation; [result and limits](r08-entity-closure.md) and execution evidence
are authoritative. Includes six real process deaths, unique placement, move/restore
closure and one RPC/CLI/MCP reducer. Does not accept native entity binding, clipboard
UI, task-page restore, production partitioning or entire feature criteria. JG-13
external PNG/PDF retained-root closure remains next. Earlier native passes preserved.

## External media evidence — revision0.46

[Media proof22](r08-media-closure.md) supplies12 bounded JG13/PS02/PS04 cases with13
real process-death boundaries: publication-before-reference, original receipt,
pin/history retention and safe orphan treatment. Notes and tasks share page-ID
body/cover associations. This is Linux inert-byte/storage evidence, not native
renderer, Mac full-flush/power-loss, general PDF security, production partitioning
or full release acceptance. Shared Store regression evidence: entity14, Node84
and2 headless original-model cases; fresh browser suites environment-blocked.
Next reconcile the gate ledger and Proposed ADRs in a decision-readiness review;
no automatic baseline acceptance or repeated manual session.

## Decision-readiness review23 — revision0.47

[Review23](architecture-readiness.md) reconciles earlier bounded evidence without
new runtime tests. Mechanism recommendation leads; G-Q is not passed. F008/PK01–10
qualify per-page payloads/atomic version sets/history closure next. Aggregate21/22
remain controls, not a production partition. Existing native/feature/security/format/
budget/provider gates stay at their required scopes; no blanket postponement or
acceptance from this document-only review. No repeated manual session needed.

## Page partition result24 — revision0.48

[PK01–10](r08-page-closure.md) pass headlessly with shared planners/transaction code.
Per-page writes, atomic task placement, coherent old/current task/media snapshots,
reference pins/leases and crash/receipt/catch-up closure qualified within the fixture.
No actual EditorView/native/scale or production-format pass. See implementation-entry
for Proposed I1 scope; G-Q remains before real-data cutover. Old manual results and
frozen specifications remain unchanged. One Space service runs the Core/Vault path;
there is no independent UI/CLI/MCP writer or second business authority.
