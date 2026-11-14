# Shared command and query specification — R03

Revision 0.6, 2026-11-14. Status: conditional protocol draft, not implemented
methods, CLI commands or MCP tools. [Document model](document-model-spec.md) owns
entity invariants; [shared API overview](shared-api.md) owns architectural scope.
No editor, canonical format, IPC runtime or database is selected here.

## Contract authority and operation registry

[API contract catalogue](model-api-contract-cases.json) owns the operation IDs,
logical payload fields, guards, effects/results, access class, phase and scenario
cases for this draft. Those fields are signature sketches, not executable JSON
Schema or a complete wire protocol. This document owns common envelope, execution,
error, consistency and history semantics. Do not duplicate per-command policy in
UI/CLI/MCP adapters or assume the illustrative strings define a callable API today.

All supported app/CLI/MCP domain actions use this core. Internal provider ingest,
maintenance and authority lifecycle operations have separate capabilities and
are not automatically exported to an AI merely because they share the boundary.
Remote sharing roles remain future scope; local grants/OS boundaries still matter.

## Common types and proposed envelope

| Type              | Logical definition                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| EntityRef         | SpaceId plus typed target ID; paths/labels are never the target identity                                                                                                 |
| ExpectedState     | Target/structure ID plus opaque current revision token                                                                                                                   |
| ReadSnapshot      | Coherent local read cut with authority epoch and state references                                                                                                        |
| ContextRef        | Editing-context identity and origin; view/focus is separate optional adapter metadata                                                                                    |
| TextRange         | BlockId, base revision, from/to and declared coordinate unit; source versus semantic coordinate space cannot be implicit                                                 |
| InsertAnchor      | ContainerId plus before/after stable EntryId, or an explicit empty-container boundary; the corresponding structure revision is guarded by ExpectedState                  |
| BodyInput         | Validated semantic content or explicitly versioned interchange source decoded by the core, with loss/identity policy; adapters do not each implement Markdown conversion |
| ChangeSet         | Versioned allowlisted semantic edits with target/anchor guards and identity/lifecycle effects; not arbitrary JSON Patch or raw PM steps                                  |
| OperationIdentity | Space + trusted client/authority-issued namespace + stable operation ID; transport request ID is separate                                                                |
| PlanToken         | Read-only planned effect set bound to input, target revisions, schema and expiry; committing rechecks it                                                                 |
| OutcomeRef        | Same operation identity, usable to inspect uncertain/pending completion subject to authorization                                                                         |

Text coordinate encoding remains a draft choice: a semantic adapter can expose
Unicode-scalar ranges with base revision and expected text; a source adapter may
expose an explicitly versioned source snapshot/coordinate token. Both must map
safely to canonical content. Bare CM/PM offsets or unqualified regex replacement
are not valid cross-interface identities. Source content is an interchange/editor
projection unless its candidate canonical encoding is explicitly selected.

Illustrative request for an empty destination note (not a runnable command):

```json
{
  "apiVersion": "draft-1",
  "spaceId": "space-a",
  "operationId": "client-a:op-42",
  "contextId": "context-a",
  "command": "task.move",
  "expected": [
    { "target": "placement-t1", "revision": "placement-r3" },
    { "target": "note-a-container", "revision": "structure-r8" },
    { "target": "note-b-container", "revision": "structure-r4" }
  ],
  "payload": {
    "taskId": "t1",
    "destination": {
      "noteId": "note-b",
      "anchor": { "containerId": "note-b-container", "emptyBoundary": "start" }
    }
  },
  "waitFor": "durable"
}
```

Identity/authentication is obtained from the trusted connection/process capability,
not an untrusted actor field. A client supplies context/origin only within its
granted namespace. The request is not proof that it may access that Space or that
the expected revisions are current.

## Mutation execution and retry ordering

1. Authenticate/authorize request and target scope; validate envelope/version/limits.
   Authorization also applies when returning a previously retained outcome.
2. Derive the semantic request fingerprint (command/payload/preconditions/origin).
   Transport retries, wait duration and tracing IDs do not change the intended
   mutation. Check operation identity atomically before current-state guards.
3. For an existing matching identity, return its retained result or pending status;
   never execute again just because its old expected revision is now stale. Same
   identity with different semantic request returns OPERATION_ID_REUSED.
4. Reserve a new admitted identity under the authority's concurrency boundary, then
   read/validate all relevant current revisions, target existence, anchors, schema,
   ownership/lifecycle and asset requirements. Race-safe admission cannot be a
   disconnected lookup followed later by an unguarded mutation.
5. Apply one coherent effect set or prove rejection/no change. Persist state,
   historical closure, outcome/deduplication and pending-publication intent through
   the R04 boundary; expose accepted-but-not-durable status honestly if supported.
6. Publish mapped changes/notifications and update derived queries. Callers can
   await local durability or inspect the same operation identity after a timeout.

Exact backend reservation/journaling is R04, not solved by naming an operation ID.
Compaction cannot let an accepted identity execute again. Retain outcome/identity
protection or an explicit epoch/lease/high-water protocol; outside its valid window
return expired/unknown and reconcile rather than assume it failed and resubmit a
new mutation. Idempotency is not a promise to retain every full request forever.

## Results, durability and errors

Results identify affected entity/structure revisions, semantic ID remapping,
optional view-anchor mapping/resnapshot hints, provenance, change/effect group and
operation outcome. They do not broadcast another view's cursor or raw internal
editor state. Local and provider state are separate fields.

| Result dimension | Meaning                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| pending          | Admitted/known in flight; caller must inspect/wait rather than assume failure                               |
| applied          | Accepted domain effect exists at returned revision; local durability still explicit                         |
| no_change        | Evaluated no-op; no fabricated content revision/history version                                             |
| rejected         | Proven no domain effect; structured reason/precondition detail available                                    |
| uncertain        | Effects/durability cannot yet be proved; retain protection and inspect/reconcile                            |
| localDurability  | not_applicable / pending / durable / unconfirmed; never inferred from UI timeout                            |
| providerState    | disabled / pending / staged / provider_acknowledged / retrying / blocked, or an explicitly scoped aggregate |

External mutations default to waiting for local durability, not cloud upload. A
wait deadline may return pending/uncertain with OutcomeRef, never an unqualified
success or rejected result if effects might exist. “Provider acknowledged” does
not mean all other devices downloaded the state. Partial asset availability is
not full successful publication.

Error categories are versioned: INVALID_ARGUMENT, NOT_FOUND, ACCESS_DENIED,
PRECONDITION_FAILED, ANCHOR_INVALID, OWNERSHIP_CONFLICT, UNSUPPORTED_VERSION,
UNSUPPORTED_CONTENT, OPERATION_ID_REUSED, OPERATION_EXPIRED, UNAVAILABLE,
NOT_COMMITTED, UNCERTAIN, DATA_INVALID and INTERCHANGE_LOSS. Include affected IDs,
expected/actual tokens when allowed, recoverability, and whether retry of the
same identity is safe. Do not leak content through denied errors or routine logs.
CLI can map these to stable nonzero exit statuses and structured JSON; numeric
mapping/tool names/flags and transport framing are R06, not frozen implicitly here.

## Edits, structural intents and multi-entity atomicity

ChangeSet accepts only known semantic operation variants such as insert/replace
text, set/remove marks, insert/remove/move entries, property changes and named
split/join intents. Each requires the relevant base revision/range/anchor and
explicit content model/profile; Q-01/Q-02/Q-04 determine unresolved structural
variants. Unsupported intent is refused, not interpreted by whichever engine
receives it. Unknown payload is preserved/refused as DM-14 requires.

Bulk body replacement or imported Markdown is not a backdoor around task/asset/
opaque-content validation. Planning identifies removed placements, affected task
lifecycle and fidelity losses; the command validates those effects before applying.
This does not require a confirmation dialog for each normal reversible edit.
Routine UI gestures already express the intended selection/delete operation.
Irreversible purge and destructive exceptions remain separately scoped policies.

A task move atomically removes source placement and inserts destination placement
without changing task identity/body/history. Guard placement and affected structure
revisions at a minimum. Whether unrelated task-body edits should block a move is
an explicit token-granularity/concurrency choice; never silently overwrite them.
A move, note deletion cascade, recurrence completion or page conversion is not a
non-atomic batch merely because it touches multiple entities.

Public batch execution declares all-or-nothing versus per-item-independent scope.
Only independently valid operations may use partial mode, with per-item outcomes.
Do not split one task move/restore closure into successes that violate DM-03.
Disk/network/file boundaries still require a proved staged protocol in R04/R05.

## History, undo and plans

Local editing-context undo/redo submit inverse/reapply intents with preconditions through
the core. Context history owns eligibility/grouping/mapping metadata; domain
commands own inverse validation. Another context's changes cannot be removed by
a blind old snapshot restore. If an inverse is unsafe, return explicit conflict/
refusal/narrowed effect under D-05 and Q-05/Q-06/Q-07. No generic “set revision back”
operation substitutes for selective interactive undo.

Version restore is distinct: preview/plan the selected immutable manifest closure,
then guarded commit as new current revision(s). A plan binds current target tokens,
source VersionId and ID/location conflict resolutions. Recheck all of them at
commit; stale plans reject or require explicit replan. Moved historical tasks do
not get duplicate placements. Restoring as copy versus relocation stays M-04.

Pin/unpin changes history-catalog state rather than pretending the body was edited.
Pinned manifests retain referenced task/comment revisions and assets. Automatic
pruning cannot override pins; explicit purge rules are R04. A caller cannot request
an unsafe inverse by lying about a user-visible action name.

## Reads, subscriptions and navigation

Read responses name ReadSnapshot plus entity revisions and projection freshness.
A note containing tasks either returns their coherent referenced revisions or a
clearly scoped lazy descriptor; it cannot claim one historical snapshot while
resolving a task body from a newer live revision. Predefined Tasks/collection fields
read authoritative facts; custom-property names never generate a query schema.

Search pagination binds query/filter/sort and snapshot or explicitly live semantics;
invalid/expired cursors require restart/resnapshot. Derived-index freshness carries
its applied token/watermark; a stale index cannot masquerade as current entity state.

Subscriptions emit affected IDs, accepted revisions, local feed cursor/authority
epoch and optional validated mapping hints. Events are hints and may duplicate,
reorder or be missed. Catch-up returns complete supported changes or an explicit
resnapshot boundary; consumers cannot assume a contiguous log survives compaction/
restart. A local feed position is not global provider winner order.

Open-in-view, back/forward, focus and layout are application/view capabilities,
not content mutations. They resolve typed destinations and retain independent
selection/navigation. CLI/MCP task.read or document.read does not require opening
an editor or creating another task placement. All client types use the same domain
capabilities where authorized, with separate UI-only presentation actions.

## Provider, assets and trust boundaries

Asset import stages/validates content and declares availability. A document command
cannot claim an image/PDF available just from a URL/filename or pending bytes.
Publication consumes coherent durable state manifests/outbox; ingest validates
schema/identity/integrity/size/path and completeness before applying a remote winner.
Received losers still become historical states as the sync contract requires.

Provider reconciliation is a narrowly authorized core command, not permission for
CLI/AI to skip local stale-write guards. It must preserve DM-03/DM-08/task closure
under whole-document winner policy; M-06/D-08 remain provider-enablement blockers.
Missing packages/assets/tombstones are handled as pending/blocked states, not guessed
as fresh deletes. No shared-live-database or automatic merge is implied.

Capabilities are least-scope read/edit/import/history/sync/maintenance grants at the
actual local boundary; details of process authentication/IPC/session binding are
R06. This does not claim to stop the OS account owner reading unencrypted local
files. Remote page roles, encryption and a hosted identity service are not silently
introduced. A stopped headless host does not keep syncing unless a separate agent
has been specified and is running.

## Scope, traceability and readiness

The catalogue links command groups and R03 scenario cases to DM invariants,
requirement/acceptance IDs and EI cases. Reserved/deferred operations explicitly
remain unavailable until their policy/phase is qualified. The exact public CLI/MCP
surface must be generated/mapped consistently from the accepted API contract;
internal sync/maintenance capabilities are not public just because registered.

Outstanding: Q-01–Q-09 and M-01–M-07, concrete range/anchor codecs, request/result
wire schemas, durability journal/outcome retention, provider reconciliation unit,
local authentication, limits and platform host details. R04 drafts the persistence
boundary; R06 finalizes protocol exposure. This document does not accept a stack
or authorize production implementation before qualification.
