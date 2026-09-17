import { Prec, type Extension } from '@codemirror/state';
import { keymap, type Command, type KeyBinding } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { endOfCellContent, findCellIndexAt, getNavigableRows, getRowCellBounds, resolveTableRowAtCursor } from './tableGeometry';

/**
 * Step 4 of the frozen table UX: Tab/Shift-Tab move between cells in
 * row-major order — the table's own header and every `TableRow`,
 * flattened into one sequence, skipping the alignment row entirely (it
 * has no cells, per `getNavigableRows`). Tab/Shift-Tab are navigation
 * only: at either end of the table (Tab past the last cell, Shift-Tab
 * before the first) nothing happens — no row is created, no structural
 * change of any kind. (Row creation belongs to Enter alone — Step 3's
 * `tableEnterKeymap.ts` — never to Tab.)
 *
 * **Row-major, not "next sibling cell, then defer at the row edge."** A
 * table is a flat grid for this purpose: every (row, column) pair across
 * the whole table is flattened into one ordered list first, then Tab/
 * Shift-Tab just step `+1`/`-1` through it — so "last cell of a row"
 * naturally continues into "first cell of the next row" with no special
 * per-row-boundary code, and "first cell of the whole table" is simply
 * index `0` of that same list. Confirmed against the frozen spec's own
 * clarification: a row-major grid, not one that stops or defers at every
 * row boundary.
 *
 * **Landing position is always the destination cell's own content end**
 * (`endOfCellContent`), for both Tab and Shift-Tab — regardless of which
 * direction the jump came from. This is a frozen, explicit requirement:
 * landing at the end makes it immediately convenient to keep typing
 * (append) in the destination cell. For an empty destination cell,
 * `endOfCellContent` naturally coincides with its own start (there's no
 * content to be "before"), so the empty-cell case needs no special
 * handling.
 *
 * **Only ever intercepts a collapsed selection**, same as Steps 1–3. Both
 * "do nothing" cases (Tab past the last cell, Shift-Tab before the first)
 * return `true` with no dispatch — actively consuming the key, never
 * `false` — since deferring to native Tab/Shift-Tab here would risk
 * changing indentation or otherwise leaving the table, which the frozen
 * spec explicitly forbids ("do not leave the table or modify it").
 *
 * `Prec.highest` — above `indentWithTab`/`markdownIndentKeymap`'s own Tab
 * handling (registered at default precedence in `createEditorView.ts`),
 * so this guard is always asked first; it declines for everything outside
 * a table's own cells, handing Tab back completely unmodified.
 */

interface FlatCell {
  readonly row: SyntaxNode;
  readonly columnIndex: number;
}

function flattenTable(table: SyntaxNode): FlatCell[] {
  const cells: FlatCell[] = [];
  for (const row of getNavigableRows(table)) {
    const columnCount = getRowCellBounds(row).length;
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
      cells.push({ row, columnIndex });
    }
  }
  return cells;
}

function currentFlatIndex(cells: readonly FlatCell[], row: SyntaxNode, columnIndex: number): number {
  return cells.findIndex((c) => c.row.from === row.from && c.columnIndex === columnIndex);
}

const tableTabGuard: Command = (view) => {
  const resolved = resolveTableRowAtCursor(view);
  if (!resolved) {
    return false;
  }
  const { table, row, pos } = resolved;
  const columnIndex = findCellIndexAt(getRowCellBounds(row), pos);
  if (columnIndex === -1) {
    return false;
  }

  const cells = flattenTable(table);
  const index = currentFlatIndex(cells, row, columnIndex);
  if (index === -1) {
    return false;
  }

  const next = cells[index + 1];
  if (!next) {
    // Last cell of the entire table — Tab is navigation only, per the
    // frozen spec: nothing happens, no row is created. Returning `true`
    // (not `false`) actively consumes the key so nothing else touches the
    // table or its surroundings.
    return true;
  }
  const bounds = getRowCellBounds(next.row)[next.columnIndex];
  if (!bounds) {
    return true;
  }
  view.dispatch({ selection: { anchor: endOfCellContent(view.state, bounds) }, scrollIntoView: true });
  return true;
};

const tableShiftTabGuard: Command = (view) => {
  const resolved = resolveTableRowAtCursor(view);
  if (!resolved) {
    return false;
  }
  const { table, row, pos } = resolved;
  const columnIndex = findCellIndexAt(getRowCellBounds(row), pos);
  if (columnIndex === -1) {
    return false;
  }

  const cells = flattenTable(table);
  const index = currentFlatIndex(cells, row, columnIndex);
  if (index === -1) {
    return false;
  }

  if (index === 0) {
    // First cell of the whole table — do nothing, per the frozen spec.
    // Returning true (not false) actively consumes the key so no other
    // handler (e.g. indent-decrease) touches the table or its surroundings.
    return true;
  }

  const previous = cells[index - 1];
  if (!previous) {
    return true;
  }
  const bounds = getRowCellBounds(previous.row)[previous.columnIndex];
  if (!bounds) {
    return true;
  }
  view.dispatch({ selection: { anchor: endOfCellContent(view.state, bounds) }, scrollIntoView: true });
  return true;
};

const tableTabKeymapBindings: readonly KeyBinding[] = [
  { key: 'Tab', run: tableTabGuard },
  { key: 'Shift-Tab', run: tableShiftTabGuard },
];

export function tableTabKeymap(): Extension {
  return Prec.highest(keymap.of(tableTabKeymapBindings));
}
