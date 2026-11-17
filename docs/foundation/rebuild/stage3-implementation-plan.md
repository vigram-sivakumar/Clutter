# Stage 3 implementation plan

17 November 2026. **3A complete with user Mac PASS.3B block insertion in61; remaining3B–3E pending.**

See [capability60 outcome](title-body-60.md). The following baseline inspection and
plan were recorded at59; they are not claims that the old scalar-title path remains.
Application baseline: delivered57. Documentation58 recorded UX; this59 update adds
the preset-only formatting decision and this plan. No application/schema/native or
dependency changes are made by this delivery.

[Confirmed UX](stage3-ux.md) owns interaction behavior. This plan owns implementation
order, package responsibilities and acceptance. No further required UX questions
before starting. Use consistent editing conventions for small unspecified details;
ask only a genuine material blocker, one at a time. Exact swatches/spacing can be
reviewed with working components. Do not reopen host selection or legacy migration.

## Outcome

Replace the paragraph-only editor with the actual shared structured editor: editable
rich-inline title and body, H1–H6, paragraphs, ordered/unordered lists, separators,
formatting toolbar, custom block selection/dragging, inline tasks/page conversion,
single-file image insertion and preset tables. Preserve stable navigation/windows,
caret/history lifetimes and the single Core authority.

Use the clean application entry, not another permanent experiment or demo. Carry
forward familiar Clutter layout/global-component intent where appropriate, replacing
editor internals/components outright where needed. Do not import the old CM6,
Markdown, vault, PageHost or persistence controllers to make the UI look complete.

Generic PDF/image/URL embeds and YouTube remain deferred. No inactive Embed entry.
Global task-list routing, full property/collection/search features, installed-format/
security/durability/distribution gates and Windows/browser qualification remain their
later stages. There are no existing users/data to migrate.

## What the code actually supports today

| Area | Current source/finding | Required replacement or extension |
| --- | --- | --- |
| Canonical content | `packages/editor/src/page-codec.mjs` stores title as a scalar and body as a Y fragment. | Structured inline title and body in one canonical editing document. |
| Admitted editor updates | `packages/editor/src/engine.mjs` accepts paragraph/text body content and rejects title/property/link changes from editor updates. | Admit the new content schema deliberately; retain protected-field and asset/ownership guards. Do not simply remove validation. |
| History | `replica.mjs` binds `OriginHistoryContext` to the body fragment. | Title/body share one ordered history; entity/asset actions join the context's guarded history path. |
| Public commands | `packages/core/src/contracts.ts` uses writable plain title plus body; `PageOperations` is the semantic facade. | One structured content write contract; plain title is a derived display/search projection. Add explicit task/asset operations through this facade. |
| Block representation | Current schema is paragraphs; note schema has a fixture-style task slot that the active engine refuses. | Stable block identities, free indentation, explicit hierarchy, typed task/image/table nodes and shared validation. A slot declaration is not implemented task ownership. |
| Ownership/storage | `SpaceStore.commit` already accepts guarded changes to multiple roots; actual page operations primarily use single roots. | Build task placement/lifecycle operations on this atomic port; verify invariants, not just port availability. |
| Media | Runtime has immutable assets and ingress; current qualified feature scope is bounded. | Couple accepted image-block placement and asset association through Core. Existing proof MIME/size limits are not user-approved production choices. |
| View lifecycle | UI has retained contexts and bounded actual surfaces, scoped operations and stable pane hosts. | Extend this lifecycle; do not reintroduce global busy/disabled/read-only cycles or remount the editor to show formatting. |

These are source-inspection findings, not new runtime or performance measurements.

## Implementation decisions

### One editable document and one content owner

Use one canonical structured page document containing a title node and body blocks,
backed by the retained page editing context. The title uses the shared inline schema
with permitted semantic references/dates/URLs and its own input/formatting rules.
Plain title text for sidebar/tab/list/search is a **read-only projection**, not a
second writable title value. There will be no React textarea with another save or
Undo manager alongside the body editor.

Replace the scalar-title/body-only command/codec assumptions together. Version the
new development schema explicitly and reject unsupported roots clearly. Do not
silently reinterpret old bytes or build a compatibility/migration bridge. Previous
synthetic builds/sessions remain available to their own original bundles; changed
schema checks use a fresh synthetic Space.

Core remains portable and owns accepted semantics, grants, revisions, task ownership,
asset associations and guarded commits. The editor package owns schema/codecs and
shared deterministic provisional document transforms. UI renders controls and sends
intent; it does not decide a second accepted save/delete/task cascade. CLI/MCP use
the same command catalogue/validation, not a renderer-specific alternate workflow.

### Free indentation is not stock nested-list behavior

Represent body blocks as an ordered sequence of stable-ID records in the structured
document, with explicit indentation and optional visual parent identity. An indented
root without a parent is valid. List text remains editable structured inline content;
markers/numbering are derived, never inserted as Markdown text.

Validate parent references/cycles and ordering. Keep visual block parentage separate
from semantic task ownership. Internal table rows/cells have their own stable
identities and are not mistaken for independent top-level marquee blocks.

Shared transforms implement the agreed matrix:

- Tab/Shift+Tab and parent drag move the target subtree; following siblings stay put.
- Enter creates the immediate sibling and reparents existing children to that sibling;
  empty-item Enter and Backspace have their separately specified behavior.
- Conversion/outdent/deletion that affects only the current block keeps surviving
  children at their current indentation. Do not demand a parent merely to represent it.
- Marquee selection is a flat explicit ID set. Selecting/deleting a parent does not
  propagate to children. Drag/indent scope is computed separately from selection.

Do not let CSS margins alone become the ownership model, or let the ProseMirror
list default override free indentation and the confirmed child-transfer rules.

### One view-context history, including semantic actions

Title/body text and formatting use the same origin-scoped document history. Structural
commands are logical history actions, not sequences of unrelated DOM edits. Use a
context-level ordered action coordinator so task/asset commands and inline task edits
can join document editing in order without another UI-owned save pipeline.

Semantic inverses are validated/admitted by Core against current heads and identities;
UI history records route to those operations, not raw database writes. Undo must not
delete another view's work, resurrect wrong task placement or drop an asset still
referenced by current/history/recovery state. Refuse an unsafe inverse clearly when
it cannot be applied safely; do not restore a whole stale snapshot. Keep the current
caret/bookmark behavior separate from which history action is being undone.

### Real components with a strict editable-DOM boundary

Use shared block chrome, slash menu, selection overlay, floating toolbar/preset colour
palette, task card, image view and table axis controls. React owns surrounding UI;
PM owns editable title/body/cell content. A NodeView renderer adapter can host React
chrome beside a PM-owned `contentDOM`; both must never reconcile the same children.

Use stable block/context identities. Formatting, selection rectangles and status
updates must not recreate the workspace or unaffected editor surfaces. Selection,
marquee, paste highlight, menu state and transient drag state are view-local, not
persisted in the canonical document. Preset colour values are validated tokens;
block-background colour affects the containing block, while text highlight affects
the selected range. No custom CSS/colour input is introduced.

### Tasks are entities, not duplicated checkbox text

A note task block stores stable task/placement references, not a copied editable task
title/status/body. The task root owns its title, completion, properties, conversion
state and sole owning location (note/slot identity or independent inbox). A note's
slot is the structural reference; any ownership index is derived/checked from the
canonical relation. Core validates and changes both sides in one guarded commit.

Create, move, remove/recover and conversion operations must preserve this invariant
before the task UI is enabled. Empty-title conversion to a paragraph deletes the
placement/entity logically with recovery, rather than leaving an invisible active
task. Parent block deletion must not cascade into unselected child task blocks.

The inline renderer edits the referenced task through its scoped context, never a
second note-body title copy. The context action coordinator keeps those edits and
placement operations ordered with the note-view history. Explicit conversion changes
the same task's page-enabled state, retaining ID/status/properties/body/location.
It is not a copy or a per-window presentation preference. Checkbox completion remains
independent from title navigation; visual task indentation does not create subtasks.

## Capability-sized execution within the parts

User explicitly requested17 November2026: finish and test ONE capability before the
next, without weakening architecture.3A passed its scoped Mac checks.61 implements
3B's paragraph/heading/separator + slash insertion first; scoped Mac check is next.
Lists and formatting remain separate follow-on capabilities under3B.3C now includes
A01–A05 two-stage Ctrl+A/body-only block selection and title isolation. This sequencing
refines delivery size, not the agreed feature scope or package ownership.

## Delivery order: five working parts

Each part extends the real application, includes appropriate checks and updates the
handoff. Do not present a part as all of stage3. Hide commands whose actual implementation
has not landed; do not create fake controls or start another comparison harness.

| Part | Build | Complete when |
| --- | --- | --- |
| **3A — content, title and history** | Versioned shared content/inline schema; command/codec/client/engine changes; one title+body editor/context/history; derived plain-title projection; title placeholder/focus/boundary keys; multi-line title paste with persistent view feedback. Define the common block identity/hierarchy and history extension contracts here. | New note starts in `New note` title; title/body edit, Undo/Redo, save/reopen and two-view reconciliation use one path; title paste appends all lines and follows the agreed no-caret/highlight/click behavior. Sidebar/tab title updates do not trigger remounts. |
| **3B — common blocks and formatting** | Shared deterministic block transforms/renderers for paragraphs, H1–H6, ordered/unordered lists and separators; all agreed list keyboard/child-transfer rules; slash menu with query/URL rules; shared note-reference/date/link inline behavior; floating toolbar with eight actions and preset colours only. | Actual commands preserve surrounding text and insertion focus; lists match the UX matrix; title inline capabilities share the same implementation; toolbar preserves selection and applies range highlight versus whole-block background correctly. |
| **3C — block interaction** | Two-step Ctrl+A/body-only block selection and title isolation (A01–A05); own-block handle/geometry registry; text-drag-to-marquee transition; flat explicit block selection; Shift-additive marquee; group reorder; separate hierarchical move/indent scope and explicit-only deletion; click/Escape/typing mode behavior. | Touch selects and moving off deselects live; parents/children do not auto-select each other; disjoint selections drag in document order; unselected children survive parent deletion with unchanged indentation; no horizontal drag indentation or global UI flicker. |
| **3D — tasks and images** | Core atomic task placement/lifecycle/conversion/history operations; inline task component and same-entity task-page opening; single-image file picker; immutable ingress plus atomic image placement/association; unknown-result retry and recovery. | Inline title editing, Enter/Backspace/Shift+Enter and conversion follow UX; task checkbox/navigation remain distinct; no duplicate/orphan task or semantic subtask; image uses one file and the existing Core asset path; failure/cancel does not discard unrelated content. |
| **3E — tables and integrated UI review** | Table schema/commands/NodeView chrome, slash presets and existing navigation/selection/axis rules; shared styling/familiar editor layout; integrated pointer/caret/history review. | Table contract passes on new components; foreign-view work is protected; all stage3 blocks, toolbar and selection coexist in the real app without remount/ownership regressions. Actual scoped Mac observations complete the interaction evidence. |

The five parts are delivery/verification boundaries within this stage, not five new
architecture-selection phases. No time estimate is implied. Reorder only if a concrete
code dependency requires it, and update the handoff rather than silently changing scope.

## Acceptance and regression strategy

Use the confirmed UX IDs as acceptance anchors, not tests that merely repeat an
implementation helper. Exercise actual production React/PM bundles and real
Core/SQLite paths where authority, context lifetime or atomic writes matter.

| Boundary | Required evidence |
| --- | --- |
| Content/API | Browser/backend codec agreement; schema/identity/parent validation; read-only title projection; rejected forbidden metadata/asset/ownership updates; typed catalogue parity for UI/CLI/MCP. |
| History and multiple views | Interleaved title/body edits; detach/reopen; remote changes; ordered task/asset actions; safe/refused inverses; unchanged independent-view history; no stale whole-root restoration. |
| Lists and selection | Parent with children and siblings, free-indented roots, each key rule, marquee boundary crossing, additive baseline/live deselection, own-row hit-testing, explicit-only delete and repeated ancestor/descendant selection. |
| Task transactions | Crash/failure around atomic placement changes; exact unknown retry; one owning location; stable-ID conversion; no orphan after empty-task exit/delete; protected work in inactive views. |
| Media | Cancelled/failed file selection; admitted bytes/MIME/size; placement/association atomicity; exact retry; current/history/recovery reference retention. Use existing ingress/storage ports. |
| Tables | Preset dimensions plus the existing TB-C matrix, stable active cell on explicit axis addition, same-/different-note views and guarded structural history. |
| Rendering | Retain shell/pane/surface identities; do not toggle unrelated controls/read-only state; menu/toolbar/marquee do not steal the caret or unmount editable DOM. |
| Native | Targeted Mac checks for changed caret, pointer, drag, cell and picker behavior. jsdom tests are not proof of no blank paint, IME or native pointer correctness. Do not replay retired host-ranking/profiler suites. |

Keep type/boundary checks and meaningful existing recovery/transport tests. Update
paragraph-only tests whose admission rules genuinely change; removed tests are not
passing tests. Broaden/repeat checks only for new changes or unresolved failures.

## Next concrete action and handoff

**At59 the next action was3A;60 implements it. Verify its Mac checklist before3B.** Start in the shared content/schema and Core contract/codec
path, then connect the actual title/body view and derived sidebar projection. Include
the block/hierarchy/history extension boundaries so later parts do not add parallel
implementations. Do not start with a React title input calling `page.update` while
leaving the body on a separate history/save path.

Read [UX decisions](stage3-ux.md), [checkpoint](../START-HERE.md),
[architecture](../../architecture.md) and [table contract](../table-interaction-contract.md).
59 itself made no application implementation. No tests/builds were run
for59; source inspection and documentation/package checks are the evidence for59.
User56 flicker PASS and57 scoped navigation/new-window PASS remain recorded; neither
establishes that the stage3 editor or wider native/release gates are complete.
