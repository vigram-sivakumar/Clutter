// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { history, redo, undo, undoDepth } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { TableActiveCellController } from './tableActiveCellController';
import { findAllTables, findEnclosingTable } from './tableGeometry';
import { tableRootSelectionSnap } from './tableRootSelectionSnap';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { deleteRowSelection, tableSelectionDeletionHistory, tableSelectionDeletionKeymap } from './tableSelectionDeletion';
import { tableWidgetDecoration } from './tableWidgetField';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

function mountRootView(doc: string): { view: EditorView; controller: TableActiveCellController } {
  const controller = new TableActiveCellController();
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(0),
      extensions: [
        markdownLanguageExtension(),
        tableWidgetDecoration(controller),
        tableSelectionField,
        tableRootSelectionSnap(),
        tableSelectionDeletionKeymap(),
        tableSelectionDeletionHistory(),
        history(),
      ],
    }),
    parent,
  });
  mountedViews.push(view);
  return { view, controller };
}

function selectTable(view: EditorView, selection: TableSelection | null): void {
  view.dispatch({ effects: tableSelectionChanged.of(selection) });
}

function dispatchKey(view: EditorView, key: string): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

const THREE_COL = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | NYC |\n| Sam | Engineer | SF |\n| Ann | PM | LA |';

describe('tableSelectionDeletionKeymap — row deletion', () => {
  it('deletes the first body row (rowIndex 1) and selects the new first row (the adjacent one)', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('| Name | Role | City |\n| --- | --- | --- |\n| Sam | Engineer | SF |\n| Ann | PM | LA |');
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 1 });
  });

  it('deletes a middle body row (rowIndex 2) and selects the adjacent (next) row', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 2 });

    dispatchKey(view, 'Delete');

    expect(view.state.doc.toString()).toBe('| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | NYC |\n| Ann | PM | LA |');
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 2 });
  });

  it('deletes the last body row and selects the remaining (now-last) row', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 3 });

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | NYC |\n| Sam | Engineer | SF |');
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 2 });
  });

  it('deleting the only body row leaves a valid header+delimiter-only table and clears the selection', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |');
    expect(view.state.field(tableSelectionField)).toBeNull();
    const table = findAllTables(view.state)[0]!;
    expect(table.node.name).toBe('Table');
  });

  it('handles a ragged row (fewer cells than the header) correctly when deleted', () => {
    const doc = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer |\n| Sam | Engineer | SF |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('| Name | Role | City |\n| --- | --- | --- |\n| Sam | Engineer | SF |');
  });

  it('deletes a row with inline Markdown and empty cells intact elsewhere', () => {
    const doc = '| Name | Note |\n| --- | --- |\n| Vik | **bold** text |\n| Sam |  |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    dispatchKey(view, 'Delete');

    expect(view.state.doc.toString()).toBe('| Name | Note |\n| --- | --- |\n| Sam |  |');
  });

  it('does nothing when no TableSelection is active — ordinary Backspace/Delete unaffected', () => {
    const { view } = mountRootView(THREE_COL);
    // No table selection set.
    dispatchKey(view, 'Backspace');
    expect(view.state.doc.toString()).toBe(THREE_COL);
  });
});

describe('tableSelectionDeletionKeymap — header row deletion (promotion)', () => {
  it('deletes the header and promotes the first body row to take its place', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('| Vik | Designer | NYC |\n| --- | --- | --- |\n| Sam | Engineer | SF |\n| Ann | PM | LA |');
  });

  it('selects the promoted row at rowIndex 0 (the header\'s own slot)', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    dispatchKey(view, 'Delete');

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 0 });
  });

  it('preserves the alignment row exactly, unchanged', () => {
    const doc = '| Name | Role |\n| :-- | --: |\n| Vik | Designer |\n| Sam | Engineer |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('| Vik | Designer |\n| :-- | --: |\n| Sam | Engineer |');
  });

  it('promoting when only one body row exists leaves a valid header-only (zero-body-row) table', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('| Vik | Designer |\n| --- | --- |');
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 0 });
    const table = findAllTables(view.state)[0]!;
    expect(table.node.name).toBe('Table');
  });

  it('deleting the header when it is the table\'s only row (no body row to promote) deletes the whole table', () => {
    const doc = '| Name | Role |\n| --- | --- |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    dispatchKey(view, 'Delete');

    expect(view.state.doc.toString()).toBe('');
    expect(view.state.field(tableSelectionField)).toBeNull();
    expect(findEnclosingTable(view.state, 0)).toBeNull();
  });

  it('preserves ragged rows and escaped pipes elsewhere in the table', () => {
    const doc = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | NYC |\n| A \\| B |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('| Vik | Designer | NYC |\n| --- | --- | --- |\n| A \\| B |');
  });
});

describe('tableSelectionDeletionKeymap — column deletion', () => {
  it('deletes the first column and selects the adjacent (now-first) column', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe(
      '| Role | City |\n| --- | --- |\n| Designer | NYC |\n| Engineer | SF |\n| PM | LA |'
    );
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 0 });
  });

  it('deletes a middle column and preserves the remaining columns/alignment', () => {
    const doc = '| Name | Role | City |\n| :-- | :-: | --: |\n| Vik | Designer | NYC |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    dispatchKey(view, 'Delete');

    expect(view.state.doc.toString()).toBe('| Name | City |\n| :-- | --: |\n| Vik | NYC |');
  });

  it('deletes the last column and selects the remaining (now-last) column', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 2 });

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe(
      '| Name | Role |\n| --- | --- |\n| Vik | Designer |\n| Sam | Engineer |\n| Ann | PM |'
    );
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });
  });

  it('deleting a single-column table\'s only column deletes the whole table', () => {
    const doc = '| Name |\n| --- |\n| Vik |\n| Sam |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('');
    expect(view.state.field(tableSelectionField)).toBeNull();
    expect(findEnclosingTable(view.state, 0)).toBeNull();
  });

  it('preserves ragged rows shorter than the deleted column', () => {
    const doc = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer |\n| Sam | Engineer | SF |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 2 });

    dispatchKey(view, 'Delete');

    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| Vik | Designer |\n| Sam | Engineer |');
  });

  it('preserves escaped pipes in other cells', () => {
    const doc = '| A | B |\n| --- | --- |\n| x | a \\| b |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('| B |\n| --- |\n| a \\| b |');
  });

  it('preserves empty cells and inline Markdown when deleting a different column', () => {
    const doc = '| Name | Note | Extra |\n| --- | --- | --- |\n| Vik |  | **x** |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    dispatchKey(view, 'Delete');

    expect(view.state.doc.toString()).toBe('| Note | Extra |\n| --- | --- |\n|  | **x** |');
  });
});

describe('tableSelectionDeletionKeymap — root selection never lands inside the table', () => {
  it('after row deletion, the root selection resolves outside the table', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 3 });

    dispatchKey(view, 'Backspace');

    expect(findEnclosingTable(view.state, view.state.selection.main.head)).toBeNull();
  });

  it('after column deletion, the root selection resolves outside the table', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    dispatchKey(view, 'Delete');

    expect(findEnclosingTable(view.state, view.state.selection.main.head)).toBeNull();
  });
});

describe('tableSelectionDeletionKeymap — undo/redo', () => {
  it('undo restores a deleted row; redo restores the deletion, as one ordinary transaction', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });
    const depthBefore = undoDepth(view.state);

    dispatchKey(view, 'Backspace');
    expect(view.state.doc.toString()).not.toBe(THREE_COL);
    expect(undoDepth(view.state)).toBe(depthBefore + 1);

    undo(view);
    expect(view.state.doc.toString()).toBe(THREE_COL);

    redo(view);
    expect(view.state.doc.toString()).not.toBe(THREE_COL);
  });

  it('undo restores a deleted column; redo restores the deletion', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    dispatchKey(view, 'Delete');
    expect(view.state.doc.toString()).not.toBe(THREE_COL);

    undo(view);
    expect(view.state.doc.toString()).toBe(THREE_COL);

    redo(view);
    expect(view.state.doc.toString()).not.toBe(THREE_COL);
  });
});

describe('tableSelectionDeletionKeymap — undo/redo restores TableSelection as part of the same action', () => {
  it('row middle: undo restores the deleted row and re-selects it; redo restores the post-delete (adjacent) selection', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 2 }); // Sam

    dispatchKey(view, 'Delete');
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 2 }); // Ann, adjacent

    undo(view);
    expect(view.state.doc.toString()).toBe(THREE_COL);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 2 }); // Sam, restored
    expect(view.dom.querySelector('.cm-table-row-selected')?.textContent).toContain('Sam');

    redo(view);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 2 }); // Ann again
    expect(view.dom.querySelector('.cm-table-row-selected')?.textContent).toContain('Ann');
  });

  it('row last: undo restores the deleted row and re-selects it; redo restores the post-delete (remaining) selection', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 3 }); // Ann

    dispatchKey(view, 'Backspace');
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 2 }); // Sam, remaining

    undo(view);
    expect(view.state.doc.toString()).toBe(THREE_COL);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 3 }); // Ann, restored
    expect(view.dom.querySelector('.cm-table-row-selected')?.textContent).toContain('Ann');

    redo(view);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 2 }); // Sam again
    expect(view.dom.querySelector('.cm-table-row-selected')?.textContent).toContain('Sam');
  });

  it('column middle: undo restores the deleted column and re-selects it; redo restores the post-delete (adjacent) selection', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 }); // Role

    dispatchKey(view, 'Backspace');
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 }); // City, adjacent

    undo(view);
    expect(view.state.doc.toString()).toBe(THREE_COL);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 }); // Role, restored
    expect(view.dom.querySelector('.cm-table-column-selected')?.textContent).toBe('Role');

    redo(view);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 }); // City again
    expect(view.dom.querySelector('.cm-table-column-selected')?.textContent).toBe('City');
  });

  it('column last: undo restores the deleted column and re-selects it; redo restores the post-delete (remaining) selection', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 2 }); // City

    dispatchKey(view, 'Delete');
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 }); // Role, remaining

    undo(view);
    expect(view.state.doc.toString()).toBe(THREE_COL);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 2 }); // City, restored
    expect(view.dom.querySelector('.cm-table-column-selected')?.textContent).toBe('City');

    redo(view);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 }); // Role again
    expect(view.dom.querySelector('.cm-table-column-selected')?.textContent).toBe('Role');
  });

  it('single body row: undo after deleting the only row restores it and re-selects it', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    dispatchKey(view, 'Backspace');
    expect(view.state.field(tableSelectionField)).toBeNull(); // no body rows left

    undo(view);
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 1 });

    redo(view);
    expect(view.state.field(tableSelectionField)).toBeNull();
  });

  it('single-column table: undo after deleting the whole table restores it and re-selects the column', () => {
    const doc = '| Name |\n| --- |\n| Vik |\n| Sam |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    dispatchKey(view, 'Backspace');
    expect(view.state.doc.toString()).toBe('');
    expect(view.state.field(tableSelectionField)).toBeNull();

    undo(view);
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 0 });

    redo(view);
    expect(view.state.doc.toString()).toBe('');
    expect(view.state.field(tableSelectionField)).toBeNull();
  });

  it('a plain handle-click selection change (no document change) still never enters undo history', () => {
    const { view } = mountRootView(THREE_COL);
    const depthBefore = undoDepth(view.state);

    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });
    selectTable(view, null);

    expect(undoDepth(view.state)).toBe(depthBefore);
  });

  it('header promotion: undo restores the exact original document and re-selects the header; redo restores the promotion', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });
    const depthBefore = undoDepth(view.state);

    dispatchKey(view, 'Backspace');
    const afterDelete = view.state.doc.toString();
    expect(afterDelete).not.toBe(THREE_COL);
    expect(undoDepth(view.state)).toBe(depthBefore + 1);

    undo(view);
    expect(view.state.doc.toString()).toBe(THREE_COL);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 0 });

    redo(view);
    expect(view.state.doc.toString()).toBe(afterDelete);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 0 });
  });

  it('header deletion with no body row to promote: undo restores the whole table and re-selects the header', () => {
    const doc = '| Name | Role |\n| --- | --- |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    dispatchKey(view, 'Backspace');
    expect(view.state.doc.toString()).toBe('');

    undo(view);
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 0 });

    redo(view);
    expect(view.state.doc.toString()).toBe('');
    expect(view.state.field(tableSelectionField)).toBeNull();
  });
});

describe('deleteRowSelection — the menu-facing entry point', () => {
  it('deletes the selected body row when called directly, outside the keymap', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    const handled = deleteRowSelection(view, view.state.field(tableSelectionField)!);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('| Name | Role | City |\n| --- | --- | --- |\n| Sam | Engineer | SF |\n| Ann | PM | LA |');
  });

  it('promotes the first body row when the header is selected', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    deleteRowSelection(view, view.state.field(tableSelectionField)!);

    expect(view.state.doc.toString()).toBe('| Vik | Designer | NYC |\n| --- | --- | --- |\n| Sam | Engineer | SF |\n| Ann | PM | LA |');
  });

  it('is a no-op for a column selection', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    const handled = deleteRowSelection(view, view.state.field(tableSelectionField)!);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(THREE_COL);
  });

  it('is a no-op for a range selection', () => {
    const { view } = mountRootView(THREE_COL);
    const selection: TableSelection = { kind: 'range', tableFrom: 0, anchor: { row: 1, col: 0 }, head: { row: 2, col: 1 } };

    const handled = deleteRowSelection(view, selection);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(THREE_COL);
  });

  it('is a no-op when the table can no longer be found at tableFrom', () => {
    const { view } = mountRootView(THREE_COL);
    const stale: TableSelection = { kind: 'row', tableFrom: 999, rowIndex: 1 };

    expect(deleteRowSelection(view, stale)).toBe(false);
    expect(view.state.doc.toString()).toBe(THREE_COL);
  });
});
