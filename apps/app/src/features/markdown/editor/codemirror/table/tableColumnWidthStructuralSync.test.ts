// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { history, redo, undo } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { findAllTables } from './tableGeometry';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { tableSelectionDeletionHistory, deleteColumnSelection, deleteRowSelection } from './tableSelectionDeletion';
import { duplicateSelectedColumn, insertColumnLeftSelection, insertColumnRightSelection } from './tableColumnInsertion';
import { moveSelectedColumnLeft, moveSelectedColumnRight } from './tableRowColumnMove';
import { insertRowAboveSelection, insertRowBelowSelection, duplicateSelectedRow } from './tableRowInsertion';
import { resolveTableColumnWidths } from './tableColumnWidthMetadata';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

function mountRootView(doc: string): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(0),
      extensions: [markdownLanguageExtension(), tableSelectionField, tableSelectionDeletionHistory(), history()],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
  mountedViews.push(view);
  return view;
}

function selectTable(view: EditorView, selection: TableSelection | null): void {
  view.dispatch({ effects: tableSelectionChanged.of(selection) });
}

function widthsOf(view: EditorView): readonly number[] | null {
  const table = findAllTables(view.state)[0];
  if (!table) {
    return null;
  }
  return resolveTableColumnWidths(view.state, table)?.widths ?? null;
}

const THREE_COL_WITH_WIDTHS =
  '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | NYC |\n| Sam | Engineer | SF |\n{table-col-widths="120,80,240"}';
const THREE_COL_NO_WIDTHS = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | NYC |\n| Sam | Engineer | SF |';

describe('insert column — width metadata sync', () => {
  it('inserts the default width before the selected column, at the correct index', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    insertColumnLeftSelection(view, view.state.field(tableSelectionField)!);

    expect(widthsOf(view)).toEqual([120, 200, 80, 240]);
  });

  it('inserts the default width after the selected column, at the correct index', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    insertColumnRightSelection(view, view.state.field(tableSelectionField)!);

    expect(widthsOf(view)).toEqual([120, 80, 200, 240]);
  });

  it('never inherits the selected column\'s own width — always the flat default', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    // Column 2 has width 240 — confirm the inserted column is 200, not 240.
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 2 });

    insertColumnRightSelection(view, view.state.field(tableSelectionField)!);

    expect(widthsOf(view)).toEqual([120, 80, 240, 200]);
  });

  it('leaves a table with no metadata still without metadata after insertion', () => {
    const view = mountRootView(THREE_COL_NO_WIDTHS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    const handled = insertColumnLeftSelection(view, view.state.field(tableSelectionField)!);

    expect(handled).toBe(true);
    expect(widthsOf(view)).toBeNull();
    expect(view.state.doc.toString()).not.toContain('table-col-widths');
  });

  it('serializes the updated attribute exactly, matching the structural column edit in the same transaction', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    insertColumnRightSelection(view, view.state.field(tableSelectionField)!);

    const lines = view.state.doc.toString().split('\n');
    expect(lines[lines.length - 1]).toBe('{table-col-widths="120,200,80,240"}');
  });

  it('undoes both the structural insert and the width metadata change as one step', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    insertColumnLeftSelection(view, view.state.field(tableSelectionField)!);
    expect(widthsOf(view)).toEqual([120, 200, 80, 240]);

    undo(view);
    expect(view.state.doc.toString()).toBe(THREE_COL_WITH_WIDTHS);
    expect(widthsOf(view)).toEqual([120, 80, 240]);

    redo(view);
    expect(widthsOf(view)).toEqual([120, 200, 80, 240]);
  });
});

describe('duplicate column — width metadata sync', () => {
  it('copies the source column\'s own width into the duplicate, at the correct index', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    duplicateSelectedColumn(view, view.state.field(tableSelectionField)!);

    expect(widthsOf(view)).toEqual([120, 80, 80, 240]);
  });

  it('leaves a table with no metadata still without metadata after duplication', () => {
    const view = mountRootView(THREE_COL_NO_WIDTHS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    duplicateSelectedColumn(view, view.state.field(tableSelectionField)!);

    expect(widthsOf(view)).toBeNull();
  });

  it('undoes both the duplicated column and its width metadata as one step', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    duplicateSelectedColumn(view, view.state.field(tableSelectionField)!);
    expect(widthsOf(view)).toEqual([120, 80, 80, 240]);

    undo(view);
    expect(widthsOf(view)).toEqual([120, 80, 240]);

    redo(view);
    expect(widthsOf(view)).toEqual([120, 80, 80, 240]);
  });
});

describe('move column — width metadata sync', () => {
  it('moves the corresponding width left along with the column', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 2 });

    moveSelectedColumnLeft(view, view.state.field(tableSelectionField)!);

    expect(widthsOf(view)).toEqual([120, 240, 80]);
  });

  it('moves the corresponding width right along with the column', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    moveSelectedColumnRight(view, view.state.field(tableSelectionField)!);

    expect(widthsOf(view)).toEqual([80, 120, 240]);
  });

  it('leaves a table with no metadata still without metadata after a move', () => {
    const view = mountRootView(THREE_COL_NO_WIDTHS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 2 });

    moveSelectedColumnLeft(view, view.state.field(tableSelectionField)!);

    expect(widthsOf(view)).toBeNull();
  });

  it('undoes both the column move and its width metadata as one step', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 2 });

    moveSelectedColumnLeft(view, view.state.field(tableSelectionField)!);
    expect(widthsOf(view)).toEqual([120, 240, 80]);

    undo(view);
    expect(widthsOf(view)).toEqual([120, 80, 240]);

    redo(view);
    expect(widthsOf(view)).toEqual([120, 240, 80]);
  });
});

describe('delete column — width metadata sync', () => {
  it('removes the first column\'s own width', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    deleteColumnSelection(view, view.state.field(tableSelectionField)!);

    expect(widthsOf(view)).toEqual([80, 240]);
  });

  it('removes the middle column\'s own width', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    deleteColumnSelection(view, view.state.field(tableSelectionField)!);

    expect(widthsOf(view)).toEqual([120, 240]);
  });

  it('removes the last column\'s own width', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 2 });

    deleteColumnSelection(view, view.state.field(tableSelectionField)!);

    expect(widthsOf(view)).toEqual([120, 80]);
  });

  it('deletes the whole table, including its width metadata line, when deleting the only column', () => {
    const doc = '| Name |\n| --- |\n| Vik |\n{table-col-widths="120"}';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    const handled = deleteColumnSelection(view, view.state.field(tableSelectionField)!);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('');
    expect(findAllTables(view.state)).toHaveLength(0);
  });

  it('leaves a table with no metadata still without metadata after a column delete', () => {
    const view = mountRootView(THREE_COL_NO_WIDTHS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    deleteColumnSelection(view, view.state.field(tableSelectionField)!);

    expect(widthsOf(view)).toBeNull();
  });

  it('undoes both the column deletion and its width metadata restoration as one step', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    deleteColumnSelection(view, view.state.field(tableSelectionField)!);
    expect(widthsOf(view)).toEqual([120, 240]);

    undo(view);
    expect(view.state.doc.toString()).toBe(THREE_COL_WITH_WIDTHS);
    expect(widthsOf(view)).toEqual([120, 80, 240]);

    redo(view);
    expect(widthsOf(view)).toEqual([120, 240]);
  });

  it('undoes deleting the only column, restoring both the table and its width metadata as one step', () => {
    const doc = '| Name |\n| --- |\n| Vik |\n{table-col-widths="120"}';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    deleteColumnSelection(view, view.state.field(tableSelectionField)!);
    expect(view.state.doc.toString()).toBe('');

    undo(view);
    expect(view.state.doc.toString()).toBe(doc);
    expect(widthsOf(view)).toEqual([120]);
  });
});

describe('row operations leave column-width metadata unchanged', () => {
  it('insert row above does not modify width metadata', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    const handled = insertRowAboveSelection(view, view.state.field(tableSelectionField)!);

    expect(handled).toBe(true);
    expect(widthsOf(view)).toEqual([120, 80, 240]);
  });

  it('insert row below does not modify width metadata', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    insertRowBelowSelection(view, view.state.field(tableSelectionField)!);

    expect(widthsOf(view)).toEqual([120, 80, 240]);
  });

  it('duplicate row does not modify width metadata', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    duplicateSelectedRow(view, view.state.field(tableSelectionField)!);

    expect(widthsOf(view)).toEqual([120, 80, 240]);
  });

  it('delete row does not modify width metadata', () => {
    const view = mountRootView(THREE_COL_WITH_WIDTHS);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    const handled = deleteRowSelection(view, view.state.field(tableSelectionField)!);

    expect(handled).toBe(true);
    expect(widthsOf(view)).toEqual([120, 80, 240]);
  });
});
