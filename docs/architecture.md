# Structured architecture

Accepted direction (F010): Tauri2 hosts one shared React web UI; ProseMirror/Yjs owns
the editable document and context history; TypeScript Core owns semantics; SQLite
plus immutable media implements local storage. Mac first, Windows through explicit
platform seams, future browser composition shares UI/contracts. No separate Swift UI
or OS-specific feature implementation. The closed host-comparison research is not a
prerequisite to further development and does not establish performance rankings.

| Package | Responsibility | Excludes |
| --- | --- | --- |
| apps/desktop | Tauri window/navigation/close bridge, native startup/build composition | Page/task/save rules |
| packages/core | Command catalogue/client, SpaceService, sessions, grants, revisions and storage/editor ports | DOM/React, Node/SQL/filesystem, framework imports |
| packages/editor | PM/Y schema/history/binding, headless engine and browser/backend codec entries | Product navigation/UI, storage ownership |
| packages/ui | React product layout, primitives, window-local page navigation and editor surfaces | SQL/filesystem/OS APIs, duplicate document reducers |
| packages/desktop-runtime | SQLite store, immutable media, transport, headless owner, peer CLI/MCP composition | Independent semantic operations or product UI |

Editor/UI/runtime depend on Core. UI imports editor's browser entry; runtime composes
its backend entry. Editor never imports UI/runtime. The browser bundle excludes Node,
SQLite and backend codec modules. Public package entries and source graph checks make
these directions visible. Shared modules contain real implementations, not empty stubs.

Core's catalogue defines runtime validation and inferred command types together. The
new page.list read uses the same admitted/serialized Core path as peer operations.
It returns current accepted heads/title/kind/sequence, ordered by page identity with
keyset pagination (default50, maximum100). It is an index of the real store, never a
UI-maintained page database. Title projection decodes bounded current roots; it is not
a qualified full-text search/large-library performance implementation.

React renders sidebar, header and surrounding editor controls. PM exclusively owns
contenteditable DOM; there is no React copy of body JSON/text. A page workspace retains
EditorSessions when its views unmount. Context identity hashes space + window + page + pane into a stable bounded ID.
A window close freezes/settles/protects every retained page, including inactive pages.
An unknown create outcome retains/retries the same operation and blocks unsafe close.
UI/CLI/MCP call the same Core; a detached Node owner outlives the desktop window. Rust
asks the shared guard and acts on its nonce-bound answer; it does not decide what saved
means. No app-to-CLI business subprocess or second Rust page implementation.

Desktop runtime uses the selected Core storage port and SQLite adapter, not the old
Markdown vault, filesystem-note index or Persistence Gate. New development sessions
start empty and create real pages through page.create. They use temporary marked
synthetic Spaces only. Final installed Space format/extension, physical alias fencing,
security/durability/cleanup guarantees and distribution are not yet qualified.
Structured canonical roots are not .md; Markdown remains a future interchange path
with explicit loss reporting, not a retained full/compact renderer or dual writer.

The current schema2 document has one structured title followed by paragraphs, H1–H6
headings, separators or ordered/unordered list rows with
stable block identities, explicit indent and optional visual parent identity. Title
and body share one Y fragment and one origin history. Plain title is derived; UI,
CLI and MCP write the same structured content contract. Shared inline reference/date/
link schema exists;61 adds the shared React slash menu and deterministic block
insertion. 64 adds flat list transforms, derived markers and body hard breaks. Formatting
and semantic-inline insertion menus remain pending. Task
is still an independent page kind; full body/cover/media/embed/property scope is a
required target, not complete UI in this slice. Tables and other content components
must implement the retained product/keyboard contracts. No existing-user migration,
legacy façade or old-layout controller must survive for its own sake.

Retired: apps/app in full (including both Markdown renderers, old domain/vault/native
persistence), automation tied to that app, old Foundation demo entry/package names,
duplicate draft-only DesktopSession, proof-only native host, research executables and
obsolete app architecture/governance documentation. Selected mechanisms moved once;
useful media/stdio test fixtures moved into runtime tests. Git history is the archive.

## Tab-owned navigation (P-40, implemented54)

WindowNavigation is the shared UI owner of tabs, split panes, active selection and
per-pane Back/Forward page-reference histories. Normal note activation navigates
within the current tab's active pane. Explicit note-menu actions create a new tab
or add a split in the active tab. Different and identical notes are supported;
ordinary opening never implicitly switches to another tab just because that note
is open there. Selecting a tab restores its own split layout and active pane.

Each tab/pane has a separate stable ID. A note's editing context hashes Space +
window + page + the tab/pane view key. EditorSession retains document/context history;
Back/Forward only chooses notes, never rolls back accepted content or issues another
save policy. Detached views retain contexts and in-memory selection/viewport bookmarks.
Navigation snapshots retain IDs for visited notes even after forward-history branching.

A UI-injected window-state port loads/checkpoints versioned layout/ID/history JSON.
The desktop runtime stores opaque snapshots in the private development session,
not the semantic Space document database. It never decides navigation policy or
stores copied bodies/titles/credentials in those UI snapshots. The endpoint is UI-only
within the existing private authenticated owner; revisions are monotonic and exact
retries idempotent. Files use private atomic writes and directory synchronization.
This is a mechanism, not a second Core or a new user-facing per-Space access code.

New identities are checkpointed before their views become editable, and the window
close guard waits for navigation/creation writes plus protection of all retained
contexts. A metadata write failure leaves already-registered views usable, blocks
unregistered new views and exposes retry. Unreadable/invalid metadata is not reset or
silently replaced. Restoring saved IDs makes protected work addressable after reopen
and owner restart. These are development mechanisms; installed identity/registry,
native durability/security and release qualification remain open.

Current bounds (64 tabs,8 panes/tab,128 history entries,1024 visited references/pane,
512KiB serialized layout) are explicit development admission limits, not final
product UX commitments. Limit refusal does not truncate histories or silently discard
contexts. Tab/pane closing/reordering/resizing, native navigation gestures and complete
multi-window UX are outside54. Stage3 editor/familiar-UI UX must be discussed with the
user one question at a time before implementation. Current UI is still provisional.

## Stable surfaces and scoped operations (56)

WindowWorkspace coordinates window topology/intent, not document semantics. Its
operation queue captures stable destinations, rebases structural changes and uses
per-route generations to prevent obsolete publication/focus. Same-pane supersession
can bypass slow obsolete preparation; such work remains tracked by the close guard.
Only real close freezes the window. Normal creation/navigation/split preparation does
not disable unrelated controls or toggle existing editor editability. Creation has
explicit pending/uncertain/failed states and exact operation retry.

React shell, tab hosts and pane hosts have stable identities. Pane identity is its
pane ID, not page ID. Sidebar/index, topology, lifecycle/focus and status subscriptions
are scoped. SurfaceRegistry prepares actual PM views in inert/hidden containers with
editor geometry/styles before route publication. A pane attaches a ready DOM surface
synchronously in a layout effect; it never renders an empty async editor destination.
PM owns editable children, the registry owns their surface container/lease, and React
owns the surrounding slot. This resource map contains no mirrored body JSON or
independent semantic writer. Tab switching detaches/restores surfaces without
rebuilding the shell. Up to16 inactive surfaces are retained after preparation settles,
plus active/preparing views. Evicting a surface unmounts its PM view and retains its
EditorSession, mapped selection bookmark, history and protection obligations.

New view recovery identities remain durably registered before editing. Metadata
writes remain serialized/idempotent; warm bookkeeping is coalesced. Close checkpoints
latest visible navigation after settling queued creation/navigation, ALL outstanding
preparation (including superseded work), and every hidden/retained editor context.
A cancelled reveal never cancels accepted Core work. Focus follows current intent,
not late callbacks. No Core/editor/storage/host/format/dependency redesign in56.
Actual Mac paint/geometry/IME/caret behavior still requires scoped observation;
passing DOM tests do not qualify presentation latency or guarantee zero flicker.

## Window destinations and split admission (57)

allowDuplicateNoteInTab defaults false in the shared navigation constructor. The
split command and canSplit both inspect currently displayed pages of the target
tab; queued/rebased intents cannot bypass it. The menu reflects the same rule.
Existing layouts are preserved; histories/cached contexts and other tabs are not
counted. Ordinary open/Back/Forward behavior is unchanged. Enabling the option
preserves the engine's qualified independent same-note contexts.

New window is a UI-injected host mechanism, separate from normal navigation. The
Tauri host creates a fresh native window against the same Space owner endpoint,
not another owner or CLI semantic path. Unique window IDs scope layout and editor
contexts. The initial page applies only to an empty window record; saved navigation
wins on reopen. The bridge validates IDs, correlates request/reply and binds native
events to window ID/boot nonce. Native close guards are per-window; quitting waits
for all live window guards, and refusal resumes already-frozen peers. Shared UI
retains save/protection decisions. Native request replay and close barriers avoid
untracked asynchronous window creation. Native compilation and OS behavior remain
pending actual Mac validation; JS bridge tests do not qualify Rust/Tauri execution.

Child locator files contain only windowId/initialPageId, scoped under developer
session identity and written privately before reveal. Explicit developer reopen by
window ID preserves protected-context addressability. Finished automatic window
restoration/recents and installed Windows support remain later UX/platform work.
No Core/editor/storage format/dependency graph change is required by this slice.

## List hierarchy64

List rows are editable inline blocks in the same PM/Y document. Ordered/bullet markers
are view projections, never Markdown text or a second ordered-list store. Stable IDs,
indentation and explicit visual parentId define operation scope. Parent-before-child
and lower parent indentation rule out cycles without demanding a nested/depth-first
DOM tree. A branch can outdent while later siblings retain their existing parent,
indentation and order. UI and CLI/MCP share the same accepted validation.

Tab/ShiftTab transform the targeted explicit subtree. Enter splits one item into an
immediate sibling and transfers direct children to it; empty Enter and Backspace keep
children at their existing indent as detached rows under the old parent/free roots.
These are visual list relationships, not semantic task ownership. History stays in
the one retained context, including foreign-text protection for list containers.

## Declarative insertion policy65

Editor block-definitions.mjs owns declarative node type/attrs, menu identity and
empty/nonEmpty/focus policy. Current66 defaults convert empty AND filled text
blocks in place, retaining content/ID/indent and mapped caret; Separator retains63.
insertionPolicies is a mount/workspace prop forwarded to the replica. No UI/OS switch
implements those rules. Invalid config is rejected before edits; definitions are
immutable snapshots, not a second content store.

createInsertionTransaction is the common PM transaction builder. Slash is a thin
live-query/range adapter. Stable conversion identity preserves child references;
shared block-structure selectors serve lists/insertion. Dispatcher handles insertion
history boundaries for any entry point. Core still validates accepted roots and owns
entity/media semantics; future task/image commands must satisfy those atomic rules
before a registry entry is enabled. A policy does not implement an unbuilt feature.
React renders choices, PM owns editable DOM, OS mechanisms stay in desktop adapters.

66 moves all body text Tab/Shift+Tab into one block-indentation transform/plugin;
list interactions no longer own a separate Tab path. Shared graph selectors own
hierarchy. Paragraph vertical margins no longer override derived indent styling.

## Selected atomic objects67

Registry focus:selected selects supported atomic block targets through the same
insertion executor. Empty separator source converts; filled source inserts after its
subtree. object-interactions owns shared click/Enter/Backspace/Delete for selected
atomic BODY objects. Continuation is an explicit normal paragraph, not inherited
heading/list formatting. Deletion reparents direct unselected children at unchanged
indent and chooses nearby body text/object, never title.

node-selection-bridge uses public Y before/afterAllTransactions and PM selection APIs
to shield relative NodeSelection restoration when the selected target disappears.
A synchronous temporary AllSelection is view-local, unsaved and selection-only;
canonical block ID restores a surviving target, shared body fallback handles removal.
Do not set addToHistory:false on this bridge: the binding can carry that flag into
the actual pending content transaction. No binding-internal changes/dependency fork,
second document/history manager, saved selection styling or OS-specific feature path.

## Shared formatting69

formatting-spec.mjs owns stored mark names, safe link validation and preset IDs/values.
Schema, strict JSON model and raw Y validation use it; clients cannot add arbitrary CSS
or unknown mark fields and have them silently discarded. Body text supports bold,
italic, underline, strike, link, text_color/highlight marks and nullable preset block
background. Title retains link-only marks; reference/date/break atoms remain unmarked.

createFormattingTransaction is the one toolbar/shortcut executor. Replica dispatcher
uses the existing origin context history boundaries and focus path for formatting and
insertion. React toolbar owns controls/input/geometry only, outside editable DOM; it
has no copied body, persistence callback or independent history. View-local selection
is retained/mapped, palette controls preserve it, and inactive/read-only/removed ranges
refuse toolbar commands. Block background is kept by text conversion/list outdent;
indent and graph selectors retain their existing ownership. Core catalogue, SQLite,
revision/conflict protection, native adapters and dependencies remain unchanged.

## Toolbar focus ownership70

Shared formatting lifecycle claims toolbar interaction from pointer capture or
keyboard focus transfer before editor blur. activeElement alone cannot establish
outside intent: native popup/focus transitions may temporarily yield body/null.
Keep controls mounted through that interval; release on actual outside pointer/focus,
Escape, invalid selection or view editability/inert guard. Existing live PM range is
still the single view selection; no copied document, separate range store, timer,
platform/per-control branch, new command or persistence/history path. URL draft is
ordinary toolbar input state and survives the focus interval. Disposal removes listeners.

## Explicit body selection71

BodyBlockSelection is the single PM view selection for explicit flat block IDs,
document-ordered and title-filtered; an empty instance is inactive/no-caret mode.
It maps by canonical IDs, produces only selected blocks for copy, and never stores
membership in Y/Core, React body state or document attrs. Keyboard is the first
adapter; future marquee/handles use the same public selection constructor.

OriginHistoryContext bookmarks and existing public Y transaction selection guard
recognize this mode (no second Undo manager/accepted writer). bodyBlockInteractions
handles select-all stages, title isolation, Escape/click/typing/delete behavior;
formatting text-range toolbar hides when mode switches. deleteBlocks is shared with
single-object deletion, reparenting only surviving children to nearest surviving
ancestor while preserving indentation/content/format. Object67 retains its body-caret
destination; bulk mode remains no-caret until text click. Schema/Core/runtime/native
sources unchanged. Marquee/handles/group drag and table-cell modes are not implemented
by this keyboard adapter or inferred from its tests.

## Text re-entry and Y selection-guard scope72

The body-block adapter transitions to normal text on mouse-down, resolving public PM
hit positions through TextSelection.near (empty block boundary included). Focus comes
before a single visible pointer selection; default native dragging/multi-click keeps
running. handleClick uses the same fallback helper, not a second cursor algorithm.
Body whitespace cannot select title; atomic-object/nested modes keep their handlers.

createViewSelectionGuard replaces guardNodeSelections, scoped by replica document
updates, accepted remote apply and context history operations. Selection/focus-only
updates no longer normalize through internal AllSelection protection. Actual changes
still protect node/body-block bookmarks through existing public Y events and stable
IDs. No private binding mutation/dependency fork, separate state owner, saved selection,
production timer or synthetic caret blink/colour. Bulk deletion stays no-caret; normal
click re-enters text. Native caret painting remains an actual platform check.

## Opt-in native caret observation73

Development host bootstrap optionally injects a bounded metadata-only observer on
same-session reopen. Source runner flag CLUTTER_CARET_TRACE=1; disabled by default.
Existing immutable browser/native bundle and Core owner remain unchanged. Public DOM
focus/selection methods are temporarily wrapped only while user explicitly records,
then descriptors restored on stop/time/cap. No editor transactions, content/SQL/RPC,
network or persistence path is added. Report is in-memory, explicitly copied by user;
no notes/IDs/URLs/tokens/literal characters. This is diagnostic, can affect timing,
and establishes event sequence rather than pixels/latency. Default bootstrap origin
guard still applies. Remove temporary hook after diagnosis unless a justified dev tool.

## Current caret checkpoint74

[Trace finding, source correction and native retest](foundation/rebuild/inactive-caret-74.md). The actual73 log
shows pre-click presentation oscillation, no post-click selection-write loop.74 keeps
empty/no-caret body noneditable with existing keyboard commands and preserves that
presentation through the Y guard. Removes transparent-caret CSS. One shared editor/
Core/history/save path; native74 blink confirmation pending before marquee. Build
changed source with `npm run desktop -- --new`; no install or old milestone replay.
