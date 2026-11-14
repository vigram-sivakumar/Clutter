# Foundation architecture decision records

These identifiers are local to `docs/foundation/`; existing ADR numbers are unchanged.
All decisions are Proposed. Product requirements are binding inputs to evaluation,
not evidence that any candidate implementation already satisfies them.

| ADR                                            | Proposal                                                      | Status   |
| ---------------------------------------------- | ------------------------------------------------------------- | -------- |
| [F001](F001-shared-command-api.md)             | One shared capability API for app, CLI and MCP                | Proposed |
| [F002](F002-document-and-view-ownership.md)    | Document authority separate from view and navigation lifetime | Proposed |
| [F003](F003-qualify-editor-and-persistence.md) | Qualify complete editor/model/persistence combinations        | Proposed |
| [F004](F004-history-and-collaboration.md)      | Design retained history and collaborative semantics together  | Proposed |

Each accepted record must include evidence, consequences and explicitly affected
older rules. Changes to accepted decisions require a superseding record. The
[decision register](../decision-register.md) tracks qualification work.
