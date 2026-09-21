import type { EditorState, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { renderInlineMarkdown } from './renderInlineMarkdown';
import { endOfCellContent, findAllTables, getNavigableRows, getRectangularRowCellBounds, getRowCellBounds, startOfCellContent } from './tableGeometry';
import { tableSelectionField, type TableSelection } from './tableSelection';
import { clearTableSelection } from './tableSelectionClear';

/**
 * Copy/Cut for a rectangular `range`-kind `TableSelection`
 * (`docs/table-range-selection-clipboard-ux-contract.md`'s "Clipboard —
 * Copy"/"Cut" sections). Paste is explicitly out of this milestone's scope
 * — see this module's own top doc comment for why that's a genuinely
 * separate, larger problem, not deferred out of convenience.
 *
 * **Interception point: `EditorView.domEventHandlers({copy, cut})`, not a
 * keymap.** Investigated first, not assumed: CM6 has its own built-in
 * `copy`/`cut` handling (confirmed directly in the installed
 * `@codemirror/view` source, the base `handlers.copy`/`handlers.cut`) —
 * during a `range` `TableSelection`, root's own text selection is
 * *collapsed* (a `TableSelection` is CM6-extension state, not a real
 * `EditorSelection` range — `tableRootSelectionSnap.ts`'s own invariant
 * keeps it collapsed and outside the table entirely), so CM6's default
 * handler would fall through to its own "nothing selected → line-wise
 * copy" fallback and copy whatever line the collapsed caret happens to sit
 * on — never the selected cells, and not even a predictable no-op.
 * `domEventHandlers` participates in the *same* merged handler list CM6's
 * own base `copy`/`cut` handlers already live in (confirmed via the same
 * mechanism/empirical verification `tableRangeSelectionTyping.ts`'s own
 * `beforeinput` interception already established for `insertText`) —
 * returning `true` here calls `event.preventDefault()` and stops CM6's own
 * handler from running at all, the same contract every other
 * `domEventHandlers` extension in this codebase already relies on.
 *
 * **Cut reuses `clearTableSelection` directly, not a second clearing
 * implementation.** Cut's own required shape — clear the selected cells,
 * keep the exact same `TableSelection`, one single undoable transaction —
 * is *exactly* what `clearTableSelection` (`tableSelectionClear.ts`)
 * already does and already has undo/redo history support for
 * (`tableSelectionDeletionHistory`, wired once in `buildEditorExtensions.ts`,
 * generic over any transaction with real changes plus a
 * `tableSelectionChanged` effect regardless of source). This module writes
 * clipboard data *before* calling it and does nothing else structurally —
 * no new transaction shape, no new history registration.
 *
 * **Never touches the document for Copy** — only reads it, via the same
 * rectangular geometry (`getRectangularRowCellBounds`) the rest of the
 * rectangular-table invariant already established, so a missing logical
 * cell in a ragged source row copies as an empty field automatically
 * (`startOfCellContent`/`endOfCellContent` on a `synthetic` bounds both
 * collapse to the same position, so `state.sliceDoc` already returns `''`
 * — no special-casing needed).
 */

interface RangeExtent {
  readonly minRow: number;
  readonly maxRow: number;
  readonly minCol: number;
  readonly maxCol: number;
}

function extentOf(selection: Extract<TableSelection, { kind: 'range' }>): RangeExtent {
  return {
    minRow: Math.min(selection.anchor.row, selection.head.row),
    maxRow: Math.max(selection.anchor.row, selection.head.row),
    minCol: Math.min(selection.anchor.col, selection.head.col),
    maxCol: Math.max(selection.anchor.col, selection.head.col),
  };
}

/**
 * The selected rectangle's own raw Markdown text, one entry per cell,
 * row-major — `''` for a cell a ragged row has no real source for
 * (rectangular-table invariant; never throws, never omits a row/column).
 * `null` if the table or its header can no longer be resolved (defensive
 * only — every call site here only ever runs while `selection` is known
 * current).
 */
function buildRangeGrid(state: EditorState, selection: Extract<TableSelection, { kind: 'range' }>): string[][] | null {
  const table = findAllTables(state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return null;
  }
  const navigableRows = getNavigableRows(table.node);
  const header = navigableRows[0];
  if (!header) {
    return null;
  }
  const headerColumnCount = getRowCellBounds(header).length;
  const { minRow, maxRow, minCol, maxCol } = extentOf(selection);

  const grid: string[][] = [];
  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex++) {
    const row = navigableRows[rowIndex];
    if (!row) {
      continue;
    }
    const bounds = getRectangularRowCellBounds(headerColumnCount, row);
    const rowCells: string[] = [];
    for (let colIndex = minCol; colIndex <= maxCol; colIndex++) {
      const cellBounds = bounds[colIndex];
      if (!cellBounds) {
        rowCells.push('');
        continue;
      }
      rowCells.push(state.sliceDoc(startOfCellContent(state, cellBounds), endOfCellContent(state, cellBounds)));
    }
    grid.push(rowCells);
  }
  return grid;
}

/** GFM's own escape for a literal tab/newline inside a TSV field — table cell content can't itself contain a raw newline (a Markdown table row is one line), but a tab is plain text and must not be misread as a field separator by whatever the data is pasted into. */
function escapeTsvField(value: string): string {
  return value.replace(/\t/g, ' ');
}

function buildTsv(grid: readonly (readonly string[])[]): string {
  return grid.map((row) => row.map(escapeTsvField).join('\t')).join('\n');
}

function buildHtmlTable(grid: readonly (readonly string[])[]): string {
  const rows = grid
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`)
    .join('');
  return `<table>${rows}</table>`;
}

/**
 * The private internal representation
 * (`application/x-clutter-table`) — the *raw Markdown* grid as JSON, so a
 * future Clutter-to-Clutter paste can restore exact formatting (`**bold**`
 * stays `**bold**`, not flattened to plain text the way TSV/HTML
 * necessarily are). Temporary serialization only, built fresh from the
 * document on every copy — never a second persistent table model; nothing
 * here is retained once the clipboard event returns.
 */
function buildInternalPayload(grid: readonly (readonly string[])[]): string {
  return JSON.stringify({ kind: 'clutter-table-range', rows: grid });
}

export const CLUTTER_TABLE_RANGE_MIME = 'application/x-clutter-table';

function writeClipboard(event: ClipboardEvent, grid: readonly (readonly string[])[]): boolean {
  const data = event.clipboardData;
  if (!data) {
    return false;
  }
  data.clearData();
  data.setData('text/plain', buildTsv(grid));
  data.setData('text/html', buildHtmlTable(grid));
  data.setData(CLUTTER_TABLE_RANGE_MIME, buildInternalPayload(grid));
  return true;
}

export function tableRangeClipboard(): Extension {
  return EditorView.domEventHandlers({
    copy(event, view) {
      const selection = view.state.field(tableSelectionField, false) ?? null;
      if (!selection || selection.kind !== 'range') {
        return false;
      }
      const grid = buildRangeGrid(view.state, selection);
      if (!grid) {
        return false;
      }
      return writeClipboard(event, grid);
    },
    cut(event, view) {
      const selection = view.state.field(tableSelectionField, false) ?? null;
      if (!selection || selection.kind !== 'range') {
        return false;
      }
      const grid = buildRangeGrid(view.state, selection);
      if (!grid) {
        return false;
      }
      const wrote = writeClipboard(event, grid);
      if (!wrote) {
        return false;
      }
      // Same single-transaction clearing (and its own already-wired
      // undo/redo history) every other Backspace/Delete-over-a-selection
      // path already uses — no second clearing implementation.
      clearTableSelection(view, selection);
      return true;
    },
  });
}
