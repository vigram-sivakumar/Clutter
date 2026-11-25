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
