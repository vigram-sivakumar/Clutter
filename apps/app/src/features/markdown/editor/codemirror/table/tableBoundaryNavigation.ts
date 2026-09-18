import { Prec, type EditorState, type Extension } from '@codemirror/state';
import { keymap, type Command, type EditorView, type KeyBinding } from '@codemirror/view';

import type { TableActiveCellController } from './tableActiveCellController';
import {
  endOfCellContent,
  findAllTables,
  getNavigableRows,
  getRowCellBounds,
  startOfCellContent,
  type CellBounds,
  type TableInfo,
} from './tableGeometry';

/**
 * Root-editor counterpart to `tableCellNavigation.ts`'s own nested-editor
 * keymap: where that file owns movement *once a cell is already active*
 * (Tab/Shift-Tab/Enter/Arrow between cells, and — its own newer
 * ArrowLeft/ArrowRight — exiting the table from its first/last cell),
 * this module owns the other boundary: entering the table via ArrowUp/
 * ArrowDown from the root editor, with *no* cell active yet.
 *
 * **Why a separate root-level keymap, not an extension of the nested
 * one.** `tableCellNavigation()`'s bindings only ever fire while the
 * nested editor itself holds real browser focus (`controller.activate()`
 * moves focus there explicitly) — there is no keystroke to intercept
 * *before* a cell is active, because the root editor is what has focus at
 * that point. Root-level ArrowUp/ArrowDown must therefore be a genuinely
 * separate `keymap` installed on the root `EditorView`, per CM6's own
 * per-view keymap model.
 *
 * **The interception point, precisely**: `EditorView.domEventHandlers`
 * was considered and rejected — CM6 resolves an `ArrowUp`/`ArrowDown`
 * keypress against its own cursor-motion commands *before* any DOM-level
 * handler would see it, so a `keydown` handler would need to fight CM6's
 * own default binding rather than simply outrank it. A `keymap` extension
 * at `Prec.highest` is the same mechanism `tableCellNavigation.ts` and
 * every other editing keymap in this codebase already uses to sit ahead
 * of CM6's own `defaultKeymap` (installed at lower precedence by
 * `createEditorView.ts`): try first, decline (return `false`) whenever
 * the cursor isn't genuinely adjacent to a table, and CM6 falls through
 * to its own default line-up/line-down movement untouched.
 *
 * **Why this can't reuse `findEnclosingTable`/`resolveLogicalCell`.**
 * Those answer "is this position *inside* a table" — exactly what must
 * be false here (this module's whole job runs only when the root
 * selection sits *outside* every table, on the line immediately
 * touching one). Detection here is purely line-adjacency: does the
 * current line's number equal `1 +` the line the nearest table's own
 * `.to` resolves to (entering from below), or `1 -` the line its `.from`
 * resolves to (entering from above)?
 *
 * **Locating the target cell's DOM wrapper.** `controller.activate()`
 * needs a container element to mount the nested editor into — for a
 * mouse click, `tableWidget.ts`'s own `mousedown` handler reads that
 * straight off the event; there is no equivalent event here. Instead,
 * this queries the *already-rendered* static `.cm-table-cell-wrapper`
 * for the target cell directly out of the root view's own DOM, keyed by
 * the `data-table-from` attribute `tableWidget.ts`'s `toDOM()` now
 * stamps on every table widget specifically for this lookup.
 */

function trimmedCellRange(state: EditorState, bounds: CellBounds): { readonly from: number; readonly to: number } {
  return { from: startOfCellContent(state, bounds), to: endOfCellContent(state, bounds) };
}

/**
 * The `.cm-table-cell-wrapper` for column `columnIndex` of either the
 * header (`rowKind: 'header'`) or the `bodyRowIndex`-th (0-based) data
 * row of the table whose own `data-table-from` matches `tableFrom` — or
 * `null` if that table/row/column isn't currently rendered (defensive
 * only; every call site here only ever asks for a cell `getNavigableRows`
 * has already confirmed exists).
 */
function findCellWrapper(
  rootView: EditorView,
  tableFrom: number,
  rowKind: 'header' | 'body',
  bodyRowIndex: number,
  columnIndex: number
): HTMLElement | null {
  const widget = rootView.dom.querySelector<HTMLElement>(`.cm-table-widget[data-table-from="${tableFrom}"]`);
  if (!widget) {
    return null;
  }
  const row =
    rowKind === 'header'
      ? widget.querySelector<HTMLElement>('thead tr')
      : widget.querySelectorAll<HTMLElement>('tbody tr')[bodyRowIndex];
  if (!row) {
    return null;
  }
  const cell = row.children[columnIndex];
  if (!cell) {
    return null;
  }
  return cell.querySelector<HTMLElement>('.cm-table-cell-wrapper');
}

/** Activates column 0 of `navigableRows[rowIndex]` — the one shared step both `arrowDownCommand` (entering the first row) and `arrowUpCommand` (entering the last row) reduce to once they've found their target row. */
function enterFirstColumnOf(
  rootView: EditorView,
  controller: TableActiveCellController,
  table: TableInfo,
  rowIndex: number
): boolean {
  const navigableRows = getNavigableRows(table.node);
  const row = navigableRows[rowIndex];
  if (!row) {
    return false;
  }
  const bounds = getRowCellBounds(row)[0];
  if (!bounds) {
    return false;
  }
  const rowKind = rowIndex === 0 ? 'header' : 'body';
  const bodyRowIndex = rowIndex === 0 ? 0 : rowIndex - 1;
  const wrapper = findCellWrapper(rootView, table.from, rowKind, bodyRowIndex, 0);
  if (!wrapper) {
    return false;
  }
  const range = trimmedCellRange(rootView.state, bounds);
  // Content-start landing, matching `tableCellNavigation.ts`'s own
  // vertical-movement convention (`moveToSameColumn`/`arrowDownCommand`'s
  // target branch both land at `range.from`, not `range.to`).
  controller.activate(rootView, wrapper, range.from, range.to, range.from);
  return true;
}

/**
 * The root editor's own ArrowUp/ArrowDown keymap: enters a table from an
 * adjacent line when the cursor is genuinely touching its boundary,
 * otherwise declines outright so CM6's own default vertical movement
 * runs unmodified. No opinion about ArrowLeft/ArrowRight (the root editor
 * never needs to *enter* a table sideways — the table exit-only
 * ArrowLeft/ArrowRight commands live in `tableCellNavigation.ts`, on the
 * nested-editor side, since only a cell already active can be exited).
 */
export function tableBoundaryNavigation(controller: TableActiveCellController): Extension {
  const arrowDown: Command = (view) => {
    const sel = view.state.selection.main;
    if (!sel.empty) {
      return false;
    }
    const line = view.state.doc.lineAt(sel.head);
    for (const table of findAllTables(view.state)) {
      if (view.state.doc.lineAt(table.from).number === line.number + 1) {
        return enterFirstColumnOf(view, controller, table, 0);
      }
    }
    return false;
  };

  const arrowUp: Command = (view) => {
    const sel = view.state.selection.main;
    if (!sel.empty) {
      return false;
    }
    const line = view.state.doc.lineAt(sel.head);
    for (const table of findAllTables(view.state)) {
      if (view.state.doc.lineAt(table.to).number === line.number - 1) {
        const navigableRows = getNavigableRows(table.node);
        return enterFirstColumnOf(view, controller, table, navigableRows.length - 1);
      }
    }
    return false;
  };

  const bindings: readonly KeyBinding[] = [
    { key: 'ArrowDown', run: arrowDown },
    { key: 'ArrowUp', run: arrowUp },
  ];

  return Prec.highest(keymap.of(bindings));
}
