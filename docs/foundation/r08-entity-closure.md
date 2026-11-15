# Canonical task ownership and historical note closure

Revision0.45, build21, 2026-11-15. JG-12 bounded Linux proof: **14 cases pass**.
This qualifies the proposed semantic representation's closure against the common
real owner, not a production format, native task editor or complete feature set.
The frozen [JG contract](joined-core-contract.json) remains unchanged; current
execution is recorded separately in evidence/r08-21-2026-11-15.json.

## Representation under test

Read [frozen entity contract](experiments/r07-two-view/entities/CONTRACT.md).
One Y.Doc owns `notes` and `tasks` maps. Each task record owns one title, one typed
property map and one PM/Y body. Each note has its own PM/Y body; a task_slot holds
only stable task/block IDs. Rendering/opening a task resolves the canonical entity.
No duplicated writable task body/properties, persisted placement index or Markdown
mirror. Historical roots intentionally retain earlier bytes, as version history.

At most one note slot may name a task. No note slot means independent task page;
the inbox can find it from the task registry/derived placement query. A move stages
the two note bodies, validates the whole entity graph, and commits one accepted Y
BLOB plus original receipt through the existing SQLite Store. The fixture uses a
coarse Space aggregate revision; the common Store's `documentId` identifies that
aggregate root, not an individual note. That compatibility seam is not the final
public naming/partition contract. Titles/paths never determine entity identity.

Notes and task bodies have stable paragraph IDs. A task slot ID is derived from
its immutable task ID and remains stable across moves. Task bodies permit only
paragraphs in this subset, so nested tasks are refused. Custom properties cover
text/date/checkbox/number and typed empty values in the fixture, not the entire
future property codec. Collection view policy is not changed.

Historical reads resolve note slots and task content from the same old root, even
when the task has since moved and changed. Restoring note content is a separate
operation: it refuses changed task-slot ownership, including a task moved away,
detached to inbox or inserted after the old root. It cannot duplicate a task, pull
one back or silently detach it. Where ownership is unchanged, it restores note
blocks while preserving the newer independent task body/properties. These are
conservative qualification proposals pending product/architecture review. Separate
task-page version restore, conflict resolution UI and cross-note undo are unqualified.

## Executed cases

| Cases | Result |
| --- | --- |
| EN01–03 | Canonical task page, derived projection/placement, atomic move and inbox independence; title/body/properties preserved |
| EN04 | Duplicate/dangling/nested identities, duplicate block IDs, fake projections and invalid staging refused |
| EN05–08 | Pinned historical note/task readback; moved/detached/inserted placement conflict; safe note restore does not rewind task |
| EN09 | Stale preview and competing moves recheck latest root; one accepted effect |
| EN10 | Six actual child-process deaths around BEGIN/root/outcome/COMMIT/reply; old-or-new state, original receipt and exact retry |
| EN11 | Failed save leaves both notes and task unchanged, then one successful retry |
| EN12 | Desktop-facing RPC, existing CLI transport and thin MCP wrapper share reducer/receipt; canonical task edits visible through note projection |
| EN13–14 | Single Y BLOB per SQL revision, root/hash/receipt closure, restart, typed input/nested task/unknown-codec refusal |

Before-commit crashes recover version0/source placement; after-commit/pre-reply
crashes recover version1/destination placement. Retrying the original request
always ends at version1, with no second move. Changed operation-ID reuse refuses.
Faults are SIGKILL at observed phases, not simulated reducer exceptions. This is
process-crash evidence on the recorded Linux filesystem, not a power-loss claim.

No change to `durable/store.mjs`, `durable/host.mjs`, existing editor/history/native
implementation or dependencies. Entity schema/model is a separate marked profile;
CLI framing/transport and MCP framing are reused. Adapters contain no reducers.
The test support starts real owners/clients and controls faults through parent IPC.

Run from experiments/r07-two-view with the existing compatible Node24 SQLite
profile/dependencies: `npm run test:entities`. No Chromium, macOS build or new manual
session is required. Tests use temporary marked stores; results go to ignored
artifacts/. The evidence records runtime/pragmas, source hashes and contract hash.

## Current gate status and next work

The user's JN01–04 passes remain accepted as bounded manual observations; raw
build20 report and its exact capture limits are retained separately in
[native review](evidence/r08-native-manual-2026-11-15/review.json). Missing later
captures are not failed tests. Do not repeat that native session.

Next is JG-13: external valid PNG/PDF staging, immutable publication before SQL
reference acknowledgement, file/directory flush, crash reconciliation, pinned old
root retention and safe orphan treatment. In-DB BLOB attachments do not satisfy it.

Still open: production root partitioning/size/performance, bound full task schema
and native views, clipboard/move undo, recurrence/deletion/task restore, migrations,
grant/discovery/distribution/security, cloud/provider reconciliation and full
release coverage. Mac native reload-safety was not explicitly exercised by the
manual sequence. F006/F007 remain Proposed; no architecture baseline accepted.
