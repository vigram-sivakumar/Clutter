# Table replacement — stage 1 prototype

Status: **experimental, not wired into the production editor**.

Baseline: f18e81d (previous table-history/source-sync branch). Existing production table code and ADR-034 remain untouched until the replacement passes its gates.

## Design

- Markdown remains the sole persistent document; the table model is an immutable derived snapshot.
- Lezer's existing Clutter grammar supplies cell boundaries; only the opaque alignment row is split separately.
- Row/column/metadata operations use a single pure reducer and a full-document round-trip validation gate.
- One structural action produces one root CodeMirror history transaction. No additional history or repair filters.
- The whole table is replaced for structural commands in this prototype. Ordinary typing must use minimal mapped changes in a later cell-editor adapter.
- Widths stay in the existing attribute syntax provisionally. No format-on-open or format-on-save is introduced.
- Unsupported nested/indented tables, overflowing rows and malformed width metadata fail closed. The prototype deliberately does not solve all imported-table variations, inline editing, paste escaping, whole-table deletion, selection, focus, layout or clipboard conversion yet. Raw Markdown is preserved on refusal. Ragged missing cells are represented explicitly without writing on read.

## Validation

From the repository root:

```sh
npm run test:run -- src/features/markdown/editor/codemirror/table-next
```

The tests cover the shared parser/source map, structural invariants, metadata, invalid input, mixed command sequences, exact 100-row undo/redo, and transaction-filter refusal. They are **not evidence of a pass until executed**.

## Gate before a UI prototype

1. Run the focused tests and TypeScript check; fix all failures before integration.
2. Capture the existing production corruption with actual quick-add clicks, recording exact before/after source, history depth, filter annotations and parser shape. Distinguish malformed source from incorrect projection.
3. Compare a stable HTML table with a minimal nested CodeMirror adapter against a lightweight cell editor. Test real keyboard events, focus ownership, IME, scrolling, and exact source undo/redo using the full editor lifecycle and macOS WebView.
4. Only after those results, supersede ADR-034, integrate the winning implementation, and remove obsolete production paths.

No compatibility requirement for experimental implementation details; no permission to silently discard user-authored Markdown.
