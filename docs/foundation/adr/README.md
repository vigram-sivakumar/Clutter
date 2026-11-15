# Foundation architecture decision records

Identifiers are local to this folder; existing ADR numbers/statuses are unchanged.
Technical proposals remain Proposed. Confirmed product directions are recorded in
product-behaviour.md; they do not establish that a candidate meets those contracts.

| ADR                                              | Proposal                                                                       | Status                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------- |
| [F001](F001-shared-command-api.md)               | Shared app/CLI/MCP capability API                                              | Proposed                          |
| [F002](F002-document-and-view-ownership.md)      | Shared local document state, local view/navigation lifetime                    | Proposed                          |
| [F003](F003-qualify-editor-and-persistence.md)   | Qualify complete editor/model/persistence combinations under current scope     | Proposed                          |
| [F004](F004-history-and-collaboration.md)        | Retained/pinned history and optional provider reconciliation; live cloud later | Proposed, revised from 0.1        |
| [F005](F005-product-entities-and-collections.md) | Single-location task identities and predefined collection fields               | Proposed; product rules confirmed |

Accepted technical records require evidence, consequences and explicitly affected
older rules. Changing a future accepted record requires supersession. Proposed
records may be revised with the changelog, as F004 was in 0.2.

## R08 proposed combination and runtime records

- [F006](F006-structured-origin-and-transactional-roots.md): PM/Y origin-aware
  contexts and versioned transactional roots — **Proposed; mechanism evidence reviewed**.
- [F007](F007-headless-runtime-and-platform-composition.md): one headless semantic
  runtime with thin platform clients — **Proposed; fixture evidence reviewed**.

[Review](../architecture-review.md) compares alternatives and identifies old-rule
impact. Neither record supersedes accepted production rules or accepts F001–F005.
The frozen13-case [JG specification](../joined-core-contract.json) keeps its original
not-run fields; current executions are in the evidence/review, not rewritten there.
- [F008](F008-page-roots-and-atomic-version-sets.md): per-page engine roots and atomic
  Space version sets — **Proposed for bounded partition qualification**.

[Current readiness](../architecture-readiness.md) identifies remaining gates. None
of these records is an accepted production baseline; PK01–10 have not run.
