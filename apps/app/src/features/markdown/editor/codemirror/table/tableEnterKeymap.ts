import { Prec, type Extension } from '@codemirror/state';
import { keymap, type Command, type KeyBinding } from '@codemirror/view';

import {
  buildEmptyRowText,
  emptyRowCellOffset,
  findCellIndexAt,
  getRowCellBounds,
  insertRowAfterPosition,
  resolveTableRowAtCursor,
} from './tableGeometry';

/**
 * Step 3 of the frozen table UX: Enter anywhere in a table cell — a data
 * row or the header — creates a new, empty row; it never splits the
 * cell's own text (unlike ordinary Enter, which inserts a line break at
 * the caret). The cursor lands in the same column of the new row.
 *
 * Reuses `tableGeometry.ts` in full — the same tree-walking Steps 1/2
 * already established — for locating the enclosing table/row/column;
 * only the row-insertion transaction itself is new.
 *
 * **Fires inside a data row (`TableRow`) or the header (`TableHeader`) —
 * never the alignment row**, which has neither name and is excluded by the
 * same check with no extra code (Enter there defers entirely to whatever
 * already handles it today).
 *
 * **The insertion point depends on which row Enter fired in, precisely
 * because the two cases need different Markdown positions to stay valid
 * GFM.** For a data row, the new row goes immediately after it, same as
 * before. For the header, the new row must NOT go immediately after the
 * header's own line — GFM requires the delimiter row to be the header's
 * very next line, so inserting between them would immediately invalidate
 * the table (the same class of corruption Step 1 exists to prevent, just
 * reached from a different key). Instead, Enter in the header inserts
 * after the delimiter/alignment row — i.e. the new row becomes the first
 * *data* row, right where a reader would expect a fresh row to appear,
 * while the header and delimiter stay exactly as they were, still
 * adjacent.
 *
 * **The new row's width is the table's own canonical column count**
 * (read from the header via `getRowCellBounds`), not the current row's own
 * count — a table's data rows can be ragged (GFM tolerates a short row),
 * so a row's own width isn't a reliable stand-in for the table's.
 *
 * **One transaction, two `changes`-free parts (an insert plus a
 * `selection`), dispatched together** — insertion and cursor placement
 * happen in the same `view.dispatch` call, which is inherently one undo
 * step; no separate state, no second dispatch.
 *
 * **Only ever intercepts a collapsed selection**, same as Steps 1/2 — a
 * non-empty selection defers entirely to native Enter (row/cell-range-
 * aware Enter behavior is out of scope here).
 *
 * `Prec.highest` — above `markdownEnterKeymap.ts`'s own `Prec.high` Enter
 * handling and above `defaultKeymap`'s native `insertNewlineAndIndent`, so
 * this guard is always asked first; it declines for everything outside a
 * data row's own cells, handing Enter back completely unmodified.
 */

const tableEnterGuard: Command = (view) => {
  const resolved = resolveTableRowAtCursor(view);
  if (!resolved) {
    return false;
  }
  const { table, row, pos } = resolved;

  const header = table.firstChild;
  if (!header || header.name !== 'TableHeader') {
    return false;
  }
  const columnCount = getRowCellBounds(header).length;
  if (columnCount === 0) {
    return false;
  }

  const insertPos = insertRowAfterPosition(row);
  if (insertPos === null) {
    return false; // the alignment row itself, or a malformed table — nothing to do.
  }

  const columnIndex = findCellIndexAt(getRowCellBounds(row), pos);
  if (columnIndex === -1) {
    return false;
  }

  const insertText = '\n' + buildEmptyRowText(columnCount);
  const cursorPos = insertPos + 1 + emptyRowCellOffset(columnIndex);

  view.dispatch({
    changes: { from: insertPos, to: insertPos, insert: insertText },
    selection: { anchor: cursorPos },
    scrollIntoView: true,
  });
  return true;
};

const tableEnterKeymapBindings: readonly KeyBinding[] = [{ key: 'Enter', run: tableEnterGuard }];

export function tableEnterKeymap(): Extension {
  return Prec.highest(keymap.of(tableEnterKeymapBindings));
}
