# Document model specification — R03

Revision 0.6, 2026-11-14. Status: conditional semantic draft, not accepted physical
schema or implemented classes. Inherits [product contracts](product-contracts.md)
and [confirmed behaviour](product-behaviour.md). Supports [R02](editor-interaction-spec.md)
without silently closing Q-01–Q-09. Proposed storage/encoding choices still need
qualification; neither Markdown nor SQLite nor PM internal JSON is selected here.

## Boundaries and vocabulary

A **content entity** has one semantic identity/current state. A **content tree** is
a value owned by that entity, not a second independently writable document. Views
serialize/project the state for editing, queries, CLI or MCP. Immutable versions,
recovery records and provider replicas have explicit authority/lifetime; they are
not accidental duplicate owners.

This model names logical records/relations for validation. A selected storage
encoding may nest records, use rows or store source with identity mappings. It must
not independently persist both a parent pointer and a child list as competing
structure authorities. PM positions and CM6 offsets belong to adapters, not IDs.
A source candidate must demonstrate preservation/mapping of the required semantic
identity; a structured candidate need not manufacture Markdown marker mechanics.

## Entity and value catalogue

| Logical type               | Identity / owns                                                                           | Derived or referenced, not another authority                               |
| -------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Space                      | Stable SpaceId; content boundary and schema/protocol capabilities                         | Filesystem location/provider container is a locator, not identity          |
| Note                       | EntityId; note/daily-note role, title/body, custom properties and organisation membership | Display labels/previews/collections                                        |
| Task                       | EntityId; title/body, standard fields, custom properties and task state history           | Task-page view, note appearance and global Tasks row                       |
| Template                   | Proposed note role containing reusable content/property definitions                       | Applying copies; no inheritance link from resulting entity                 |
| Folder                     | FolderId; parent organisation edge/name and metadata                                      | Descendant paths/lists are derived; folder tree cannot cycle               |
| Block/content entry        | BlockId/EntryId within a Space; typed payload and exactly one structural owner            | Rendered node/line/DOM ranges, reverse parent indexes                      |
| Task placement             | Unique placement entry for TaskId with owning note container or inbox                     | Task.location and note/task query membership derive from this one relation |
| Custom property            | OwnerId + PropertyId; type, label, optional options and value                             | Collection columns do not derive from labels/types                         |
| Reference / page embed     | Inline/block value with target identity or unresolved literal; embed is read-only         | Target body is read through resolver; no copied editable body              |
| Asset                      | AssetId or qualified immutable content identity; content descriptor/availability roots    | Filename/URL/preview is not independent binary identity                    |
| Date / reminder            | Fixed calendar-date value; separate reminder definition owned by block/task field         | Relative label, notification schedule/eligibility                          |
| Repeat series / occurrence | Stable series identity, original schedule and occurrence relation                         | Next occurrence is a distinct TaskId, not another placement of old task    |
| Version                    | VersionId; immutable state manifest/provenance and retained closure                       | Current content is not edited by modifying an old version                  |
| Tombstone                  | Deleted entity/placement identity and deletion provenance                                 | Absence of a downloaded file alone is not proof of deletion                |
| Thread / comment           | Anchored identity/state; delivery phase unresolved                                        | Display/reactions/presence are not document body ownership                 |
| Editing context / view     | ContextId/ViewId; origin/history metadata versus selection/focus/scroll                   | Not replicated canonical content or a second placement                     |

IDs are opaque, non-recycled within their declared Space scope. Display names,
paths, labels and wall-clock times never identify an entity. Copy/import-fork
allocates new identities and records a reference mapping; move preserves them.
An explicit native restore can reinstate historical identity only after ownership
and collision validation. Cross-Space moves/identity transfer remain M-02.

## Invariants

| ID    | Constraint                                                                                                                                                                                   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DM-01 | One current state per entity identity in a local Space authority; views/durable historical states identify their revision.                                                                   |
| DM-02 | Every structural entry has one owner/order position, no cycle, valid references to its owned payload and valid range/position mapping. The encoding has one writable structure authority.    |
| DM-03 | Every active task has exactly one active placement: one note or inbox. A task body, title or Tasks projection cannot introduce another placement.                                            |
| DM-04 | A task's body/properties exist once; opening its page edits that state. Title text edits cannot implicitly delete its body.                                                                  |
| DM-05 | Task indentation has no parent-task status/date/deletion propagation. Selection/lifecycle, not indentation, determines affected independent tasks.                                           |
| DM-06 | Move preserves identity/history and atomically changes placement/order; copy creates independent entity/owned identities with no aliased mutable body.                                       |
| DM-07 | Notes/tasks own custom definitions/values. Standard field identity is namespaced and cannot be accidentally replaced by a matching custom label.                                             |
| DM-08 | Repeat completion/generation is retry-safe and yields at most one next occurrence for the same accepted completion transition.                                                               |
| DM-09 | Date mentions store fixed dates; relative labels/preview/layout changes do not change semantic revision. Reminders require explicit definition/enablement.                                   |
| DM-10 | Current state, retained versions/pins, trash, pending operations/publication and recovery roots govern asset reachability. Unknown content cannot imply unknown roots are safe to collect.   |
| DM-11 | Historical versions reconstruct their owned content closure, including relevant task states/placements and comment anchors, without consulting newer mutable task bodies.                    |
| DM-12 | Restore produces new current revision(s) with provenance and guarded ownership; never rewinds history or silently relocates a task that has since moved.                                     |
| DM-13 | Local stale writes, duplicate operation identities and incomplete provider packages cannot bypass validation; whole-document winner selection is distinct from local optimistic concurrency. |
| DM-14 | Schema/format upgrades preserve IDs and reconstructability or explicitly refuse unsafe reads/writes. Unsupported rich payload stays opaque/refused rather than silently flattened.           |
| DM-15 | Layout/settings scope, document undo, retained history, recovery and provider transport state remain separate kinds of state with named owners.                                              |

## Canonical logical shapes

The following are proposed semantic signatures, not wire formats or storage code:

```text
ContentEntity = NoteState | TaskState
NoteState = { id, stateRevision, schemaVersion, role, title, body, metadata, customProperties,
              folderMembership, lifecycle }
TaskState = { id, stateRevision, schemaVersion, title, body, metadata, customProperties,
              standardFields, lifecycle }
Placement = { id, placementRevision, taskId, owner: NoteContainer | Inbox,
              position, presentationIndent }
Body = typed content entries with one ownership/order relation
Property = { id, label, type, definition, value }
VersionManifest = { id, rootEntity, stateReferences, placementReferences,
                    assetRoots, commentReferences, schemaVersions, provenance }
```

These are deliberately not full JSON Schemas. A body encoder may represent a task
placement as a typed body entry; its Placement view then reads that entry. It must
not store an independent editable Task.location plus independently editable note
membership. In a relational encoding, body order/placement may be one canonical
edge record with child lists derived. D-02/M-06 must select and test that encoding.

A task may exist in the inbox without a note. Task body content is not itself a
second note record. In-note task page/body edits can advance task revision without
changing ownership; views receive the affected task revision. The selected encoder
must define whether that also changes an enclosing note snapshot token. Coherent
reads cannot silently mix current placements with historical or torn task state.

No subtask relationship is introduced. Whether task-page body content may contain
further independent tasks is M-01; do not infer permission from ordinary block
nesting. The conservative unimplemented draft supports only note/inbox placement
until that rule is settled, not a permanent new product prohibition.

## Property and predefined-field semantics

Custom properties use entity-local PropertyIds, definitions and typed values.
Rename changes label, not identity/type. Type changes require explicit conversion
with success/failure/loss information; a renderer cannot silently coerce storage.
Supported type vocabulary starts with text/number/date/boolean/select-like values,
with exact option shapes/empty rules under M-03. No global user schema propagates
changes between notes. Existing YAML type hints are compatibility evidence only.

Standard task fields are semantic names such as task.completion, task.scheduled,
task.deadline, task.reminder and task.recurrence. Due date is a possible UI label
for task.deadline, not a second separately writable date. Proposed completion value
is an open/completed variant with optional known completion time; checkbox/status
is projected from it. Do not independently mutate completed boolean, state enum
and timestamp into contradictory truths. Import of unknown historical completion
time is representable without inventing an instant.

A custom label equal to Due date does not alias task.deadline; UI ambiguity/label
validation remains M-03. Empty standard fields may be displayed without inventing
custom properties. Predefined collection descriptors select supported field IDs,
layout/sort/default visibility; values read the same entity/query facts. They do
not infer columns or write custom properties by scanning note labels.

## Metadata, organisation and settings ownership

Metadata is an allowlisted typed record, not a generic unvalidated JSON bag. Account
for R01 title/description, icon/cover/media attribution, note-level tags and aliases
before replacing existing capability. Title has one field on the entity; metadata
projections cannot store a competing copy. Cover attribution travels with its
reference; missing media/credits are not silently erased by property updates.
Inline tags are derived from body content, distinct from explicitly authored
note-level tags; the query layer states how they combine.

Physical folders/paths do not define entity identity. One organisation membership
edge places a note; changing it preserves content ID/history. Logical favourites,
manual view ordering, collection overrides, Space profile/registry preferences and
window/tab layout each need a named scope/owner and typed setting key. They are
not extra body fields or duplicated membership authorities. R06 finalizes persisted
user/device/Space scopes and migration without assuming a cloud user service now.
Task location is its Placement, never an independent metadata.folderId.

## Content, references and selection mapping

Model ordinary text/formatting, headings, list layout, independent task placements,
code, supported tables, links/date values, image/PDF references and read-only page
embeds. Do not infer drawings/math/diagrams from a generic extension slot. Preserve
unknown payloads and explicitly declared asset roots, or refuse destructive edits.

R02 Q-01/Q-04/Q-09 define unresolved text/block/shortcut/table policies. The semantic
vocabulary must support comparing them without hard-coding PM nodes or Markdown
source positions. Text commands carry stable target identity, base revision and
range anchors/expected text; adapters map to engine offsets with Unicode boundaries.
Source encoders must preserve identity across reparsing rather than identify an
entity solely by matching equal text. Rich encoders must preserve unsupported
content through serializers/migrations rather than flatten it to paragraph text.

Reference resolution preserves target identity across rename/move, or an explicit
unresolved/ambiguous literal if no known identity exists. User-authored cross-note
task references are disallowed; global Tasks/task-page navigation uses TaskId as
an internal destination, not a second user reference placement. A read-only page
embed reads its original and cannot mutate its body; deleting the embed deletes
only the reference. Circular/missing embed rendering must terminate explicitly.

Selection is transient view state. An operation returns a logical change/mapping
or a resnapshot requirement for each affected view, not a broadcast cursor. When
a block disappears, an adapter selects a valid declared fallback; it never uses
an invalid stale offset. Q-07 governs remote-snapshot history/composition boundaries.

## Lifecycle and multi-entity closure

| Intent                     | Semantic effect                                                             | Required protection                                                                |
| -------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Create note/daily note     | One content root; date/role/identity rules explicit                         | Daily uniqueness/calendar-zone policy M-07; no arbitrary overwrite by path         |
| Create task from All Tasks | One task plus inbox placement                                               | No implicit daily-note creation; operation deduplication                           |
| Move task                  | One placement relocation, stable task state/identity/history                | Source/destination guards and one atomic effect set; no two notes own it           |
| Copy task                  | New task and placement plus copied title/body/properties                    | New owned IDs/reference mapping; copy/series semantics M-02/M-05                   |
| Delete task placement      | Logical deletion of the task and placement, not inbox fallback              | Retain recoverable state/body/fields/history; exact task-title boundary is Q-02    |
| Delete note                | Logical deletion of its owned tasks/placements                              | One effect set with manifest of dependants; restore validates all IDs/locations    |
| Archive note               | Effective archive for owned content, hiding tasks/suppressing reminders     | Restoring resumes future reminders only; historical identity retained              |
| Convert selection to page  | Move selected content into new page and replace source range with reference | Guarded all-or-nothing effects; fresh IDs only where copy is intended, not guessed |
| Apply template             | Copy content/property definitions under explicit merge/replace policy       | Fresh copied entity IDs; no continuing template dependency                         |
| Restore version            | New current state(s), source version immutable                              | Guard current revisions, moved-task conflicts and content/asset/comment closure    |

This is a logical transaction/effect set, not a claim of cross-file/network atomicity.
R04 must prove a backend/staged protocol for it. A partial outcome cannot leave
an invalid active state reported as success. Explicit bulk partial operations must
preserve each per-item invariant and report that scope separately.

Cut intent and pending clipboard text are not authority to destroy an entity before
successful move. Q-05 decides staging/lifetime and history owner. Body replacements
or generic block patches that remove a task placement must declare/validate the
corresponding task lifecycle effect; they cannot strand or silently alias the task.
Selected text conversion involving a whole task also needs M-02/Q-02 handling;
a general page link cannot be used to circumvent task-reference restrictions.

## Recurrence, dates and reminders

A repeat series identifies original schedule/rule/time zone and occurrence lineage.
Completing a repeat task records the completed occurrence, then creates one distinct
next occurrence at the next future slot on the original schedule, skipping missed
slots. Copy title/properties, empty the body, reset completion and advance temporal
fields under the rule; never blindly carry old deadline/reminder instants.

Generation must have stable transition identity across retries/reconnect. A useful
proposal is to bind generation to series + completed occurrence + completion
transition identity; it is not yet a chosen ID algorithm. Duplicate provider
observation cannot generate a second next task. Recurrence edit/reopen/undo policy,
next-occurrence location and independent copied-task series semantics are M-05/Q-06.
No subtask propagation is implied.

Date-only values and timed reminders are different semantic types; an optional time
in old Markdown is not automatically a notification. Relative input resolves once;
the display may change Today to Yesterday without changing stateRevision. Reminder
eligibility reads owner archive/deletion state. Multi-device delivery/time zone/DST
and occurrence claim policy require R04/R05; timer callbacks may not independently
rewrite task state or replay missed reminders on restore.

## Historical manifests, comments and assets

Capture immutable entity revision references and structural placement revisions
needed to reconstruct the version. A version of note n1 containing t1 must resolve
the historical t1 body/fields; it cannot display whatever t1 happens to contain now.
Pinned manifests retain all necessary revisions/asset roots through compaction.
A logical state may be stored once and referenced from multiple version manifests;
there is no requirement for one mutable body copy per version.

Ordinary links/embeds retain their target identity/reference semantics. A note
version does not recursively snapshot the entire graph or restore other pages just
because it links/embeds them. If historical rendering expands a referenced original,
label whether it is current or a separately retained target revision; do not imply
an exact historical expansion without retained target state. R04 must freeze that
render/export fidelity policy.

Deleting a commented block removes its live discussion display but retains anchor/
thread state with historical content. Undo/restoring that content can restore the
discussion; it must not attach to unrelated blocks. Comment feature timing and
thread-version boundaries remain open, not a reason to omit closure metadata.

Asset descriptors separate identity/content integrity, optional human filename,
media kind/size and local/provider availability. Hash/content-addressing algorithm
is D-09; no live reference may be considered fully available from a placeholder
alone. Never collect a blob while pinned/history/trash/recovery/pending-transfer
roots require it. Changing an asset file in place cannot silently change the bytes of a pinned
historical version: keep the retained content revision or report the incomplete
history explicitly. Unknown payloads with unknown root closure require conservative
retention/refusal. Automatic backup remains deferred; a future snapshot manifest
must close over current and retained states, history and media consistently.

## Revisions, deletion and provider boundary

StateRevision is an opaque optimistic-concurrency token, scoped to the entity/
structure it guards. Tokens are not user version numbers or wall-clock order.
SnapshotToken identifies a coherent read cut; HistoryCatalogRevision and local
view/context epochs are separate. Pinning/history-label changes need not dirty
current body. The precise token/epoch encoding remains R04/R05.

Tombstones retain enough identity/provenance to prevent stale delivery resurrection.
Provider current-state selection follows the agreed latest-document policy with
overwrites retained in history, not local unconditional replacement. Applying
independent winners to two notes that both claim one task is invalid. R05 must
choose a coherent publication/reconciliation unit for task moves/cascades/series.
Incomplete or contradictory packages remain retained/pending/blocked rather than
corrupting current state; D-08/M-06 are blockers for provider enablement.

Schemas and codecs are versioned. Older clients refuse unsafe writes if they cannot
preserve a version's known/opaque content. Native import distinguishes restore/
merge/fork and validates collisions; copying a vault path is not proof of unique
Space identity or an authorized merge. Migrations must preserve historical decoders
or upgrade retained states with verifiable identity/provenance.

## Remaining model decisions

| ID   | Open boundary / proposal                                                                                                                  | Linked policy/gate                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| M-01 | Task-page body containing further independent tasks; allowed ownership model without subtasks                                             | Q-02; P-26/P-27; settle before enabling such insertion     |
| M-02 | Copy/move/conversion ID mapping, cross-Space clipboard and reference handling; whole-task conversion cannot create forbidden references   | Q-01/Q-02/Q-05; D-02/D-06                                  |
| M-03 | Complete property types/options/empty/conversion rules, label collisions and standard field vocabulary                                    | D-02/D-12; collection fields stay predefined               |
| M-04 | Restore when a historical task moved/deleted/changed elsewhere; propose conflict/refusal until explicit restore-as-copy/relocation policy | Q-05; D-02/D-07; never duplicate ownership                 |
| M-05 | Recurrence edits/reopen/undo, next occurrence placement, deadlines/reminders and copied-series identity                                   | Q-06; D-13                                                 |
| M-06 | Canonical encoding/structure authority, atomic effect closure and provider winner reconciliation                                          | Q-07; D-02/D-03/D-08; no shared live DB                    |
| M-07 | Daily-note date identity/uniqueness across time zone/device changes                                                                       | D-02/D-12; current paths are evidence, not target identity |

These conditional gaps prevent treating the draft as implementation-ready. They do
not reopen the confirmed inbox, task-page, no-subtasks or copy-only-template choices.
The [API draft](command-api-spec.md) references these semantics; it does not create
a second independently writable model.

## R04 persistence reference

[Vault persistence](vault-persistence-spec.md) defines the proposed commit/ack
boundary for this model: current state, required history/identity/outcome protection
and pending publication form one recoverable effect set; external asset durability
has explicit staging/order. It compares P-SQL/P-ROOT/P-TEXT without accepting one.
Its PS-01–PS-07 decisions and PF failure scenarios remain unqualified. This reference
does not close M-06 or make physical encoding part of the semantic model by accident.
