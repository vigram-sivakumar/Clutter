# Clutter foundation

## Current checkpoint — GUI launch37, 2026-11-16

User commit31df10cf/run2026-11-16T10-35-45-751Z-5b4941c3 reports all three
candidates built, signed, strict-verified and packaged CLI/MCP smoke PASS.
Swift/Electron artifacts retained and verified; Tauri now passes too. No host
winner: GUI, installed lifecycle/security and performance remain unqualified.

Launcher37 opens one verified existing signed candidate without rebuilding it.
20 support tests pass on Linux, including actual factory boot/reboot with the
same Space and fresh private bootstrap. These are not Mac GUI or benchmark passes.
Next: apply37, launch H-S from the completed36 run, confirm Ready and Alpha beta
in both views. Do not repeat NC28 tests or launch other candidates yet.
P-37 greenfield scope is included: no legacy-user/data migration work.


Status: architecture definition pack, revision 0.61, 2026-11-16. Product scope
confirmed; the production technology baseline remains unaccepted.
Baseline: `main` at `cae604273115c0c6c0d3ac34533b1e9834e9c778`.
Working branch: `architecture/clutter-foundation`.

New chat or AI agent: start at [START-HERE](START-HERE.md), then follow the
[roadmap](roadmap.md). [Architecture review](architecture-review.md) recommends
PM/Y origin-aware editing, a headless TS authority and SQLite for joined qualification.
[Gap ledger](architecture-gap-disposition.md) and [JG contract](joined-core-contract.json)
record remaining gates. [Joined result](r08-joined-core.md): JG-01–10 now pass with two actual editors and
one durable owner. [Mac runner](r08-native-runner.md) has bounded JN-01–04 user-reported passes, with
[reviewed native evidence](evidence/r08-native-manual-2026-11-15/review.json).
[Entity proof21](r08-entity-closure.md) passes14 Linux cases.
[Media proof22](r08-media-closure.md) passes12 cases with13 crash phases.
[Decision-readiness review23](architecture-readiness.md) now recommends the mechanism
combination and module boundaries; [F008](adr/F008-page-roots-and-atomic-version-sets.md)
and frozen [PK01–10](page-partition-contract.json) now have
[headless page proof24](r08-page-closure.md). The scoped [Core/API entry](implementation-entry.md) is accepted for disposable
implementation only: [I1a implementation25](i1/result.md) now has21 passing tests
and strict TypeScript. The [editor26 slice](i1/editor-result.md) adds23 actual-view/context tests (44 total),
including protected restart recovery. [Media27](i1/media-result.md) adds19 cases (63 runtime total) for immutable media
API/history/cover/editor compatibility. [Native build28–30](i1/native-result.md) now has80 passing automated runtime tests,
strict TS/84 old regressions, and guided NC28-01…04 user-reported Mac passes.
Supplied app-closed CLI output confirms PROTECTED at sequence38. Raw native reports
are not audited. [Scoped I1 completion](i1/completion-review.md) is recorded;
[H01 host/runtime contract](runtime-qualification/README.md) is now prepared; next
is the remaining safe tool/environment preflight; actual M4 Pro48GiB hardware
is recorded. Then matched isolated builds; no benchmark or production choice yet.
[One running Space service](runtime-ownership.md) explains the shared owner.
No manual replay, accepted production baseline or native-host selection.
The production combination remains proposed; I1a is working private implementation,
not production or user-vault migration.

## Purpose and authority

Design Clutter as one coordinated product across editing, storage, organisation,
app windows, external tools, retained history and optional provider sync, with
live cloud collaboration deferred.
Evaluate it as a greenfield product. Migration and implementation effort remain
visible planning dimensions with zero weight in architectural selection.

The 0.2 product scope, retained in 0.43, reflects the user clarification sequence. Earlier draft
requirements superseded by that discussion are replaced in this folder.
This pack contains requirements and proposals, not an approved implementation
specification. Existing documentation and `ARCHITECTURE_RULES.md` continue to
govern existing production code. Nothing here supersedes an existing ADR or
permits a production bypass. A future baseline approval must identify each
superseded rule explicitly before implementation changes it.

All new foundation documents live here. Older documents remain historical and
current-system references; they are not copied into competing target specs.

## Reading order and document ownership

| Document                                                                | Sole purpose                                                                              |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Resume checkpoint](START-HERE.md)                                      | Exact current position, patch prerequisites and new-chat continuation                     |
| [Roadmap](roadmap.md)                                                   | Named tasks, dependencies, evidence and next deliverables                                 |
| [Current capability inventory](current-capability-inventory.md)         | R01 source/wiring audit, target mapping, contradictions and validation gaps               |
| [R01 executed evidence](evidence/r01-2026-11-14.json)                   | Selected existing-test results and initial load-error/targeted rerun provenance           |
| [Editor interaction specification](editor-interaction-spec.md)          | R02 shared/model-specific behaviours, profile review and native obligations               |
| [Editor case catalogue](editor-interaction-cases.json)                  | 11 semantic fixtures, 72 unexecuted cases; not a canonical schema                         |
| [Document model](document-model-spec.md)                                | R03 logical entities, single ownership, historical closure and M-01–M-07 gaps             |
| [Command specification](command-api-spec.md)                            | R03 common envelopes, guards, outcomes, reads and inverse contracts                       |
| [API registry/scenarios](model-api-contract-cases.json)                 | 51 logical signatures and 24 unexecuted consistency scenarios; not wire schemas           |
| [Vault persistence](vault-persistence-spec.md)                          | R04 commit/ack, candidate encodings, protected roots, history/recovery/outbox and PS gaps |
| [Persistence failure catalogue](persistence-contract-cases.json)        | PF-01–PF-30 unexecuted fault/restart cases; not a crash harness                           |
| [Provider protocol](provider-sync-spec.md)                              | R05 packages, lifecycle, ordering and SY-01–SY-08 conditional decisions                   |
| [Provider feasibility](provider-feasibility.md)                         | Official facilities, candidate routes and untested native/provider gates                  |
| [Provider case catalogue](provider-sync-cases.json)                     | SC-01–SC-30 unexecuted scenarios; not a working simulation                                |
| [Editor qualification](editor-qualification-plan.md)                    | Native interaction gates, exploratory policies and evidence protocol                      |
| [Editor instances/probes](editor-qualification-instances.json)          | 102 unexecuted seed/timing instances and 16 additional probes                             |
| [Platform boundaries](platform-boundaries-spec.md)                      | Proposed headless ownership/lifetime and portable adapter contracts                       |
| [Local API security](local-security-api-spec.md)                        | Authentication/grants, untrusted content and adapter boundary proposals                   |
| [Qualification budgets](qualification-budgets.json)                     | Proposed numeric targets, workload recipes and decoder/queue bounds                       |
| [Host/security cases](host-security-cases.json)                         | 18 unexecuted process/IPC/security scenarios                                              |
| [Readiness](qualification-readiness.md)                                 | Actual availability, blockers and first isolated R07 experiment                           |
| [Candidate template](qualification-candidate-template.json)             | Required reproducibility fields; deliberately unpopulated, not a selected stack           |
| [R07 isolated experiment](experiments/r07-two-view/README.md)           | Runnable two-view candidate, standalone lock and CLI/MCP test adapters                    |
| [R07 findings](experiments/r07-two-view/findings.md)                    | Raw versus guarded undo and immediate-selection blockers                                  |
| [R07 executed evidence](evidence/r07-2026-11-14.json)                   | Exact scope, source manifest, 34 Node tests and 13 pass/2 fail browser probes             |
| [R07 second findings](experiments/r07-two-view/follow-up-findings.md)   | Public selection preflight and separate origin-aware history comparison                   |
| [R07 second evidence](evidence/r07-02-2026-11-14.json)                  | Targeted Linux passes, explicit raw controls and limits per candidate                     |
| [Native Mac run guide](experiments/r07-two-view/native-macos/README.md) | Build/run commands, automatic reports and bounded manual checklist                        |
| [Native preparation evidence](evidence/r07-03-2026-11-14.json)          | Support checks and explicit uncompiled/unexecuted native scope                            |
| [Agent instructions](AGENTS.md)                                         | Foundation-only continuation and evidence discipline                                      |
| [Native progress log](NATIVE-TEST-PROGRESS.md)                          | Reported results, pending cases and exact guided retest                                   |
| [Table contract](table-interaction-contract.md)                         | Confirmed keyboard/addition behaviour; supersedes old defaults                            |
| [Latest table evidence](evidence/r07-19-2026-11-14.json)                | Scoped regression, raw safety controls and unrun revised native work                      |
| [Product contracts](product-contracts.md)                               | Requirement IDs and initial/future scope                                                  |
| [Confirmed behaviour](product-behaviour.md)                             | Agreed task/property/template/date/comment semantics                                      |
| [Sync and portability](sync-and-portability.md)                         | Opt-in provider policy, concurrency and Windows-ready boundaries                          |
| [System architecture](system-architecture.md)                           | State ownership and operation lifecycle                                                   |
| [Shared API](shared-api.md)                                             | App/CLI/MCP capability boundaries                                                         |
| [History](history-and-collaboration.md)                                 | Versions, pins, restore and future collaboration seam                                     |
| [Decision register](decision-register.md)                               | Remaining technical choices and evidence gates                                            |
| [Acceptance matrix](acceptance-matrix.md)                               | Tests traced to requirements with initial/provider/future gates                           |
| [Qualification spike](qualification-spike.md)                           | First local/native and provider experiment specification                                  |
| [Delivery plan](delivery-plan.md)                                       | Dependencies, reviews and patch prerequisites                                             |
| [ADR index](adr/README.md)                                              | Technical proposals and rationale                                                         |
| [Changelog](CHANGELOG.md)                                               | Specification revisions and withdrawn proposals                                           |

Requirements live in product contracts; other documents reference their IDs.
Acceptance IDs belong to the matrix. ADRs explain decisions rather than repeat
all requirements. Implementation agents must resolve contract gaps in the
specification instead of silently selecting product behaviour in code.

## Terminology

- **Space:** local content boundary and sync scope; vault means its local storage.
- **Document:** stable semantic identity, independent of any view or path.
- **Document session:** shared live state for one Space/document in one local
  coordination authority; provider-synced replicas reconcile under the explicit
  document-state policy, not independent window writes.
- **View:** editor projection with its own selection, cursor, scroll and focus.
- **Revision:** concurrency identity for state; not necessarily a retained version.
- **Version:** retained, restorable historical state with provenance; a pin protects
  it from automatic cleanup.
- **Task:** identity-bearing page content with one note-or-inbox placement; no
  subtask semantics.
- **Collection:** predefined-field query/view, not a custom-property database schema.
- **Undo:** reversal of eligible edits in one editing context.
- **Recovery:** protection and reconciliation of pending work after failure.
- **Contract:** required observable behaviour. **Proposal:** a design awaiting evidence.

## Current-system evidence

These are source anchors, not claims of complete feature coverage:

| Current source                                                                                        | Relevance to this work                                                         |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Application](../../apps/app/src/core/application/Application.ts)                                     | Existing composition and lifecycle wiring                                      |
| [DocumentRegistry](../../apps/app/src/core/engine/DocumentRegistry.ts)                                | Existing per-Application session ownership                                     |
| [DocumentSession](../../apps/app/src/core/engine/DocumentSession.ts)                                  | Current live/saved revision distinction                                        |
| [ADR-073](../adr/073-multiple-windows-preferences-belong-to-clutter-navigation-belongs-to-windows.md) | Earlier multi-window design; differs from proposed shared core                 |
| [Durability model](../durability-model.md)                                                            | Existing guarantees and documented gaps; describes no retained version history |
| [Keyboard ODR](../editor-research/canonical-keyboard-odr-v2.md)                                       | Earlier behaviour decisions and unresolved questions                           |
| [Automation package](../../packages/automation/AUTOMATION.md)                                         | Existing native acceptance infrastructure to assess                            |

Earlier research reported a PM focus conflict and experimental patch, incomplete
native keyboard qualification, and an FTS diagnostic discrepancy. Those are
leads to reproduce, not new passing evidence or verified upstream diagnoses.
R01 executed 30 selected existing Linux Node/jsdom files successfully across
initial and targeted reruns: 1,003 assertions passed. Initial dependency-load
failures and setup changes remain recorded. No full-suite/clean-install or
macOS/native/provider qualification is claimed; read inventory/evidence first.

R02 records the user's clarification that the current Markdown experience is not
the universal target. Source/structured profiles are evaluated on shared product
guarantees and their actual UX. No new runtime acceptance was executed for R02.

R03 drafts define semantic ownership/commands without choosing an editor, native
format or database. Model/API catalogue checks are static specification validation,
not domain/protocol test execution; R04/R06/R07 must close and qualify the details.

R04 compares backend commit contracts and primary documentation without selecting
one or executing crash tests. Its PS decisions are separate from product P IDs;
R05 drafted provider protocol/feasibility rather than raw live-file sync; its
coherence and route qualification remain blocked. R06 prepares native/editor and
host/security experiments; two R07 slices ran and native/broader qualification is next.

Build12 [context ownership results](r07-history-ownership.md) and
[evidence](evidence/r07-28-2026-11-14.json): the unchanged matched contract is green,
with 24 applied/passed cases and 6 explicit protective refusals. The prior three
history gaps are fixed; 84 Node checks and seven added browser lifecycle cases
pass. The [build 11 baseline](r07-matched-comparison.md), raw failures and earlier
[manual reports](NATIVE-TEST-PROGRESS.md) remain intact. The durable follow-up below
is now executed; next is architecture/ADR review. No complete architecture accepted.

Revision 0.37 adds [durable authority qualification](r07-durable-authority.md):
18 bounded process-crash/retry/recovery cases pass on the recorded SQLite profile.
The browser, CLI and MCP reach one durable owner; this is separate from the full
editor candidate integration. Next R08 review proposes choices and remaining gates;
no backend, host, editor or production rebuild is accepted.

Revision 0.38 prepares the [R08 review](architecture-review.md), proposed F006/F007
and13 not-run joined cases. No new runtime execution. User confirms13 applied;
review14 is incremental over13. No manual testing requested at this stage.

Revision0.39 executes [joined qualification](r08-joined-core.md):10 bounded Linux
passes; next native/installed host, with entity/external-asset gates still explicit.
Frozen JG declarations retain their original status; evidence records executions.
No production/ADR acceptance or broad manual rerun. Bundle15 supports exact13/14.

Revision0.40 prepares the [new native runner](r08-native-runner.md), pinned runtime
and context handoff;8 Linux helper checks plus retained regressions pass. Native
compilation/execution remains not-run. No stack approval or old manual replay.

Revision0.41 fixes the first Mac signing blocker: shell CLI is now a sealed resource,
not an unsigned MacOS subcomponent. User16 commit60b0505b/Swift compile confirmed;
next apply17 and retry native:joined. Mac signing/native acceptance remains open.

Revision0.42 fixes same-origin CSS blocked by CSP after observed Mac launch.8 helper
and10 joined cases pass including rendered layout; next Mac layout confirmation
before JN-01. No manual/native interaction pass inferred from the launch screenshot.

Revision0.43 addresses a user-observed reload/bootstrap failure. First use
native:joined:reopen for the SAME saved session; do not run a fresh builder until
recovery is checked.10 helper +10 joined Linux cases pass; user data/Mac results
remain unverified. Read START-HERE for the recovery-first handoff.

## Compiler follow-up29 — 2026-11-16

User applied/committed28 (e2613ec2), but Mac Swift compilation failed at
Main.swift:107: callAsyncJavaScript requires `in:in:`. Fix29 corrects the label
and adapts the completion closure. No Ready/NC28 manual pass is recorded.
Apply29, rerun `npm run native:core28`, and report Ready or compiler output first.
Do not use --new/reset for this failure; no valid28 session was created yet.
Prior77 runtime/TS/regression evidence remains historical, not a Mac compile pass.
Current instructions: START-HERE.md. No main/production/runtime owner changes.

## Native interaction follow-up30 — 2026-11-16

User confirms29 runs; screenshot Ready. NC28-01 remains incomplete: one remount
click left A closed, toolbar Undo/Redo jumped caret. Fix30 recreates A immediately
over the same context and retains local selection/history. Toolbar preserves mapped
current caret/range and focuses its target view; keyboard history defaults unchanged.
Three focused automated checks added; actual Mac retest pending. See fix30 review
for current test results. Older29 compiler-failure next-action text is superseded.

NEXT: apply30; safely close current lab; run `npm run native:core28 -- --new` for an
explicit NEW corrected synthetic run, preserving old bundle/store/report/locator.
Reopen runs its original bundle and cannot load patched source. No upgrade/reset
of an existing Space is attempted. Never use --new for recovery. Retest NC28-01
only; do not claim its Pass or advance02 until user confirms both issues fixed.
START-HERE.md is the current checkpoint. No main/app/real-vault changes.

Current next action: user33 Mac tools are supplied; apply [matched builds34](runtime-qualification/build34/README.md)
and get actual Mac compiler/headless smoke results. No another inventory/benchmark
or old manual replay. P-36 one-time/all-Spaces integration UX is user-confirmed.

Current host checkpoint36: Swift+Electron actual build/sign/headless smoke pass;
Tauri-only retry awaits canonical manifest fix. START-HERE has exact latest35 run
command. No new inventory, broad native replay, GUI or benchmarks requested.
