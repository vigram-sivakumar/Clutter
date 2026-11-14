# Shared command and vault API

Status: proposed logical contracts, not existing methods or executable commands.
Requirements: P-02, P-06, P-08, P-09, P-13, P-16 through P-35 as applicable.

## Interfaces and envelope

App, CLI and MCP are first-class adapters over one domain command/query API. They
never reimplement task/property/history/sync rules or directly manipulate storage.
Headless operation must work without hidden UI. CLI mutations use the same local
save/history/pending-sync pipeline; structured JSON results expose IDs, revisions,
local durability and transfer status separately. Markdown input/output does not
predetermine the canonical format. An AI needs local command-execution access and
authorization to use CLI; MCP is a separate adapter over the same core, not a
prerequisite for CLI access. Protocol payloads may differ;
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

Closing all windows does not necessarily terminate a headless authority; terminating
all Clutter processes does suspend Clutter-controlled reconciliation unless a
separately designed background agent runs. No such agent is implied by CLI support.

## Detailed R03 references

The [command specification](command-api-spec.md) owns common envelope, deduplication
ordering, outcomes, guards, reads and inverse semantics. Its [logical registry](model-api-contract-cases.json)
owns per-operation signature sketches and 24 unexecuted contract scenarios. The
[document model](document-model-spec.md) owns canonical semantic constraints. This
overview is a capability map, not a second signature registry. Internal sync and
maintenance operations are not automatically public CLI/MCP tools. All R03 contracts
remain conditional until wire schemas, policy choices and runtime evidence are ready.

## R05 provider qualification boundary

[R05 protocol](provider-sync-spec.md) keeps provider ingestion behind internal core
capabilities. SY-08 leaves sync-once/status exposure and process lifetime for R06;
no new implemented public command is claimed.

## R06 qualification preparation

[Local security](local-security-api-spec.md) supplies proposed admission/grant and
CLI/MCP framing boundaries. [Platform lifecycle](platform-boundaries-spec.md)
separates durable outcomes from process/transport lifetime; exact wire/exit codes
remain unaccepted and the R03 logical operation count stays 51.

## R07 matched live-authority/history evidence

[Matched results](r07-matched-comparison.md) execute synthetic shared read/insert/
outcome operations from desktop, CLI and stdio MCP against each live authority.
The relay is test infrastructure, not production IPC/persistence. Three strict
history gates remain open; D-01/D-03/D-04/D-05 and the target 51 operation sketches
are not accepted by these scoped passes. No existing manual result is revoked.

## R07 context history qualification update

[Build12 evidence](r07-history-ownership.md) closes the three demonstrated history
boundaries under the unchanged matched contract. Context lifetime owns history;
views do not dispose it. Six explicit unsafe-inverse refusals remain classified
separately from 24 applied/passed cases. The live synthetic app/CLI/MCP slice is
still ephemeral; durable owner/outcome/restart qualification is next. No D-01/
D-03/D-04/D-05 stack or target 51-operation API acceptance follows from this alone.
