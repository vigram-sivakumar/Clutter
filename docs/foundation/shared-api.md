# Shared command and vault API

Status: proposed logical contract, not existing method signatures or executable commands.
Implements P-02, P-06, P-08, P-09, P-13, P-16 through P-22 and P-24.

## Interfaces

App, CLI and MCP are first-class adapters over the same command/query API. CLI
and MCP do not drive hidden UI or independently manipulate database/files.
Protocol adapters may differ in pagination and presentation, never semantics.
Future agent/automation integrations use the same contract.

## Contract envelope

Every mutation identifies Space, targets, operation ID, authenticated principal,
editing context/origin, protocol/schema version, payload and preconditions. Caller
identity must be derived from a trusted local/remote boundary, not accepted from
an arbitrary `actorId` field. Revision tokens are opaque and scoped to their target.
Collaborative incremental operations may carry causal dependencies instead of a
single integer revision; whole-document replacement still needs a stale-write guard.

Results identify operation ID, affected targets, resulting revisions, durability,
source/provenance and structured errors. Reusing an ID with a different payload
is invalid. Deduplication scope and retention must be specified before shipping;
a timeout permits outcome lookup/retry with the same ID, never assumed failure.

Queries include the revision/freshness of returned data. Search pagination and
subscriptions must specify snapshot consistency. Notifications are hints, not
proof that the caller has observed every revision.

## Capability catalogue

| Capability      | Shared operations to specify                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| Space lifecycle | Discover/open/close; registry changes; inspect health and revision                                         |
| Documents       | Create/read; validated incremental changes; guarded replacement; rename/move/archive/delete/restore        |
| Structure       | Insert/remove/move blocks; update formatting, tasks and properties; maintain links                         |
| Queries         | List/filter/search; backlinks; task/daily-note queries; freshness and pagination                           |
| Assets          | Import/read/reference; verify availability; collect only after reachability checks                         |
| Versions        | List/inspect/compare; create checkpoint; label/pin/export; restore with preconditions                      |
| Interchange     | Native export/import; Markdown export/import; revision-bound checkout/commit with loss reports             |
| Collaboration   | Membership/roles; share/revoke; presence; operation catch-up and reconnect status                          |
| Reliability     | Wait for durability; inspect operation outcome; recovery discovery/resolution; backup/restore verification |

Editing-context undo uses the same validated mutation boundary; it is not an
unrestricted command to revert arbitrary revisions. Administrative repair tools
must be explicit, isolated capabilities, never the default AI write interface.

## Errors and atomicity

Define stable machine-readable categories: not found, invalid input, permission
denied, conflict, unsupported schema/protocol, unavailable, not committed,
uncertain completion, corrupt data and partial interchange. Adapters may translate
messages but retain categories and conflict details. Do not include note content
or secrets in routine diagnostics.

A batch declares whether it is atomic. Partial success is allowed only for an
explicit non-atomic batch with per-item outcomes and resumability. SQL transactions
cannot atomically include network delivery or arbitrary asset file copies; staged
publication and retry contracts must account for those boundaries.

## External AI workflows

- CLI/MCP reads Markdown or structured JSON with IDs and revision tokens, then
  submits semantic changes. Read-only clients can inspect without write permission.
- Checkout materializes editable files plus source revisions and stable mapping.
  Commit validates changed regions and reports conflicts/losses. Unsupported rich
  regions are preserved or refused, never silently flattened.
- Export/upload/import is the fallback for tools without local integration.
- File-only tools do not gain automatic live access to a structured database.
  That friction is an explicit product trade-off to measure in qualification.

No continuously writable Markdown mirror is assumed. No network-accessible local
API is assumed. Local IPC authentication, Space grants, attachment path traversal,
MCP exposure and destructive-operation permissions belong in the security spec.

## Contract tests

Run identical scenarios against core, UI adapter, CLI and MCP: permissions,
validation, stale revisions, repeat IDs, failure outcomes, history attribution and
headless operation. Compare semantic results, not identical transport payloads.
