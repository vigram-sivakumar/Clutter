# Vault persistence specification — R04

Revision 0.7, 2026-11-14. Status: conditional design and qualification contract,
not an accepted backend, file layout or implemented storage engine. Inherits the
[model](document-model-spec.md), [API](command-api-spec.md), [history](history-and-collaboration.md)
and [sync](sync-and-portability.md) contracts. R02 Q-01–Q-09 and R03 M-01–M-07 remain
explicit; this document does not resolve them by choosing a physical schema.

## Required guarantee and non-goals

Local editing/reads work offline. A successful local durable mutation must survive
the failure class promised by its qualified durability profile and contain a
coherent state/outcome/history/publication obligation. An upload, notification,
cache refresh or successful file rename is not by itself that proof.

The same persistence boundary supports app, CLI and MCP. Provider transfer is
separate from the active store and does not execute direct SQL/file repairs around
the core. No automatic backup scheduler, live collaboration service, encrypted
Space feature or Windows runtime is added here. Future consistent snapshots and
platform-neutral contracts are designed now.

No new persistence/runtime tests were executed for R04. Its
[failure catalogue](persistence-contract-cases.json) is specification data with
PF-01–PF-30 scenarios and explicit fault points, not a crash harness or pass report.

## State and acknowledgement vocabulary

| State                        | What exists                                                                             | Honest claim                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Provisional input            | View input/composition not yet admitted by core                                         | Visible input, not accepted/persisted success                                        |
| Accepted local revision      | Validated coherent current state in authority memory; durable state may lag             | Accepted/pending local save, with revision and protection state                      |
| Recovery-protected revision  | A verified durable recovery record closes over its input/base/required roots            | Work recoverable at that recorded revision; not necessarily saved into current vault |
| Durable current revision     | Qualified commit covers required current state and metadata at the returned token       | Saved locally under the declared failure/storage profile                             |
| Pending publication          | Durable obligation and immutable state roots exist if sync enabled or explicitly staged | Not uploaded/synced merely because the local save succeeded                          |
| Provider staged/acknowledged | Transfer progress has provider-specific evidence                                        | Its precise scope only; never proof all devices downloaded it                        |

An accepted memory revision is not crash-safe merely because a timer is scheduled.
The unprotected typing interval and recovery/save batching require measured limits
in R06/D-11; no zero-keystroke-loss or old two-second interval is promised without
evidence. Intentional close/switch waits for durable save or verified protection;
Q-08 governs any explicit discard exception. Process termination can lose input
that never reached either durable boundary; the status/acceptance record must not
have claimed otherwise.

External mutations default to awaiting durable local completion. Timeout is pending
or uncertain, not proof of failure. Interactive content may update before durability
if input remains protected according to the declared contract. Coalescing disk work
must preserve each admitted operation's ordering/outcome and the needed retained
states; grouping history versions is separate from receipt/deduplication correctness.

## Logical persistence roots and owners

| Logical root                                          | Authority / required contents                                                                                           | Rebuildable?                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Current state                                         | Space model owner: entities, body structure, sole task placement, lifecycle and revisions                               | No                                                         |
| Retained states/version manifests                     | History owner: immutable state references, schema/provenance and owned task/comment/asset closure                       | No                                                         |
| Pin/catalog metadata                                  | History owner: labels/pins/retention metadata with separate catalog revision                                            | No                                                         |
| Tombstones/identity lineage                           | Lifecycle/sync policy: deletes/moves/generation identity required to reject stale resurrection                          | Not from current bodies alone                              |
| Operation identity/outcome                            | Authority: request identity/fingerprint, admitted/committed outcome, result identity map and safe retry protection      | No, until protected compaction protocol permits reduction  |
| Pending publication/ingestion                         | Sync policy: committed effect/state references, progress, provider evidence and replay-safe incoming state              | No while required for convergence/retry/history            |
| Recovery records                                      | Recovery owner: pending work, base revisions, affected fields/IDs, asset/staging roots, owner epoch and recovery status | No while work only exists here                             |
| Context/export/snapshot leases                        | Relevant owner: roots required by active undo, streaming reads, migration or export                                     | Must remain protected for a valid lease                    |
| Asset content/descriptors                             | Asset owner: retained bytes/revisions, integrity and availability                                                       | Previews yes; required original content no                 |
| Search/backlink/task indexes and parse/preview caches | Derived query owner: source revision/fingerprint, schema/parser/index version                                           | Yes; never the sole copy of a task/property                |
| Device/view configuration                             | Scoped settings/layout owner, separate from content commit/replication                                                  | No assumption it shares document history or provider scope |

These are logical records, not instructions to create twelve independent files or
services. A single transaction or commit-root manifest may cover several. R03's
single canonical structure/placement relation still applies; caches/reverse indexes
cannot become a competing write authority.

## Commit protocol required of every candidate

1. **Admit:** authenticate local caller, validate request shape, atomically resolve/
   reserve operation identity, then check current guards and semantic closure.
   Matching retry returns prior outcome before stale-guard evaluation, per R03.
2. **Prepare dependencies:** validate required asset bytes and stage immutable state
   or journal material. Keep protected roots for staged work. An asset referenced
   as locally available must reach its declared local durability boundary first,
   or a staged protocol must prevent a current complete-state success claim.
3. **Plan one coherent effect set:** include affected entities/placements, required
   retained states/tombstones/series changes, operation result/deduplication and
   pending-publication intent. Use one local snapshot for precondition validation.
4. **Commit:** publish one backend transaction or validated generation/root under
   exclusive local authority. The observable current state cannot show half a
   task move or note cascade. If disk commit is uncertain, keep protection and
   inspect; do not blindly issue a second mutation with a new identity.
5. **Acknowledge:** report applied/no-change/rejected/pending/uncertain and local
   durability separately. Required immutable roots/outcome must agree with an
   acknowledged durable state. Emit notification/index work after commit; losing
   notifications does not lose data or operation status.
6. **Reconcile cleanup:** release obsolete recovery/staging roots only after proof
   the corresponding revision is durable/replaced/protected elsewhere. Newer input
   that arrived while saving an older revision remains protected.

A no-op does not fabricate a content version; its operation outcome may still need
durable identity protection. A multi-item API batch may be partial only for genuinely
independent operations; one task move, completion/generation, conversion or restore
closure cannot be split into invalid per-entity successes.

## Backend candidates and authoritative encodings

Compare whole editor/model/storage combinations under the decision register. The
following are engineering proposals to qualify, not scored test results. Storage
work/legacy migration effort remains visible but has zero decision weight.

| Candidate | Single local commit boundary                                                                                                                | Required proof / main architectural limitation                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-SQL     | One local transactional store for authoritative current/retained state, placements, outcomes and outbox; immutable media files outside      | Prove asset/store ordering, schema constraints, durability settings, checkpoint/reader policy and exact release/build; no live DB file syncing                    |
| P-ROOT    | Immutable native state/version objects plus one versioned root manifest/generation containing current/history/outcome/outbox roots          | Prove journal/root switching, flush ordering, missing-object detection, cleanup leases and consistent readers; independent object writes alone are not a commit   |
| P-TEXT    | Authoritative text documents with identity/metadata/history plus a coordinator journal or coherent root protocol for multi-document effects | Prove rich fidelity/identity and coordinated changes; unrestricted external mutation cannot participate in the gate and requires reconciliation/conflict handling |

A native-file store may use a rebuildable SQLite index without giving that index
canonical authority. A log/checkpoint design belongs to P-ROOT or another explicitly
proved boundary; merely storing events does not establish completeness, undo or
retention. P-TEXT must say whether ordinary external applications see only committed
state; a private journal cannot stop them reading partially published multi-file
changes. If that limitation conflicts with the promised interface, reject that
combination or expose a qualified committed snapshot/checkout instead.

### P-SQL proposal

Use one authoritative database per local replica, with constraints/transactions
for affected canonical records and receipt/outbox roots. Persist either current
snapshots plus retained immutable states, or another explicitly selected canonical
encoding. Do not keep both an independent document JSON and independently writable
normalized task/body truth. Materialized query rows name source tokens and rebuild.

SQLite documents transaction atomicity and OS/storage assumptions [S1]. WAL readers
can proceed alongside a writer, but WAL is local-host storage, not multi-device
locking; WAL transactions across attached databases are not one all-database atomic
set [S2]. Proposed qualification baseline: a single database, explicit verified
journal/synchronous configuration, bounded transactions and reader lifetimes.

SQLite's synchronous setting distinguishes process-crash durability from OS/power
failure: WAL NORMAL can lose recent transactions after the latter; WAL FULL adds
commit synchronization [S3]. Therefore do not advertise power-loss-safe saved state
using a merely process-safe configuration. Exact VFS/flush/macOS settings, actual
readback and native failure tests are adoption work, not chosen by this paragraph.
Unknown pragmas are not a reliable configuration assertion [S3].

An online backup/snapshot API can produce a database snapshot [S4], but it does not
capture external asset bytes/history roots automatically. A live DB-file copy is
not the proposed export/provider protocol. Commit/checkpoint failures, long readers,
disk pressure and maintenance must preserve acknowledged state and report uncertainty
rather than deleting WAL/journal files manually. Review upstream advisories against
the exact pinned library build. Earlier FTS diagnostic research remains an unverified
lead until its fixture/build/isolation are reproduced; no current R04 pass or new
production bug is claimed.

### P-ROOT proposal

Write immutable payload objects/manifests, verify/hash and flush dependencies, then
switch the canonical root with a proved generation/journal protocol. The root covers
current state, retained history/pins, receipt identity and outbox roots together.
Readers open a consistent root generation, never an arbitrary directory listing.

The filesystem/platform layer must specify atomic visibility versus durable flush,
directory-entry persistence, interrupted temp writes, torn root detection and startup
choice. A checksum detects invalid bytes, not which generation was acknowledged
durable. A previous readable root is not automatically an acceptable silent rollback
of acknowledged edits. Fallback recovery must report degraded/lost-range state.

P-ROOT can retain immutable operation/state objects without making an unbounded log
the only readable format. Compaction must preserve identity/deduplication, history
reconstructability and every protected root before changing the root. Crash points
before/after root switch and before/after old-root collection are mandatory tests.

### P-TEXT proposal

Make source/dialect/ID mapping and rich unsupported content policy explicit. The
coordinator must durably journal enough before/after/identity/outcome data or use a
coherent snapshot root to recover multi-note/task changes. Atomic replacement of
one file does not make two note replacements atomic or prevent stale external writes.

External changes are untrusted proposals to reconcile, not confirmation that a
valid core transaction occurred. Do not overwrite dirty sessions or silently repair
conflicting IDs/metadata without defined provenance and loss handling. Markdown
file authority remains a viable candidate only if the complete required semantics
and promised external-access contract can be qualified, not because current Clutter
uses Markdown.

## Asset publication, staging and garbage collection

Use immutable retained content revisions even if descriptors/names change. A file
changed in place must not mutate historical pinned bytes. Prepare bytes in a private
staging area, validate integrity/type/limits, make retained content durable, then
commit the descriptor/reference and outcome/outbox roots. An interrupted import may
leave an unreferenced staged/blob object; it must not leave a falsely complete live
reference. Paths supplied by caller/provider are not permission to escape roots.

Garbage collection is mark/revalidate/sweep over a coherent root generation. Protect
current/history/pins/trash/recovery/outbox/inbound staging plus active undo/export/
snapshot leases. Revalidate before removing candidates if new commits/pins/leases
can add roots. A one-time recheck still leaves a check-to-unlink race: serialize
root acquisition and final deletion under an authority/GC admission fence, or
prove a generation/tombstone handshake that prevents a new live reference while
physical deletion is possible. A successful pin/publication cannot race a later
unlink based on an older root set. An unpin is not immediate deletion. Expiry of a wall-clock timer is
not sufficient proof another live authority/context stopped needing bytes.

Deletion of a note/task changes canonical lifecycle and tombstones; it is not physical
blob purge. Irreversible purge policy/retention duration remains PS-04 below. Preserve
unknown-content roots conservatively. Cross-provider deletion/retention proofs and
replica offline tombstone retirement belong to R05, not a local cleanup guess.

## History, pins, restore and compaction

Retain immutable owned-state closure at explicit checkpoints/overwritten-state
capture; group visibility/cadence is not the same as persisting every operation's
outcome. A historical note version referencing task t1 must decode historical t1,
not read its present body/location. Ordinary page links/embeds retain reference
semantics; whole graph snapshots are not implied.

Pin metadata and required root protection commit together. If a pin request races
cleanup, either the pin succeeds with its complete reconstructable closure or it
fails honestly before that promise. Do not return pinned success for already missing
payload. Pruning a detailed receipt/result must not allow an old accepted operation
to run again; retain minimal identity/fingerprint/outcome protection or a proved
lease/epoch/high-water scheme. Lookup returning unknown is not proof of no effect.

Restore planning reads a coherent current cut and retained manifest; commit rechecks
source availability/schema, target revisions and moved-task ownership. Atomically
apply the new valid current closure, history/provenance and publication obligation.
The old version stays immutable. M-04 still decides conflict resolution; persistence
must never silently create a second active t1 because an old note version contains it.

Compaction/migration may rewrite physical representation without fabricating user
edits, but must preserve semantic IDs, readable retained versions, required asset
roots, pending work and deduplication protection. Old decoders or verified migrated
states are required; unsupported clients refuse unsafe writes. R04 does not choose
unlimited retention or a specific budget.

## Recovery, owner lifetime and corruption

A recovery record identifies Space/replica, pending entity/field state or operation
sequence, base revision/fingerprint, retained asset/staging roots and active owner/
context epoch. Writes are serialized/versioned so an old delayed record cannot erase
new input. Cleanup after saving revision r cannot delete protection for r+1.

Distinguish live-owner work from abandoned work before offering recovery in another
window/process. Use verified ownership/fencing, not just a stale PID or a timestamp.
Startup replays/inspects the selected commit boundary before serving writable clients;
then it classifies recovery as already durable, applicable, conflicting, deleted/
missing or live-owned. Recovery never silently overwrites later current work.

SpaceId is logical shared identity; ReplicaId/store incarnation and authority epoch
have separate purposes. Copies/restores must not accidentally claim the old active
owner. A local exclusive authority coordinates app/CLI/MCP; a provider replica on
another device is deliberately different. PID-only lock files and database locking
alone do not prove headless authority election. R06/D-04 must specify actual OS/IPC
lease takeover; stale owners cannot resume writes after replacement.

On corruption/incomplete root/failed migration, preserve the damaged original and
protected work, stop unsafe writes and expose bounded read/recovery/export where
possible. Do not initialize an empty Space over it or delete journals to make it
open. Missing index/preview/cache may rebuild; missing canonical receipt/history/
placement content cannot be treated as a cache miss. Preserve diagnosis without
logging full note content or secrets. An older readable root must not be presented
as the latest fully saved state after known acknowledged data loss.

## Durable publication and inbound progress

A sync-enabled save and its required outbox intent share the qualified boundary.
Local-only mode does not require networking or an unbounded disabled-provider queue.
Enabling sync must establish a coherent baseline/current-history publication scope;
R05 defines that scope and what disabling does to already-pending work.
Outbox items reference immutable coherent state/effect roots and exact asset needs;
retries use stable publication identity. Provider unavailable/auth expired/desktop
closed does not roll back a valid local save. Transfer work resumes when a capable
process runs; no always-on daemon is assumed.

Pending-to-staged-to-provider-acknowledged progress is separately durable. If an
upload succeeds but acknowledgement write is lost, replay must not duplicate task
occurrence generation or drop historical states. Do not release last local roots
just because a provider folder write was staged. Coalescing publication cannot
silently discard unsent competing/retained branches or receipt obligations; exact
scope is R05.

Inbound ingest validates/retains the received package, preserves required losing
states, applies a valid coherent winner set and checkpoints progress atomically or
under a replay-safe staged protocol. Cursor advancement cannot skip uncommitted
content. Incomplete assets/packages remain pending or explicitly unavailable, not
an invented complete revision. Replaying a received state must not generate a new
repeat occurrence or outbound echo. M-06/D-08 decide cross-document coherence and
provider winner ordering; this is a local persistence contract, not a selected sync
protocol or live collaboration claim.

## Snapshot, backup seam and shutdown

A snapshot/export obtains a coherent root manifest/lease, including explicitly
requested current/history/version/asset scope, then retains those roots until
completion/cancellation. A metadata/database snapshot alone is insufficient for
external media; validate the complete manifest before reporting a portable result.
Provider transfer packages are not an automatic independent backup. Automatic
backup scheduling/rotation and encrypted Spaces remain deferred/not initial.

Shutdown quiesces admission, drains accepted coherent operations or durably protects
pending work, then flushes necessary outcome/recovery/outbox metadata and releases
ownership safely. Closing a view is not authority shutdown. A failed save cannot
be marked saved just because close was requested. Q-08 remains the explicit-discard
policy; normal close must protect pending input without imposing a new confirmation
on every successful operation.

## Failure catalogue and qualification

All old-or-new restart alternatives below apply only when that commit was not yet
acknowledged durable. Once durable success is reported, the acknowledged state
must survive the claimed failure class; a silent old-root fallback is a failure.

PF-01–PF-30 specify fault placement, restart observations and forbidden results in
the JSON catalogue. Run them for each candidate with deterministic failure points,
then on the actual macOS/native filesystem/OS profile. Test process crash separately
from OS/power failure. A clean subprocess kill does not establish power durability.

Record candidate/version/build, codec/schema, journal/flush readback, OS/filesystem,
fixture, operation/manifest IDs, fault timing, before/after root and revisions,
asset reachability, recovered outcome/status, logs and pass/fail/blocked. Repeat
with reads/pins/exports/cleanup racing commits. Numeric latency/storage/recovery
budgets remain D-11; do not invent passing thresholds after measuring.

### Open persistence decisions

| ID    | Must settle before related implementation/qualification                                       | Dependency                                  |
| ----- | --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| PS-01 | Commit/flush/ack profile, batching/protected-input interval and native filesystem scope       | D-03/D-11, Q-08                             |
| PS-02 | Exact canonical encoding/schema/root transaction, constraints and asset staging protocol      | M-06, D-02/D-03/D-09                        |
| PS-03 | Outcome identity retention/expiry, compaction and epoch/lease fencing rules                   | R03 retry contract, D-04, R06 host/security |
| PS-04 | History cadence/storage budget, explicit purge, pinned version deletion and GC lease lifetime | D-07/D-09, M-04, Q-05/Q-06                  |
| PS-05 | Recovery format/owner takeover, merge/refusal UX and corrupted-root degraded access           | Q-07/Q-08, D-04, R06                        |
| PS-06 | Consistent snapshot lease, migration rollback and historical decoder policy                   | D-02/D-07/D-09                              |
| PS-07 | Local outbox/inbound persistence and coherence assumptions passed to provider protocol        | M-05/M-06, D-08/D-13, R05                   |

PS-01–PS-07 are persistence decision labels, separate from product requirements
P-01–P-35. None is a backend acceptance record.

The draft is not implementation-ready until relevant decisions have evidence. R05
next defines provider packaging/order/deletion and feasibility; R06 closes host/
platform/security/budgets; R07 executes the qualification. No technology decision
is accepted merely because these contracts can be written for it.

## Primary references checked 2026-11-14

- [S1: SQLite atomic commit](https://sqlite.org/atomiccommit.html): transaction scope and storage assumptions, not a Clutter implementation proof.
- [S2: SQLite WAL](https://sqlite.org/wal.html): local-host scope, attached-database limitation and checkpoint behaviour.
- [S3: SQLite pragma/synchronous](https://sqlite.org/pragma.html#pragma_synchronous): readback/configuration and durability distinctions. Pin/review actual implementation versions before adoption.
- [S4: SQLite backup API](https://sqlite.org/backup.html): database snapshot mechanism; Clutter must add external media/root closure itself.

P-ROOT/P-TEXT protocols and Clutter-specific failure requirements above are design
proposals/inferences, not claims that SQLite documentation validates another backend.

## R05 provider qualification boundary

[R05 protocol](provider-sync-spec.md) consumes this document’s outbox, inbound
progress and protected-root contracts. Transport acknowledgements do not strengthen
local durability or release history/media roots by themselves.
