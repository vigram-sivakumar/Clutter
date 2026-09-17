import { Prec, type Extension } from '@codemirror/state';
import { keymap, type Command, type EditorView, type KeyBinding } from '@codemirror/view';

import { resolveCellAt, resolveLogicalCell, resolveTableRowAtCursor, startOfCellContent } from './tableGeometry';

/**
 * Continuation of Step 5: Up/Down inside a table must preserve the
 * table's own COLUMN — not the raw Markdown line's pixel x-position.
 *
 * Native CM6 goal-column vertical motion operates on the raw,
 * currently-unrendered Markdown text (`tableDecoration()` is not wired
 * into the live editor yet), where each row's cells are whatever width
 * their own text happens to be — there is no real grid layout for pixel
 * positions to line up against across rows. Confirmed as a real,
 * reproducible bug in manual testing: Down from a wide header cell landed
 * in the *first* column of a much narrower data row, because the pixel
 * x-position that was "column 2" on the header's line fell short of
 * where column 2 actually starts on the shorter data row's line.
 *
 * The fix resolves the destination via `tableGeometry.ts`'s logical
 * `(rowIndex, columnIndex)` coordinate (`resolveLogicalCell`/
 * `resolveCellAt`) instead of pixel position — a coordinate derived
 * purely from the syntax tree, with no dependency on how (or whether) the
 * table is currently rendered. That's the actual invariant: the table's
 * *logical* row/column is what table interaction is built on, not the
 * raw line's on-screen geometry — so when a real rendering layer is wired
 * in later (or changed, or replaced), this file's contract doesn't need
 * to change at all. This also fully subsumes "never land on the alignment
 * row" — it structurally cannot ever be assigned a logical coordinate
 * (see `resolveLogicalCell`'s own doc comment), with no separate
 * delimiter-row check needed here.
 *
 * **Not a custom cursor/selection model.** One `Command` computes one
 * destination position from the syntax tree and dispatches one ordinary
 * `selection` transaction — exactly Steps 2/4's own cell-to-cell
 * navigation shape. No state persists between keypresses.
 *
 * **Column index is clamped, not dropped, for a ragged target row** (GFM
 * tolerates a row with fewer cells than the header) — landing in that
 * row's own last available column rather than doing nothing, since every
 * real row has at least one.
 *
 * **Defers entirely (`return false`) when there is no previous/next
 * navigable row** — Up from the header (nothing above to preserve a
 * column into — plain native ArrowUp continues out of the table), or
 * Down from the table's last row, which is Step 5's own
 * `tableArrowDownKeymap.ts` concern (unchanged) and/or plain native for
 * an already-existing line below.
 *
 * **Only ever intercepts a collapsed selection**, same as every other
 * table guard.
 *
 * `Prec.highest` — above `defaultKeymap`'s native `cursorLineDown`/
 * `cursorLineUp`, so this guard is always asked first inside a table; it
 * declines for every position outside a resolvable column, or at either
 * end of the table's navigable rows, handing the key back unmodified.
 */

function moveToSameColumn(view: EditorView, rowOffset: 1 | -1): boolean {
  const resolved = resolveTableRowAtCursor(view);
  if (!resolved) {
    return false;
  }
  const current = resolveLogicalCell(view.state, resolved.pos);
  if (!current) {
    return false;
  }
  const target = resolveCellAt(current.table, current.rowIndex + rowOffset, current.columnIndex);
  if (!target) {
    return false;
  }
  view.dispatch({ selection: { anchor: startOfCellContent(view.state, target.bounds) }, scrollIntoView: true });
  return true;
}

const tableColumnArrowDown: Command = (view) => moveToSameColumn(view, 1);
const tableColumnArrowUp: Command = (view) => moveToSameColumn(view, -1);

const tableVerticalKeymapBindings: readonly KeyBinding[] = [
  { key: 'ArrowDown', run: tableColumnArrowDown },
  { key: 'ArrowUp', run: tableColumnArrowUp },
];

export function tableVerticalKeymap(): Extension {
  return Prec.highest(keymap.of(tableVerticalKeymapBindings));
}
