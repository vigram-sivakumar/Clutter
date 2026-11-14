# Provider sync specification — R05

Revision 0.8, 2026-11-14. Status: conditional server-free protocol proposal, not
implemented/qualified iCloud or Google Drive support. Read [provider feasibility](provider-feasibility.md)
for primary-source facts versus design judgments. Inherits [sync policy](sync-and-portability.md),
[model](document-model-spec.md), [API](command-api-spec.md) and [persistence](vault-persistence-spec.md).

No provider/account was connected, files uploaded or transport/runtime tests run.
The [SC catalogue](provider-sync-cases.json) specifies 30 unexecuted scenarios.
Live typing/presence/cloud membership roles are deferred; local latest-document
selection retains overwritten states. No shared active database, automatic text
merge, hosted webhook service or global physical-time guarantee is introduced.

## Scope and invariants

| ID      | Required contract                                                                                                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SYNC-01 | Local content/reads/saves are independent of provider availability. Active store and retained local media live outside the replicated transport set.                                                |
| SYNC-02 | Provider transport transfers versioned immutable state/media/effect packages; validation and domain reconciliation remain in the shared core.                                                       |
| SYNC-03 | Replica/commit identities survive retries; same identity/different bytes is a fork/equivocation error, not another successful update.                                                               |
| SYNC-04 | Given the same complete valid inputs and accepted protocol, replicas choose identical current states independent of arrival order. Concurrent overwritten states remain reconstructable in history. |
| SYNC-05 | Selection of whole-document states cannot violate task single placement, note cascade, recurrence deduplication or historical closure. Coherence-unit resolution is a release blocker.              |
| SYNC-06 | Provider file absence, permission loss, unavailable placeholders or a missed event are not canonical deletions. Deletion requires validated versioned intent/tombstone.                             |
| SYNC-07 | Local commit/outcome/outbox and inbound current/history/progress obey R04's durable boundary and replay rules. Upload/download retries do not execute a new task command.                           |
| SYNC-08 | No completeness/acknowledgement claim beyond observed scope; an upload does not prove every device has downloaded it. A staged manifest does not prove its assets are available.                    |
| SYNC-09 | Enabling, disabling, account/container switching and reconnect preserve local work and separate grants. No unintended cross-account copy or automatic remote purge.                                 |
| SYNC-10 | Transport hashes/format validation are integrity checks, not authentication of a person or page-level permission service. Credentials never enter packages.                                         |
| SYNC-11 | Different-document edits remain independent when they have no semantic ownership dependency; do not use whole-Space last-writer-wins as a shortcut.                                                 |

Each device maintains a durable local replica. Provider storage is transport and
retained exchange data, not a live multi-device SQLite file. Immutable package
JSON, if used, is a transport manifest, not a decision that documents use native
JSON or PM's schema. A source-file backend must still publish coherent validated
states, not invite uncoordinated overwrites of the live coordination files.

## Identities and binding

| Name                     | Meaning                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| SpaceId                  | Logical content identity shared by participating replicas                                                          |
| ReplicaId / incarnation  | Publishing replica namespace; a restored/copied installation must not reuse an active writer identity accidentally |
| CommitId / publicationId | Stable accepted logical change/package identity independent of retries or provider file IDs                        |
| StateRef                 | Entity/structure revision plus immutable payload digest/codec; not mutable provider mtime                          |
| ProviderBinding          | Local provider/account/container grant and mapping to SpaceId; credentials/device paths are local                  |
| TransportCursor          | Provider-scoped discovery position; not entity revision or global winner order                                     |
| Frontier / ancestry      | Known state/commit dependencies and retained checkpoint coverage                                                   |

A copied/forked Space and another replica of the same Space are different explicit
operations. Choosing a folder with matching display name is not a join protocol.
Bind Space identity/lineage before publishing; refuse/quarantine a mismatch rather
than merging by filenames. A reset/restored replica receives an appropriate new
writer incarnation and cannot make old accepted operations look new.

Initial proposal: local per-Space opt-in binding with one active provider at a time,
plus device-local account connections. The user approved settings opt-in, not this
exact scope/multiprovider policy; SY-01 must freeze it. Do not silently bridge
accounts/providers or duplicate a Space in both when a user changes a dropdown.

## Settings and lifecycle

| Phase                         | Proposed action / honest state                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local-only                    | No provider traffic or mandatory remote account; no unbounded disabled-provider queue                                                                                 |
| Connecting                    | Explicit user-selected account/access route; preserve local saves through cancellation/failure                                                                        |
| Joining / initial publication | Validate Space/lineage and choose create-versus-join; establish coherent baseline while local work is protected                                                       |
| Catching up                   | Download/validate required packages/media and ingest idempotently; not yet ready offline for missing content                                                          |
| Active                        | Publish durable pending work and discover remote changes while a capable process runs                                                                                 |
| Paused / access blocked       | Keep current local content usable, preserve pending intent, expose scoped status/retry/reconnect                                                                      |
| Disabled                      | Stop scheduling new Clutter transfer for that binding, handle in-flight work under the defined policy; do not delete local notes or pretend remote copies were erased |

Enabling sync on existing local content is not publishing an empty server state over
it. Obtain a consistent baseline/snapshot plus a change boundary. Capture discovery
before/alongside listing, then catch up/reconcile so writes during listing are not
missed. If a local note and remote note already share identity, retain both states
and apply qualified ordering; do not infer they are byte-identical.

An initial full offline replica includes the explicitly declared current document
and required media scope locally; provider placeholder discovery alone is not enough.
If optional historical payload/media is not fully local, expose its availability
and scope honestly. History propagation/initial download scope is SY-06; no silent
claim that every retained version is backed up or present on every device.

Disabling revokes future scheduling, not bytes already delivered or provider OS work
already queued. An in-flight callback must check the binding generation before it
updates progress/starts another transfer; any already-published object stays real.
Retain pending local state and a deliberate re-enable baseline/progress policy.
Disconnecting an account also handles token/credential lifecycle; it is not a remote
purge operation. Switching provider/account is an explicit rebind/migration proposal,
not a silent data bridge. Rejoin must detect divergent lineages and protect both.

## Immutable package proposal

The exact codec/filenames/size limits remain SY-02/R06. A candidate layout has:

- A versioned Space/protocol descriptor and explicit replica/lineage metadata.
- Immutable payload objects addressed by a declared digest; immutable commit
  manifests referencing affected states/placements, prior dependencies, lifecycle/
  tombstones, series-generation provenance, history closure and required media.
- Optional per-replica heads/catalogues as discovery accelerators, never the only
  record of unsent/concurrent states. One mutable global latest file loses races.
- Advisory progress/retention metadata whose authority is explicitly scoped.

Logical manifest fields: protocol/schema/codec versions; SpaceId; ReplicaId and
incarnation; CommitId; causal dependencies/frontier; ordering metadata; effect-set
scope; state/history/asset references and digests/lengths; deletion/restore/generation
provenance; completeness and integrity information. No OAuth tokens, OS bookmarks,
window layout, cursor positions, raw PID locks or active database/WAL files.

Hash exact versioned bytes under the declared algorithm/encoding. Identical package
identity and content is replay; same identity with changed content is invalid and
retained for diagnosis. Duplicate provider files/names are not duplicate domain
operations: verify manifest identity/digest. Different provider file IDs can map
to one publication; one provider path can no longer be assumed permanently trusted.

Publish dependencies/media before a sealed manifest as a transfer strategy, but
never rely on file arrival order: a receiver may see manifest first. Validate actual
required bytes and schema before promoting complete current state. Preserve missing
packages as pending, not empty/default content. Pending/failed media is distinct
from a full successful sync. R04 protects staging/outbox roots until safe release.

## Ordering: a concrete candidate, not a claim of true global time

SY-03 proposes a persistent Lamport-style logical counter plus unique writer/
sequence/commit identity as a deterministic total key. New local publications advance
past known causal parent counters. Validate metadata/namespace/fork/dependency rules.
This proposal is independent of file modified time, Drive version number and clock
wall time; a causally newer state must outrank its ancestors.

Use a single transitive protocol order that extends causality. Do not implement
pairwise “prefer descendant, otherwise compare random IDs” without proving it forms
a consistent order over the whole set. Missing required ancestry/checkpoint evidence
is a catch-up dependency, not permission to trust arbitrary counters or assume empty
history. Persist counters/incarnations before they can be reused after restart.

For genuinely concurrent edits this selects a deterministic protocol winner, not
provably the last real-world keystroke. An offline device with more local edits may
rank differently from a device's physical timestamp. This meaning of latest needs
review/qualification before shipping. No server-free clock rule can promise a trusted
global physical chronology. Retain received losing states and their media/schema
closure before releasing current-state protection.

Hashes/counters do not authenticate a human; an authorized folder writer can submit
malicious data. Validate bounds/lineage and fail safely, but do not advertise stronger
trust than the selected provider/account/security model provides.

## Coherent reconciliation: unresolved blocker made explicit

Simple per-note winner selection is adequate only when notes have no shared owned
entity/lifecycle effect. In Clutter, moving task t1 changes two note placements;
concurrent moves can make two independently chosen note winners both contain t1.
A note delete/restore and repeat generation add further dependencies. Sorting packets
or having unique task IDs does not itself solve that ownership conflict.

SY-04/M-06 require a concrete coherent reconciliation unit/algorithm, with at least
these exploratory alternatives:

| Alternative                                                   | What must be proved                                                                                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical task placement register, note placement projections | Location/body/lifecycle and order have one authority; concurrent note delete/restore/move semantics remain coherent; this would refine R03 encoding, not silently add another Task.location |
| Transaction/effect-set reconciliation                         | Atomic grouped multi-root effects survive concurrent competing footprints without hybrid states; explicit conflict validity and deterministic resolution preserve unrelated notes           |
| Owned-document aggregate snapshots with closure rules         | Ownership components and external references remain consistent when tasks move between aggregates; historical manifests restore correctly                                                   |

These are not accepted merge algorithms. Whole-Space last-writer-wins would discard
unrelated note changes and is not the approved document-level policy. Plain per-file
last-writer-wins can violate single placement. A package that cannot yet be applied
coherently is durably retained/pending/blocked with status, never reported as complete
successful provider support. That is failure containment, not a production resolution
strategy. Do not enable a provider until the algorithm is selected and tested; this
blocker cannot be hidden by a seamless UI or classified as implementation effort.

Ordinary independent-note updates must not be lost merely because another device
changed a different note. Restoring a historical note with a moved task remains
M-04; no transport shortcut silently relocates/copies it. Receiving an already
completed repeat occurrence never runs task.complete as a fresh user command.

## Upload, receive and cursor contracts

Upload uses durable R04 pending-publication intent. Retry the stable publication;
provider acknowledgement and local receipt checkpoint are separate crash points.
Backoff/rate/quota/auth failures do not roll back the local save. Progress persisted
for one binding cannot be reused under a different account/container. Coalescing
must preserve required history/branches and unresolved dependencies, not overwrite
one latest file repeatedly and assume cloud version history captured every state.

Receive sequence: discover → stage required bytes → validate manifest/lineage/
codec/integrity/limits → retain state/dependency closure → core reconcile under
qualified order/coherence → durably record outcome/current/history and progress.
A cursor may advance after a durably recorded pending package only if the pending
record contains enough discovery identity to resume its complete fetch/ingest after
restart. It must never permanently skip uncommitted/unrecorded content. Replay is
safe; provider events are hints, and invalid/unsupported input is quarantined rather
than parsed into arbitrary writable paths.

Poll/rescan on startup/resume/explicit request and at qualified active-process
intervals. Exact budgets are R06/D-11. No always-running Clutter service is promised.
The OS/provider may upload already-staged bytes after the UI closes, but it does not
run Clutter's domain reconciliation. Headless CLI/MCP edits use the same local outbox;
a scoped sync-once/wait surface and host lifetime must be mapped in R06 without
making ordinary note creation wait for cloud availability.

## Deletion, history and retirement

Only validated tombstones/explicit lifecycle state delete a note/task. A provider
404/missing path may mean lost permission, deferred download, listing scope change,
manual damage or deletion of transport objects; do not guess a domain command.
Preserve local work and expose incomplete/blocked transport state while reconciling.
A deliberate remote Space reset/unlink needs a separately versioned authorized
protocol, not “folder empty therefore delete every note.”

Retained historical states include losing concurrent states observed by this replica.
A provider overwrite stream cannot preserve a state it never delivered; unique
immutable publications are required for that guarantee. SY-06 defines exact history
propagation/download/retention rather than silently delegating user history to Drive/
iCloud trash/versioning. Pinned roots remain protected locally and throughout any
promised replicated retention scope. Providers may remove data independently; no
claim of guaranteed independent backup is made.

Tombstone/identity retirement needs an explicit offline replica policy. Do not drop
them after an arbitrary local timer and accept old offline state as a fresh note.
Possible qualified designs retain compact deletion/high-water information or require
retired replicas to rejoin from a validated checkpoint without replaying old writes.
SY-05 must choose the actual proof/lease model and user rejoin outcome. This does not
provide immediate revocation/erasure on offline devices.

## Trust, status and adapter boundaries

Core sync policy owns packages, order, validity, tombstones, roots and replay. Provider
adapters own discovery/read/write/progress/credentials mechanics and return scoped
observations. Platform adapters own local capability/credential storage and file
coordination. No adapter directly edits task models or bypasses local API guards.

Treat lengths/counts/depth/compression/path/codec/dependency graphs as bounded untrusted
input. Reject traversal, unsupported executable content and same-identity forks;
verify digests before decoder exposure. Bounds are mandatory R06 work. Logs/results
exclude tokens and note bodies by default. Provider sharing grants are not Clutter
page-level roles or end-to-end encryption.

Status has separate local-save, transfer and local-availability axes. Report states
such as local-only, waiting to upload, uploaded at this binding, catching up, waiting
for media, access blocked, unsupported protocol or coherence conflict. “Up to date”
means provider evidence and known-input catch-up at this client, not agreement with
every offline replica. Disabling or rebinding may leave provider copies behind.

## Decisions and qualification

| ID    | Open decision / proposal                                                                                                      | Gate                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| SY-01 | Per-Space/device opt-in scope, one-active-provider proposal, rebind/migration and initial create/join UX                      | Settings/API and provider enablement           |
| SY-02 | Package codec/digests/layout, completeness, discovery catalogue and numeric input/resource limits                             | R06/schema/security                            |
| SY-03 | Deterministic causal total-order key, incarnation rules and user meaning of latest                                            | R07 simulation and product/architecture review |
| SY-04 | Cross-document task/series/delete coherent reconciliation algorithm                                                           | M-06/D-08, provider release blocker            |
| SY-05 | Tombstone/identity retention, offline replica retirement/rejoin and trusted membership boundary                               | R06/R07 safety gate                            |
| SY-06 | Which history/media is published/downloaded/retained initially, pins and cleanup acknowledgement scope                        | R04 roots/history and provider feasibility     |
| SY-07 | Exact iCloud route, app-container visibility/signing and Windows path; Drive route/scopes/consent and shared-folder discovery | Real-provider native qualification             |
| SY-08 | Active/headless polling/status/retry budgets and sync-once API exposure/lifetime                                              | R06/D-11 and provider tests                    |

[Provider feasibility](provider-feasibility.md) records documented facilities, explicit
limitations and candidate routes. SC-01–SC-30 expand protocol/backend cases; simulate
partitions, clock skew, reorder/duplicate delivery and faults, then run actual native
providers independently. No credentials/signing/provisioning/OAuth project or user
account was configured here. R06 prepares host/platform/security/budgets and concrete
qualification fixtures; R07 performs evidence-based tests. Drafting is not enablement.
