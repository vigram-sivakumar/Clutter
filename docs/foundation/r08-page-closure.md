# Per-page roots and atomic Space snapshots

Revision0.48, proof24, 2026-11-15. **PK01–10 pass under the bounded headless Linux
profile.** This executes the frozen [PK contract](page-partition-contract.json);
its original not-run fields stay unchanged. Execution evidence is separate.
This is per-page storage qualification, not a new native editor/performance result.

## What changed

One Space service uses the existing Store connection, transaction/outcome logic,
shared entity/media planners and file publisher. Page Y payloads are independently
versioned. Common revisions rows hold only changed-root references, not a full
Space Y body or a copied full head map. One SQL COMMIT includes page payloads,
heads, derived placement/block/attachment indexes and original receipt.

The body/title/property/move/restore rules were extracted once and reused by both
aggregate controls and the page profile. Media admission/association checks and
immutable file I/O are reused. Shared Store adds ephemeral staged commit data,
initializer return data and an awaited metadata callback; it does not add a second
BEGIN/COMMIT implementation. The page adapter has no independent task reducer.

“Space service” means the one running Core application service with its Vault
adapter. Historical files call it owner/authority; those are not extra services.
[Runtime ownership](runtime-ownership.md) answers the UI/CLI/MCP boundary explicitly.

## Executed results

| Case | Bounded result |
| --- | --- |
| PK01 |3 notes/2 task pages; requested note read decodes only it and referenced task; a second writer on the same store is refused; corrupt/future roots fail without replacement |
| PK02 | One edit encodes/inserts only n1; four unrelated heads unchanged; note properties preserved; head guards do not rely on a global content version |
| PK03 | Move updates two note roots in one commit; canonical task payload/cover unchanged; exact retry returns original receipt |
| PK04 | Current and old-pinned note share identical note payload but resolve different task body/cover contexts correctly |
| PK05 | Moved/detached/stale restore refuses without mutation; safe note restore leaves newer task body/properties/cover intact |
| PK06 | Pin retains note/task roots and PNG/PDF after current removals/restart; interrupted import rolls back page/file-catalog references and retries once |
| PK07 |10 real process deaths around staging, descriptor, payload/index/head, outcome/COMMIT/reply recover old-or-new and exact retry |
| PK08 | Old/new immutable readers stay coherent across moves, edits and restart; explicit lease release; no long SQL read transaction |
| PK09 | RPC/CLI/MCP share original receipt; a paused headless observer catches up complete commit batches without notifications |
| PK10 | Structural bytes/encoded pages/history rows/deep-open work measured against a declared aggregate control; no speed/size budget pass inferred |

The two “view” clients here are headless read/projection clients, not actual
EditorViews or independent live Y editing contexts. The existing native/editor
route was not rebound to this profile. That integration remains part of I1 and
later native qualification; old manual keyboard passes are preserved, not replayed.

## Evidence limits

Structural measurements record one page encoding, descriptor bytes and only one
new immutable page payload for one edit. The aggregate control uses the same five
page titles/bodies/task properties; the page candidate additionally stores note
properties unsupported by the old minimal aggregate schema. No ratio is presented
as a benchmark win, and SQL physical/WAL bytes, latency and RSS are not measured.

Startup still performs a deep historical/root/index audit and reports its decode
count. Lazy normal reads do not establish a qualified production cold-start policy.
Snapshot leases have no expiry and no GC. Pins persist reference manifests, not
copied task bodies. Historical placement rows are intentionally retained; uniqueness
constrains current heads/indexes, not all history. Task-page version-restore UX,
cross-page undo, deletion/create lifecycle and full schemas remain unqualified.

The model's stable page-head API uses expectedHeads, while the common fixture
envelope retains documentId as a compatibility name for the Space ledger identity.
It is not a second document owner. The heads/metrics methods are test diagnostics,
not a production per-keystroke whole-catalog query. Per-page editor session updates/
protected drafts and a metadata notification cursor are not implemented by PK;
content commit sequence alone does not represent pin/lease metadata changes.
Public production names/version negotiation are
part of I1 contracts, not automatically frozen by this experiment.

Regressions: entity14, media12, Node84, two old snapshot/joined headless-port cases
and one native-context metadata callback case pass. That last case is a Linux
headless protect/release/restore check, not a macOS result. No new browser attempt
was made in24 because22 already established the environment socket block. No fresh
browser/native pass is inferred. Previous raw reports and passed user checks stand.

## Implementation handoff

The partition proof is complete for this scope. Next is the **scoped I1 entry
decision and shared Core/API module implementation**, not another broad engine
search. [Implementation entry](implementation-entry.md) defines the first slice,
the remaining decision step and the hard boundary before real-vault writes.
[F009](adr/F009-scoped-core-implementation-entry.md) is Proposed; it does not accept
the full runtime, native format, G-Q or shipping baseline. No product packages,
production code, main changes or user-vault writes occur in24.
