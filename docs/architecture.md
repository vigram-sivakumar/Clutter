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

The current editable schema admits paragraphs with stable block identities. Task
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
