# Shared command and vault API

Status: proposed logical contracts, not existing methods or executable commands.
Requirements: P-02, P-06, P-08, P-09, P-13, P-16 through P-35 as applicable.

## Interfaces and envelope

App, CLI and MCP are first-class adapters over one domain command/query API. They
never reimplement task/property/history/sync rules or directly manipulate storage.
Headless operation must work without hidden UI. Protocol payloads may differ;
domain results and validation do not.

Mutations identify Space, targets, operation ID, trusted local principal/capability,
origin/context, protocol/schema version, payload and revision/preconditions.
Do not trust an arbitrary actor ID as authentication. Results include operation
ID, affected revisions, durability/outcome and structured errors/provenance.
Reuse of an ID with changed payload rejects; timeout permits original-ID retry or
outcome lookup. Specify deduplication scope/retention before shipping.

Queries include source revision/freshness. Search pagination and subscriptions
need snapshot/catch-up semantics. Notification delivery is not revision truth.

## Capability catalogue

| Capability           | Initial commands/queries to specify                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Space lifecycle      | Registry/open/close, health, revision and local authority discovery                                                          |
| Notes/pages          | Create/read/edit/guarded replacement, rename/move/archive/delete/restore, selected-content conversion                        |
| Tasks                | Inbox create, page open/edit, single-location move/copy/delete, standard fields/completion and idempotent recurrence         |
| Properties/templates | Entity-local typed custom properties; one-time template copy with new entity IDs                                             |
| Queries              | Predefined collection fields, Tasks views, search/backlinks, freshness/pagination; no arbitrary property-to-column inference |
| Dates/reminders      | Fixed date mentions, separate reminder toggle, schedule/deadline, eligibility/archive suppression                            |
| Assets/embeds        | Image/PDF import/read, read-only page projections, references, validation and reachable-root collection                      |
| Versions             | List/inspect/compare/label/pin/unpin/export and guarded restore with content/task/comment/asset closure                      |
| Interchange          | Native/Markdown import/export, loss reports, revision-bound checkout/commit                                                  |
| Provider sync        | Opt-in settings, validated state ingest/publication, status, history-preserving winner reconciliation                        |
| Reliability          | Await durability, inspect operation outcome, discover/resolve recovery and consistent snapshot boundary                      |

Deferred catalogue: live participant presence, membership/sharing roles and remote
operation merging; automatic backup scheduling. Comment APIs require phase decision
before shipping; document/thread identity and restore closure are reserved now.
Encrypted Spaces and public publishing are not initial capabilities.

## Mutation safety and sync

Same-device UI/CLI/MCP writes retain revision guards. Latest-document-wins is a
provider reconciliation policy, not an instruction for arbitrary stale AI writes
to replace current documents. The reconciler uses trusted ingestion/provenance
and the same domain/persistence boundary; transport adapters do not gain repair
SQL privileges. Task placement, recurrence and tombstones need valid reconciliation
before applying a current remote state. Preserve received but invalid data for
recoverable inspection without claiming successful sync.

Context undo is not arbitrary revision rewind. Restore is a new guarded mutation.
A batch explicitly declares atomicity; non-atomic batches return per-item outcomes
and resumability. Network/file publication is outside a SQL transaction unless a
staged protocol accounts for interruption and deduplication.

Errors retain stable categories: invalid/not-found/denied/conflict/unsupported,
unavailable/not-committed/uncertain/corrupt/partial-interchange. Routine diagnostics
must not expose note content or secrets. Validate provider filenames, paths,
packages, untrusted imported references and asset sizes at the ingestion boundary.

## External AI

CLI/MCP can read Markdown/structured data with IDs/revisions and submit semantic
changes. Checkout materializes editable files/mapping/source revisions; commit
validates conflicts and losses, preserving unsupported rich regions or refusing.
Tools with upload/download only use explicit interchange. No continuously writable
Markdown mirror or network-listening local API is assumed.

## Contract tests

Compare core/UI/CLI/MCP semantics for supported capabilities, permissions,
preconditions, retries, version attribution and headless use. Provider tests
separately prove convergence/history and do not weaken normal mutation guards.
Future cloud adapters require new permission/collaboration acceptance gates.
