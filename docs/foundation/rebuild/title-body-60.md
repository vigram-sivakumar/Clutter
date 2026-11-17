# Capability60 — title and body

17 November 2026.3A complete; all listed Mac checks passed by user confirmation.

User reported PASS for title focus/Enter, Backspace boundary, Shift+Enter, Enter
before existing content, ordered Undo/Redo and multiline paste feedback; then
confirmed save/close/reopen retained title and body. Recorded17 November2026.
One capability is finished and checked before starting the next. This is the real
application's minimal working UI; final Clutter components/layout come later.

## Implemented

- One structured PM document: one title then at least one body paragraph. One Y
  fragment, retained context, origin history, save/protection/recovery path.
- New note focuses the empty title; New note is a transient placeholder. Enter
  enters the existing empty body or inserts an empty paragraph before nonempty
  body. Shift+Enter in title is inert; Backspace at first body start goes to title end.
- Title/body edits share ordered Undo/Redo per context. Remote work is not added
  to local undo. Toolbar selection mapping and retained contexts continue unchanged.
- Multiline title paste appends ALL lines to body bottom (including blank lines),
  leaves title unchanged, blurs/hides caret, scrolls to appended blocks, and keeps
  feedback until a click anywhere. Single-line title paste inserts normally.
- Sidebar/tab/header use derived title and preserve the actual editor DOM. No React
  title input/body mirror or independent page.update writer.
- Core catalogue takes structured content, not writable scalar title. CLI/MCP are
  peer clients; real processes write title/body, update a mounted view and read back
  UI changes through the same accepted Core/SQLite path.

## Format and extension boundaries

`content:{format:"clutter.page-json",schemaVersion:2,value:{type:"doc",content:[...]}}`
is the public write shape alongside properties. The Y root envelope is
`clutter-page-y-v2`, schema2; page map keys are content/properties, plus the separately
protected root links map. No scalar title is stored. Reads derive plain title from
structured text/note-reference/date nodes. Old roots/contracts are refused, never
silently converted. Use a fresh synthetic Space; prior bundles/sessions stay intact.

Body blocks have stable blockId, indent and optional parentId. Free indented roots
are allowed; duplicate IDs, invalid/forward/cyclic or closed-branch parentage and
invalid indentation are refused. Those fields define the later transform boundary;
list/drag/marquee commands are not implemented in60. The shared inline schema has
safe link marks and note-reference/date atoms in BOTH title and body; menus and
interactive insertion are3B, not completed controls in this part.

EditorSession.history remains the context action entry. Title/body/structural text
transactions use its one OriginHistoryContext, not separate managers. Later semantic
task/asset actions must join the context's ordered history coordinator through
Core-validated inverses; never restore an entire stale root or add a UI save/undo
owner. Their command/coordinator implementation belongs to3D;60 does not pretend
those unimplemented semantic actions are already qualified.

## Evidence and limits

120 Linux tests pass: the full119 suite plus the final single-line paste test in the
38-test editor suite. Strict Core/runtime TypeScript and43-source dependency-boundary
checks pass. Existing tests were updated for the actual schema and title-node position;
none were deleted. New coverage checks title/body order, remote title retention,
boundary keys, paste/blank lines/feedback dismissal, derived UI titles without view
replacement, semantic inline projection and rejected legacy/unknown content writes.
Existing failure/restart protection now also recovers unsaved structured title.

These are actual production browser/backend bundles, jsdom PM/React, SQLite and
CLI/MCP process checks. They do not prove native pointer/caret/scroll/IME behavior.
No Rust/native host/dependency changes, native build or shipping qualification is
claimed. Prior user56 flicker PASS and57 scoped navigation/new-window PASS remain
valid only for their observed scopes. The intermittent native caret report remains
a risk to watch during the following bounded check, not a claimed fixed bug.

## Completed scoped Mac checklist — user PASS

Build changed source using `npm run desktop -- --new`. Use synthetic text only.
All steps below were confirmed by the user. Retained as the test record; do not
replay for bookkeeping:

1. New page: caret starts at New note. Type Title check. Tab/sidebar update without
   replacing/flickering the editor. Enter moves into empty body; type Body check.
2. Backspace at the first body's start goes to title end, without merging text.
   Shift+Enter in title does nothing. Enter from title when body already contains
   text inserts an empty paragraph above it.
3. Edit title and body with distinct pauses; Undo/Redo follow that order. Navigate
   away/back, Save, close safely, then `npm run desktop:reopen`: both fields persist.
4. Paste two or more lines in title: ALL lines append at bottom, title unchanged,
   no visible caret, scroll to content, highlight stays until ANY click.

If a step fails, record the step and exact observed behavior and fix this capability
before adding3B. CLI/MCP automated integration has already passed; do not make the
user replay a large old suite for bookkeeping. No native result is inferred yet.
