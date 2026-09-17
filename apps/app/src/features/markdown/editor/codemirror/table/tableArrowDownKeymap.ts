import { Prec, type Extension } from '@codemirror/state';
import { keymap, type Command, type KeyBinding } from '@codemirror/view';

import { getNavigableRows, resolveTableRowAtCursor } from './tableGeometry';

/**
 * Step 5 of the frozen table UX: ordinary vertical movement (Up/Down)
 * stays entirely native CM6 — confirmed in the earlier real-browser
 * investigation that goal-column tracking over the CSS-table layout
 * already keeps the caret in the same column across rows, including
 * through unequal cell lengths and empty cells, with zero table-specific
 * code. This file adds exactly one narrow exception: ArrowDown from the
 * table's own last row, when there is genuinely nothing after the table
 * in the document at all — confirmed live that native ArrowDown is
 * simply a no-op there (nowhere to go), not merely "moves somewhere
 * unexpected." In that one case, this inserts a single blank line
 * immediately after the table and moves the caret there — a blank line
 * is what GFM's own leaf-block rule already recognizes as ending a table
 * (confirmed in `tableDecoration.test.ts`'s own "a blank line genuinely
 * ends the table" case), so the new line is unambiguously an ordinary,
 * out-of-table paragraph position, never another table row.
 *
 * Reuses `tableGeometry.ts`'s `getNavigableRows` (Step 4) to find the
 * table's own last row — the header when there are no data rows yet,
 * otherwise the last data row — rather than re-deriving that notion.
 *
 * **Never fires from any row but the table's own last one.** Ordinary
 * ArrowDown from an earlier row must keep moving down within the table
 * (the native behavior this step explicitly preserves), so this returns
 * `false` immediately unless the caret's row is exactly the last
 * navigable row.
 *
 * **"Nothing below" is a document-structure check, not a content check.**
 * If the table's own last line is already followed by any line at all —
 * blank or not, a real paragraph or GFM's own absorbed-continuation-line
 * quirk — this defers to native, which the investigation already
 * confirmed reaches it correctly. Only when the table's last line is
 * also the document's very last line does this guard act, matching "if
 * something already exists below the table — including an existing
 * empty paragraph — do not create another line."
 *
 * **No custom ArrowUp behavior** — this file binds `ArrowDown` only.
 *
 * **Only ever intercepts a collapsed selection**, same as Steps 1–4.
 *
 * `Prec.highest` — above `defaultKeymap`'s native `cursorLineDown`, so
 * this guard is always asked first; it declines for everything outside
 * its own single narrow case, handing ArrowDown back completely
 * unmodified.
 */

const tableArrowDownGuard: Command = (view) => {
  const resolved = resolveTableRowAtCursor(view);
  if (!resolved) {
    return false;
  }
  const { table, row } = resolved;

  const navigableRows = getNavigableRows(table);
  const lastRow = navigableRows[navigableRows.length - 1];
  if (!lastRow || row.from !== lastRow.from) {
    return false; // not the table's last row — native same-column vertical movement continues to apply.
  }

  const { state } = view;
  const tableEndLine = state.doc.lineAt(table.to).number;
  if (tableEndLine < state.doc.lines) {
    return false; // something (blank or not) already exists below the table — defer to native.
  }

  view.dispatch({
    changes: { from: table.to, to: table.to, insert: '\n' },
    selection: { anchor: table.to + 1 },
    scrollIntoView: true,
  });
  return true;
};

const tableArrowDownKeymapBindings: readonly KeyBinding[] = [{ key: 'ArrowDown', run: tableArrowDownGuard }];

export function tableArrowDownKeymap(): Extension {
  return Prec.highest(keymap.of(tableArrowDownKeymapBindings));
}
