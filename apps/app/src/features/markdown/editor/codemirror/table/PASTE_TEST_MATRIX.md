# Table clipboard verification — current engine

The former paste investigation described three legacy table writers and a
legacy rectangular-normalisation filter. Those are not the production
clipboard architecture. The old table paste and creation writers and their
implementation-specific suites were retired during M13.

## Ownership

- Root document: `paste/pasteRouting.ts` invokes `paste/pasteClassification.ts`
  once. The engine clipboard reader supplies a grid and its source; the
  table-create strategy passes that grid to the engine without reparsing it
  or invoking a fallback writer. Ordinary files, HTML and text retain their
  root routing.
- Active cell or selected table host: `table-engine/tableProjection.ts`
  captures clipboard events; `table-engine/tableCellEditor.ts` handles them.
  The root classifier must not receive these events.
- `table-engine/tableClipboard.ts` owns grid reading/writing and pipe
  escaping. Current Clutter MIME preserves raw cell Markdown. Standalone
  HTML and spreadsheet TSV are supported; root tab-indented text/mixed
  prose is not a spreadsheet. Malformed internal grids and merged cells
  are rejected rather than passed to a second table writer.
- All successful table edits use validated root transactions and root
  undo/redo. A grid starts at the top-left of a selected range or at the
  active cell. A scalar in a caret-free range changes its top-left cell,
  not every cell. A scalar in a live text editor uses its text selection
  or caret. Preserve the accepted engine behaviour, not the superseded
  legacy broadcast rule.

## Regression sources

| Coverage | Current test |
|---|---|
| Real React editor, range/axis and active-cell paste, input metadata, file skips, selection and history, HTML/TSV priority, reconstructed Excel/Sheets/browser/Word payloads | `MarkdownEditor.paste.fullStack.test.tsx` |
| Grid priority, exact internal Markdown, quoted TSV, escaping, malformed payload, bounds and history | `table-engine/tableClipboard.test.ts` |
| Source placement, structural commands, one root transaction and exact history | `table-engine/tableHistoryAndCreation.test.ts`, `table-engine/tableEngine.test.ts` |
| Native selection/clipboard interaction | `table/tableLiveWiring.test.ts`, `table/tableCellFirstDragSelection.test.ts` |
| Root context and rich HTML/file priority | `paste/pasteClassification.test.ts`, `paste/htmlPaste.test.ts`, `paste/assetPaste.test.ts` |
| Handler ownership | `paste/pasteHandlerOwnership.test.ts` |

Clipboard HTML fixtures are reconstructions, not a capture of every
application's macOS pasteboard. A packaged/sandboxed smoke check with actual
clipboard content is still part of the final verification gate.
