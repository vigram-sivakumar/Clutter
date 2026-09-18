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
 * (Tab/Shift-Tab/Enter/Arrow between cells, and its own ArrowLeft/
 * ArrowRight — exiting the table from its first/last cell), this module
 * owns the other boundary: entering the table via ArrowUp/ArrowDown/
 * ArrowRight/ArrowLeft from the root editor, with *no* cell active yet.
 *
 * **Why a separate root-level keymap, not an extension of the nested
 * one.** `tableCellNavigation()`'s bindings only ever fire while the
 * nested editor itself holds real browser focus (`controller.activate()`
 * moves focus there explicitly) — there is no keystroke to intercept
 * *before* a cell is active, because the root editor is what has focus at
 * that point. Root-level entry must therefore be a genuinely separate
 * `keymap` installed on the root `EditorView`, per CM6's own per-view
 * keymap model.
 *
 * **The interception point, precisely**: `EditorView.domEventHandlers`
 * was considered and rejected — CM6 resolves an arrow-key keypress
 * against its own cursor-motion commands *before* any DOM-level handler
 * would see it, so a `keydown` handler would need to fight CM6's own
 * default binding rather than simply outrank it. A `keymap` extension
 * at `Prec.highest` is the same mechanism `tableCellNavigation.ts` and
 * every other editing keymap in this codebase already uses to sit ahead
 * of CM6's own `defaultKeymap` (installed at lower precedence by
 * `createEditorView.ts`): try first, decline (return `false`) whenever
 * the cursor isn't genuinely adjacent to a table, and CM6 falls through
 * to its own default movement untouched.
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

/**
 * Activates `(rowIndex, columnIndex)` of `table` — the one shared step
 * every entry direction (ArrowDown/ArrowUp/ArrowRight/ArrowLeft below)
 * reduces to once it's found its own target cell. `cursorAt` picks which
 * end of the cell's own content the nested caret lands at: `'start'` for
 * ArrowDown/ArrowRight (entering forward, at the table's own top-left —
 * matches `tableCellNavigation.ts`'s own `moveOrExit` convention that
 * Right always lands at a destination's content start), `'end'` for
 * ArrowLeft (entering backward, at the table's own bottom-right — Left
 * always lands at content end, the same file's own established mirror).
 */
function enterCellOf(
  rootView: EditorView,
  controller: TableActiveCellController,
  table: TableInfo,
  rowIndex: number,
  columnIndex: number,
  cursorAt: 'start' | 'end'
): boolean {
  const navigableRows = getNavigableRows(table.node);
  const row = navigableRows[rowIndex];
  if (!row) {
    return false;
  }
  const bounds = getRowCellBounds(row)[columnIndex];
  if (!bounds) {
    return false;
  }
  const rowKind = rowIndex === 0 ? 'header' : 'body';
  const bodyRowIndex = rowIndex === 0 ? 0 : rowIndex - 1;
  const wrapper = findCellWrapper(rootView, table.from, rowKind, bodyRowIndex, columnIndex);
  if (!wrapper) {
    return false;
  }
  const range = trimmedCellRange(rootView.state, bounds);
  const cursorPos = cursorAt === 'start' ? range.from : range.to;
  controller.activate(rootView, wrapper, range.from, range.to, cursorPos);
  return true;
}

/** The table's own last navigable row and its own last column index — `null` if the table has no navigable rows or that row has no columns at all (defensive only; a real, activated table always has both). */
function lastCell(table: TableInfo): { rowIndex: number; columnIndex: number } | null {
  const navigableRows = getNavigableRows(table.node);
  const rowIndex = navigableRows.length - 1;
  const lastRow = navigableRows[rowIndex];
  if (!lastRow) {
    return null;
  }
  const columnIndex = getRowCellBounds(lastRow).length - 1;
  if (columnIndex < 0) {
    return null;
  }
  return { rowIndex, columnIndex };
}

/**
 * The root editor's own ArrowUp/ArrowDown/ArrowRight/ArrowLeft keymap:
 * enters a table from an adjacent line when the cursor is genuinely
 * touching its boundary, otherwise declines outright so CM6's own default
 * movement runs unmodified.
 *
 * Four directions, two entry points (each direction pair lands on the
 * same cell — only the *trigger* differs):
 * - ArrowDown (any position on the line above) and ArrowRight (only at
 *   that line's own end) both enter the table's top-left cell (row 0,
 *   column 0 — "the first cell of the first row").
 * - ArrowUp (any position on the line below) enters the last row's own
 *   column 0 (unchanged, pre-existing behavior). ArrowLeft (only at that
 *   line's own start) instead enters the table's bottom-right cell (the
 *   last row's own last column) — mirroring how ArrowLeft conventionally
 *   lands at the *end* of whatever precedes it, not preserving a column.
 *
 * ArrowRight/ArrowLeft are gated on exact line-boundary position
 * (`sel.head === line.to` / `line.from`), not merely "any position on the
 * adjacent line" the way ArrowUp/ArrowDown are — entering sideways only
 * makes sense from the true edge of the line, matching ordinary text-flow
 * intuition (Right at the middle of a line just moves one character
 * right, never jumps to a table two lines away).
 *
 * This also closes a real, reported bug: without an ArrowRight handler
 * here, CM6's own default behavior at the end of a line immediately
 * followed by a block-replace decoration (the table widget) was
 * observed jumping the cursor to document position 0 instead of either
 * entering the table or moving to the next real line — confirmed
 * directly, reproducibly, via live-browser testing. Intercepting this
 * exact case at `Prec.highest` (below) and entering the table correctly
 * means that broken default path is never reached for it any more.
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
        return enterCellOf(view, controller, table, 0, 0, 'start');
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
        return enterCellOf(view, controller, table, navigableRows.length - 1, 0, 'start');
      }
    }
    return false;
  };

  const arrowRight: Command = (view) => {
    const sel = view.state.selection.main;
    if (!sel.empty) {
      return false;
    }
    const line = view.state.doc.lineAt(sel.head);
    if (sel.head !== line.to) {
      return false;
    }
    for (const table of findAllTables(view.state)) {
      if (view.state.doc.lineAt(table.from).number === line.number + 1) {
        return enterCellOf(view, controller, table, 0, 0, 'start');
      }
    }
    return false;
  };

  const arrowLeft: Command = (view) => {
    const sel = view.state.selection.main;
    if (!sel.empty) {
      return false;
    }
    const line = view.state.doc.lineAt(sel.head);
    if (sel.head !== line.from) {
      return false;
    }
    for (const table of findAllTables(view.state)) {
      if (view.state.doc.lineAt(table.to).number === line.number - 1) {
        const target = lastCell(table);
        if (!target) {
          return false;
        }
        return enterCellOf(view, controller, table, target.rowIndex, target.columnIndex, 'end');
      }
    }
    return false;
  };

  const bindings: readonly KeyBinding[] = [
    { key: 'ArrowDown', run: arrowDown },
    { key: 'ArrowUp', run: arrowUp },
    { key: 'ArrowRight', run: arrowRight },
    { key: 'ArrowLeft', run: arrowLeft },
  ];

  return Prec.highest(keymap.of(bindings));
}
