# Clutter foundation

Status: architecture definition pack, revision 0.5, 2026-11-14. Product scope
confirmed; technology proposals remain unqualified.
Baseline: `main` at `cae604273115c0c6c0d3ac34533b1e9834e9c778`.
Working branch: `architecture/clutter-foundation`.

New chat or AI agent: start at [START-HERE](START-HERE.md), then follow the
[roadmap](roadmap.md). Current next task: R03 conditional document-model/API drafts. R01 inventory is
complete; R02 specification is drafted with policy review and execution pending.

## Purpose and authority

Design Clutter as one coordinated product across editing, storage, organisation,
app windows, external tools, retained history and optional provider sync, with
live cloud collaboration deferred.
Evaluate it as a greenfield product. Migration and implementation effort remain
visible planning dimensions with zero weight in architectural selection.

The 0.2 product scope, retained in 0.5, reflects the user clarification sequence. Earlier draft
requirements superseded by that discussion are replaced in this folder.
This pack contains requirements and proposals, not an approved implementation
specification. Existing documentation and `ARCHITECTURE_RULES.md` continue to
govern existing production code. Nothing here supersedes an existing ADR or
permits a production bypass. A future baseline approval must identify each
superseded rule explicitly before implementation changes it.

All new foundation documents live here. Older documents remain historical and
current-system references; they are not copied into competing target specs.

## Reading order and document ownership

| Document                                                        | Sole purpose                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Resume checkpoint](START-HERE.md)                              | Exact current position, patch prerequisites and new-chat continuation           |
| [Roadmap](roadmap.md)                                           | Named tasks, dependencies, evidence and next deliverables                       |
| [Current capability inventory](current-capability-inventory.md) | R01 source/wiring audit, target mapping, contradictions and validation gaps     |
| [R01 executed evidence](evidence/r01-2026-11-14.json)           | Selected existing-test results and initial load-error/targeted rerun provenance |
| [Editor interaction specification](editor-interaction-spec.md)  | R02 shared/model-specific behaviours, profile review and native obligations     |
| [Editor case catalogue](editor-interaction-cases.json)          | 11 semantic fixtures, 72 unexecuted cases; not a canonical schema               |
| [Product contracts](product-contracts.md)                       | Requirement IDs and initial/future scope                                        |
| [Confirmed behaviour](product-behaviour.md)                     | Agreed task/property/template/date/comment semantics                            |
| [Sync and portability](sync-and-portability.md)                 | Opt-in provider policy, concurrency and Windows-ready boundaries                |
| [System architecture](system-architecture.md)                   | State ownership and operation lifecycle                                         |
| [Shared API](shared-api.md)                                     | App/CLI/MCP capability boundaries                                               |
| [History](history-and-collaboration.md)                         | Versions, pins, restore and future collaboration seam                           |
| [Decision register](decision-register.md)                       | Remaining technical choices and evidence gates                                  |
| [Acceptance matrix](acceptance-matrix.md)                       | Tests traced to requirements with initial/provider/future gates                 |
| [Qualification spike](qualification-spike.md)                   | First local/native and provider experiment specification                        |
| [Delivery plan](delivery-plan.md)                               | Dependencies, reviews and patch prerequisites                                   |
| [ADR index](adr/README.md)                                      | Technical proposals and rationale                                               |
| [Changelog](CHANGELOG.md)                                       | Specification revisions and withdrawn proposals                                 |

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
