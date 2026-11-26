import { Prec, type Extension } from '@codemirror/state';
import { keymap, type Command, type EditorView, type KeyBinding } from '@codemirror/view';
import { tableCellEditor } from '../table-engine/tableCellEditor';
import { projectableTableSnapshot } from '../table-engine/tableModel';
import { findAllTables, type TableInfo } from './tableGeometry';
import { tableDeletionSelectionField } from './tableDeletionSelection';

function enterCellOf(view: EditorView, table: TableInfo, row: number, col: number, cursorAt: 'start' | 'end'): boolean {
  return view.plugin(tableCellEditor)?.enterCell(table.from, { row, col }, cursorAt) ?? false;
}

function lastCell(table: TableInfo, view: EditorView): { rowIndex: number; columnIndex: number } | null {
  const snapshot = projectableTableSnapshot(view.state.doc.toString(), table.node);
  return snapshot ? { rowIndex: snapshot.model.rows.length, columnIndex: snapshot.model.header.length - 1 } : null;
}

/** Arrow keys enter a projected table only from its adjacent root line. */
export function tableBoundaryNavigation(): Extension {
  const lastVisibleLine = (view: EditorView, table: TableInfo): number =>
    view.state.doc.lineAt(table.to).number;
  const arrowDown: Command = (view) => {
    const sel = view.state.selection.main;
    if (!sel.empty) {
      return false;
    }
    const line = view.state.doc.lineAt(sel.head);
    for (const table of findAllTables(view.state)) {
      if (view.state.doc.lineAt(table.from).number === line.number + 1) {
        return enterCellOf(view, table, 0, 0, 'start');
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
      if (lastVisibleLine(view, table) === line.number - 1) {
        const target = lastCell(table, view);
        return target ? enterCellOf(view, table, target.rowIndex, 0, 'start') : false;
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
        return enterCellOf(view, table, 0, 0, 'start');
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
      if (lastVisibleLine(view, table) === line.number - 1) {
        const target = lastCell(table, view);
        if (!target) {
          return false;
        }
        return enterCellOf(view, table, target.rowIndex, target.columnIndex, 'end');
      }
    }
    return false;
  };

  const enterSelectedTable: Command = view => {
    if (view.state.readOnly) return false;
    const sel = view.state.selection.main;
    const armed = view.state.field(tableDeletionSelectionField, false) ?? null;
    for (const table of findAllTables(view.state)) {
      const snapshot = projectableTableSnapshot(view.state.doc.toString(), table.node);
      if (!snapshot) continue;
      if ((!sel.empty && sel.from === snapshot.from && sel.to === snapshot.to) ||
          (sel.empty && armed === snapshot.from)) {
        return enterCellOf(view, table, 0, 0, 'start');
      }
    }
    return false;
  };

  const bindings: readonly KeyBinding[] = [
    { key: 'Enter', run: enterSelectedTable },
    { key: 'ArrowDown', run: arrowDown },
    { key: 'ArrowUp', run: arrowUp },
    { key: 'ArrowRight', run: arrowRight },
    { key: 'ArrowLeft', run: arrowLeft },
  ];

  return Prec.highest(keymap.of(bindings));
}
