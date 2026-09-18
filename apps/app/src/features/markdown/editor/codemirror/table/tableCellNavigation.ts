import { Prec, type EditorState, type Extension } from '@codemirror/state';
import { keymap, type Command, type EditorView, type KeyBinding } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import type { TableActiveCellController } from './tableActiveCellController';
import {
  buildEmptyRowText,
  emptyRowCellOffset,
  endOfCellContent,
  getNavigableRows,
  getRowCellBounds,
  insertRowAfterPosition,
  resolveCellAt,
  resolveLogicalCell,
  startOfCellContent,
  type CellBounds,
} from './tableGeometry';

/**
 * The active cell's nested editor's own keymap (Architecture E, ADR-034 —
 * docs/table-implementation-plan.md, M4): Tab/Shift-Tab/Enter/Arrow move
 * *which cell is active* via `controller`, using `tableGeometry.ts`'s
 * existing traversal functions — never a shared root caret stepping
 * through raw Markdown, which is the whole problem class Architecture E
 * removes (the nested editor's own document has no pipe characters at
 * all, so there is no hidden-delimiter navigation left to special-case;
 * see the deleted `tableArrowKeymap.ts`'s own doc comment for the old
 * problem this makes moot).
 *
 * Not yet wired into the live editing path — installed only via
 * `TableActiveCellController.setNestedExtensions()` in this file's own
 * tests, the same standalone-verification style M1–M3 already established.
 *
 * Every command re-resolves the active cell fresh from `rootView.state`
 * via `resolveLogicalCell(rootView.state, controller.activeAnchor.from)`
 * on every keypress — never a cached `(rowIndex, columnIndex)` — matching
 * `TableActiveCellController.remapActiveAnchor`'s own "never trust a
 * cached index" discipline (M3).
 *
 * Destination mounting reuses whatever container the nested editor is
 * currently parented in (`controller.nestedView.dom.parentElement`) —
 * there is no per-cell `<td>` to move into yet (that's `TableWidget`'s
 * own live click-to-activate wiring, M5); moving the nested view between
 * distinct containers is already `TableActiveCellController.activate()`'s
 * own job once that wiring exists.
 */

interface FlatCell {
  readonly row: SyntaxNode;
  readonly columnIndex: number;
  readonly bounds: CellBounds;
}

/** Every logical cell of `table`, row-major (header first, then each `TableRow`) — the same flattening `tableTabKeymap.ts`/`tableArrowKeymap.ts` each kept as private local copies; consolidated here since this one file now owns every cell-to-cell navigation command. */
function flattenNavigableCells(table: SyntaxNode): FlatCell[] {
  const cells: FlatCell[] = [];
  for (const row of getNavigableRows(table)) {
    for (const [columnIndex, bounds] of getRowCellBounds(row).entries()) {
      cells.push({ row, columnIndex, bounds });
    }
  }
  return cells;
}

function currentFlatIndex(cells: readonly FlatCell[], row: SyntaxNode, columnIndex: number): number {
  return cells.findIndex((c) => c.row.from === row.from && c.columnIndex === columnIndex);
}

/** The container the nested editor is currently mounted in, or `null` if nothing is active/mounted — every command below bails harmlessly (declines) when this is missing. */
function activeContainer(controller: TableActiveCellController): HTMLElement | null {
  return controller.nestedView?.dom.parentElement ?? null;
}

/**
 * A cell's real *editable content* range — `startOfCellContent`/
 * `endOfCellContent`, not `bounds.leftDelimiterTo`/`.rightDelimiterFrom`
 * directly. The raw delimiter-to-delimiter gap includes the padding
 * spaces around a cell's text (`"| Name |"`'s gap is `" Name "`, not
 * `"Name"`) — exactly what `TableWidget`'s own static rendering already
 * trims (`tableWidgetField.ts`'s `rowCellTexts`). Activating on the
 * untrimmed gap would show those literal padding spaces as if they were
 * part of the cell's own text in the nested editor, and typing would
 * then edit *inside* that padding rather than replacing it — degenerates
 * to a single point at `leftDelimiterTo` for a whitespace-only (or truly
 * empty) cell, which is exactly the empty-nested-document behavior every
 * empty-cell activation in this codebase already expects.
 */
function trimmedCellRange(state: EditorState, bounds: CellBounds): { readonly from: number; readonly to: number } {
  return { from: startOfCellContent(state, bounds), to: endOfCellContent(state, bounds) };
}

/**
 * Builds the nested-editor keymap `Extension`. Pass `getRootView` (a
 * fresh-per-call getter, matching every other injected-reference
 * convention in this codebase) and the same `controller` instance that
 * will mount this nested editor, then install the result via
 * `controller.setNestedExtensions([tableCellNavigation(...)])` before the
 * first `activate()` call — every command below closes over both
 * directly, since a `Command`'s only argument is the nested `EditorView`
 * it fired on, not any outside context.
 */
export function tableCellNavigation(getRootView: () => EditorView, controller: TableActiveCellController): Extension {
  function moveByFlatOffset(rootView: EditorView, offset: 1 | -1): boolean {
    const anchor = controller.activeAnchor;
    if (!anchor) {
      return false;
    }
    const current = resolveLogicalCell(rootView.state, anchor.from);
    if (!current) {
      return false;
    }
    const cells = flattenNavigableCells(current.table);
    const index = currentFlatIndex(cells, current.row, current.columnIndex);
    if (index === -1) {
      return false;
    }
    const next = cells[index + offset];
    if (!next) {
      // Table boundary (Tab past the last cell, Shift-Tab before the
      // first) — navigation only, consume the key with no dispatch, per
      // the frozen UX (`tableTabKeymap.ts`'s own doc comment).
      return true;
    }
    const container = activeContainer(controller);
    if (!container) {
      return true;
    }
    // Landing position is always the destination cell's own content end,
    // for both directions — `tableTabKeymap.ts`'s own frozen requirement,
    // ported unchanged: makes it immediately convenient to keep typing.
    const range = trimmedCellRange(rootView.state, next.bounds);
    controller.activate(rootView, container, range.from, range.to, range.to);
    return true;
  }

  const tabCommand: Command = () => moveByFlatOffset(getRootView(), 1);
  const shiftTabCommand: Command = () => moveByFlatOffset(getRootView(), -1);

  function moveToSameColumn(rowOffset: 1 | -1): boolean {
    const rootView = getRootView();
    const anchor = controller.activeAnchor;
    if (!anchor) {
      return false;
    }
    const current = resolveLogicalCell(rootView.state, anchor.from);
    if (!current) {
      return false;
    }
    const target = resolveCellAt(current.table, current.rowIndex + rowOffset, current.columnIndex);
    if (!target) {
      return false; // No row above/below to preserve a column into — declines (Up from the header; Down from the last row has its own exit case below).
    }
    const container = activeContainer(controller);
    if (!container) {
      return true;
    }
    const range = trimmedCellRange(rootView.state, target.bounds);
    controller.activate(rootView, container, range.from, range.to, range.from);
    return true;
  }

  const arrowUpCommand: Command = () => moveToSameColumn(-1);

  /**
   * ArrowLeft/ArrowRight: only intercepted at the nested editor's own
   * genuine start (`head === 0`, ArrowLeft) or end (`head === doc.length`,
   * ArrowRight) with a collapsed selection — anywhere else, an ordinary
   * per-character caret move within the cell's own text, left to CM6's
   * default (declines). At the boundary, reuses the *exact same*
   * flattened, row-major cell list `moveByFlatOffset` (Tab/Shift-Tab)
   * already builds via `flattenNavigableCells`/`currentFlatIndex` — so
   * Left/Right move cell-to-cell exactly like Shift-Tab/Tab do, "treat
   * the table as a 2D navigable block" read literally as one flat
   * traversal order, not a per-row-only hop that would need its own
   * separate "no cell to the left in this row, but a previous row
   * exists" rule. The one place Left/Right genuinely differ from Tab/
   * Shift-Tab: at the table's own outer boundary (no previous/next cell
   * at all — only ever true at the table's first or last cell overall),
   * where Tab/Shift-Tab merely consume the key, Left/Right instead exit
   * the table entirely — the behavior this pair of commands exists for.
   *
   * Landing position on an ordinary cell-to-cell move mirrors normal
   * text-field continuity, not Tab's own "always content end" convention:
   * Right lands at the destination's content *start* (continuing
   * forward), Left at its content *end* (continuing backward).
   */
  function moveOrExit(nestedView: EditorView, offset: 1 | -1): boolean {
    const sel = nestedView.state.selection.main;
    const atBoundary = offset === 1 ? sel.head === nestedView.state.doc.length : sel.head === 0;
    if (!sel.empty || !atBoundary) {
      return false;
    }
    const rootView = getRootView();
    const anchor = controller.activeAnchor;
    if (!anchor) {
      return false;
    }
    const current = resolveLogicalCell(rootView.state, anchor.from);
    if (!current) {
      return false;
    }
    const cells = flattenNavigableCells(current.table);
    const index = currentFlatIndex(cells, current.row, current.columnIndex);
    if (index === -1) {
      return false;
    }
    const next = cells[index + offset];
    if (next) {
      const container = activeContainer(controller);
      if (!container) {
        return true;
      }
      const range = trimmedCellRange(rootView.state, next.bounds);
      const cursorPos = offset === 1 ? range.from : range.to;
      controller.activate(rootView, container, range.from, range.to, cursorPos);
      return true;
    }
    return offset === 1 ? exitBelow(rootView, current.table) : exitAbove(rootView, current.table);
  }

  /**
   * ArrowLeft's own table-boundary exit: the line immediately before the
   * table's own first line — always a real, pre-existing editor line (the
   * table couldn't exist at all without content, even just a blank line,
   * somewhere above it once `table.from > 0`). Declines when the table
   * sits at the very start of the document — nothing above to exit to.
   */
  function exitAbove(rootView: EditorView, table: SyntaxNode): boolean {
    if (table.from === 0) {
      return false;
    }
    const exitLine = rootView.state.doc.lineAt(table.from - 1);
    controller.deactivate();
    rootView.dispatch({ selection: { anchor: exitLine.to }, scrollIntoView: true });
    return true;
  }

  /**
   * ArrowRight's own table-boundary exit: reuses `arrowDownCommand`'s own
   * established "table at EOF → create the missing trailing line" shape,
   * extended to also land on an already-existing following line rather
   * than declining — ArrowRight exiting the table must always succeed
   * from the last cell, unlike ArrowDown's own narrower "only when
   * genuinely nothing follows" carve-out.
   */
  function exitBelow(rootView: EditorView, table: SyntaxNode): boolean {
    const { state } = rootView;
    const tableEndLine = state.doc.lineAt(table.to).number;
    controller.deactivate();
    if (tableEndLine < state.doc.lines) {
      const nextLine = state.doc.line(tableEndLine + 1);
      rootView.dispatch({ selection: { anchor: nextLine.from }, scrollIntoView: true });
    } else {
      const insertPos = table.to;
      rootView.dispatch({
        changes: { from: insertPos, to: insertPos, insert: '\n' },
        selection: { anchor: insertPos + 1 },
        scrollIntoView: true,
      });
    }
    return true;
  }

  const arrowLeftCommand: Command = (nestedView) => moveOrExit(nestedView, -1);
  const arrowRightCommand: Command = (nestedView) => moveOrExit(nestedView, 1);

  /**
   * ArrowDown: same-column vertical movement, plus one narrow structural
   * exception ported from the deleted `tableArrowDownKeymap.ts` — from
   * the table's own last row, when the document genuinely has nothing
   * after the table at all, inserts a blank line after it and
   * deactivates (there is no cell below to move into; the destination is
   * now ordinary root-document text outside any table, so the active
   * cell relationship itself ends here rather than the nested editor
   * moving to a non-existent cell).
   */
  const arrowDownCommand: Command = () => {
    const rootView = getRootView();
    const anchor = controller.activeAnchor;
    if (!anchor) {
      return false;
    }
    const current = resolveLogicalCell(rootView.state, anchor.from);
    if (!current) {
      return false;
    }
    const target = resolveCellAt(current.table, current.rowIndex + 1, current.columnIndex);
    if (target) {
      const container = activeContainer(controller);
      if (!container) {
        return true;
      }
      const range = trimmedCellRange(rootView.state, target.bounds);
      controller.activate(rootView, container, range.from, range.to, range.from);
      return true;
    }

    const navigableRows = getNavigableRows(current.table);
    const lastRow = navigableRows[navigableRows.length - 1];
    if (!lastRow || current.row.from !== lastRow.from) {
      return false; // Unreachable given resolveCellAt already returned null for rowIndex+1, kept as an explicit guard for parity with the ported logic.
    }

    const { state } = rootView;
    const tableEndLine = state.doc.lineAt(current.table.to).number;
    if (tableEndLine < state.doc.lines) {
      return false; // Something (blank or not) already exists below the table — defer to native.
    }

    // Deactivate BEFORE dispatching — tableWidgetField's StateField.update()
    // runs synchronously inside this same dispatch call and must already
    // see no active cell, or it would rebuild this transaction's
    // decorations still showing the (about-to-be-abandoned) cell as
    // active (M5's own "activation must be visible to the same rebuild"
    // requirement, mirrored from remapActiveAnchor's own ordering rule).
    controller.deactivate();
    const insertPos = current.table.to;
    rootView.dispatch({
      changes: { from: insertPos, to: insertPos, insert: '\n' },
      selection: { anchor: insertPos + 1 },
      scrollIntoView: true,
    });
    return true;
  };

  /**
   * Enter: creates a new, empty row — same column count as the table's
   * own header, same column as the current cell — immediately after the
   * current row (or after the delimiter row, if fired in the header, so
   * the delimiter row stays the header's very next line per GFM). Ported
   * from the deleted `tableEnterKeymap.ts`; the new cell's real bounds
   * are re-resolved via `resolveLogicalCell` against the post-insert root
   * state rather than hand-computed, so this can't drift from what
   * `tableGeometry.ts` itself considers that cell's bounds to be.
   */
  const enterCommand: Command = () => {
    const rootView = getRootView();
    const anchor = controller.activeAnchor;
    if (!anchor) {
      return false;
    }
    const current = resolveLogicalCell(rootView.state, anchor.from);
    if (!current) {
      return false;
    }
    const header = current.table.firstChild;
    if (!header || header.name !== 'TableHeader') {
      return false;
    }
    const columnCount = getRowCellBounds(header).length;
    if (columnCount === 0) {
      return false;
    }
    const insertPos = insertRowAfterPosition(current.row);
    if (insertPos === null) {
      return false;
    }

    const insertText = '\n' + buildEmptyRowText(columnCount);
    const cursorPos = insertPos + 1 + emptyRowCellOffset(current.columnIndex);

    rootView.dispatch({ changes: { from: insertPos, to: insertPos, insert: insertText } });

    const container = activeContainer(controller);
    const newCell = resolveLogicalCell(rootView.state, cursorPos);
    if (container && newCell) {
      const range = trimmedCellRange(rootView.state, newCell.bounds);
      controller.activate(rootView, container, range.from, range.to, cursorPos);
    }
    return true;
  };

  const bindings: readonly KeyBinding[] = [
    { key: 'Tab', run: tabCommand },
    { key: 'Shift-Tab', run: shiftTabCommand },
    { key: 'Enter', run: enterCommand },
    { key: 'ArrowUp', run: arrowUpCommand },
    { key: 'ArrowDown', run: arrowDownCommand },
    { key: 'ArrowLeft', run: arrowLeftCommand },
    { key: 'ArrowRight', run: arrowRightCommand },
  ];

  return Prec.highest(keymap.of(bindings));
}
