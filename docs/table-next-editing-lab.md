# Table replacement — stage 2 editing lab

The stage 1 engine tests (15/15), shared grammar regressions (317/317) and TypeScript compilation were reported passing on commit 20a6205.

This branch adds an isolated comparison harness, not a production editor migration. Both arms use the same root CodeMirror history, Lezer-derived snapshot, structural commands and minimal cell-change adapter.

Run from the repository root:

```sh
npm run test:run -- src/features/markdown/editor/codemirror/table-next
npm exec --workspace=apps/app -- tsc --noEmit
npm run dev:web
```

Open http://localhost:5173/table-next-lab.html?cell=codemirror and http://localhost:5173/table-next-lab.html?cell=textarea. This is a Vite dev-only page; it is not an app route and does not access real notes.

## Comparison protocol

1. Type into a cell, including spaces and escaped pipes. Observe exact root Markdown, undo depth and caret/focus.
2. Switch between cells; type and use Cmd+Z and Cmd+Shift+Z. Verify one root history and exact source.
3. Add many rows and columns, undo and redo each, including after editing cells.
4. Resize the window and add columns. Observe whether the scrollport stays stable.
5. Test non-Latin IME, paste and selection. Repeat in Safari and later the actual WKWebView.
6. Document differences between the two arms and select the editing primitive only after the evidence.

Intentional prototype limits: one top-level canonical table, raw inline Markdown in inactive cells, click activates at end, no range selection, no full clipboard pipeline, no real resize drag, no persistence, no app theme. Raw unescaped pipes/newlines are rejected rather than auto-escaped. Structural actions and history navigation exit cell edit mode instead of guessing cell identity. This is not the final UX. The nested editor uses exact mapped changes and the textarea uses a minimal diff; neither owns history. The lab does not prove production corruption resolved, and it still needs actual browser/WebView interaction tests.

## Interaction-state milestone

The lab now separates editing, cell selection, rectangular selection, row, column, whole-table selection and no interaction. Tab and Shift+Tab are explicit commands in both cell editors, use row-major order and exit to the surrounding document at the edges. Selected cells use roving tab stops and no nested editor. Enter/F2 edits; Escape from editing returns to a selected cell; Escape from selection clears it and blurs the cell without focusing the root editor. Shift+arrows and Shift+click extend a range; toolbar buttons demonstrate row/column/table selection. Delete clears selected content; printable keys replace a single selected cell; multi-cell selections ignore replacement typing until the UX is agreed. Structural operations and history navigation still clear selection rather than infer identity after a structural change. Mouse drag selection, full clipboard and IME validation are still pending. Focus and caret behaviour require real-browser verification.

## Range drag and clipboard milestone

Drag from any cell, including the active editor, into another cell to select a rectangle; a simple click still edits. Dragging entirely inside an active editor retains native text selection. Crossing a cell boundary exits editing and uses the original cell as the range anchor. Native text drag-and-drop is disabled for this gesture in the lab. Selected cells copy TSV, sanitized rich HTML and exact Markdown JSON. Cut and Delete share the same clearing command, preserving selection. Paste overwrites from the selection's top-left (the active editor's cell when editing), grows rows and columns in one transaction, and restores the existing selection when possible. Internal Markdown has priority over external HTML/TSV; external pipes are escaped and ragged grids padded. Merged cells, malformed internal payloads and oversized grids are refused. The prototype uses the existing pure inline HTML renderer temporarily; it does not depend on legacy table editing commands. Clipboard events are scoped to the projected table; paste outside tables, selection history restoration, drag autoscroll, touch drag, native macOS clipboard and IME behaviour still need validation or implementation. Test with actual Cmd+C/X/V and spreadsheet data, not only direct commands.

## History, auto-scroll and outside paste

Root history uses CodeMirror inverted effects to record structural/clipboard selection intent with the document change. Undo/redo restores a valid cell/range bookmark, never an active editor or text caret. No parallel history. Ordinary cell typing records a caret-free cell bookmark in root history; restoring exact nested caret positions is not included. External edits that relocate or replace a table while history exists remain a separate integration test. Each table projection now owns a controller; a second table may be created from internal, TSV or simple HTML clipboard data at supported top-level document positions. Surrounding unselected text is preserved, and a full-document round-trip check gates insertion. Fenced code, table interiors and unsupported blocks are declined. Dragging an established range near a horizontal scrollport edge or viewport edge scrolls it on animation frames until release/cancel/blur/disposal. No touch drag yet. Test actual macOS WKWebView and IME separately; no runtime certification is implied.

### Drag scroll correction

The lab constrains the root CodeMirror flex content and each table scrollport to the visible width; column widths determine the table's full overflow width. Edge detection uses the scrollport client area clipped to the viewport, excludes scrollbars, and re-hit-tests after actual scrolling. A drag that leaves the visible area can initiate scrolling before the pointer has reached a second cell. Actual browser behaviour remains a manual gate.
