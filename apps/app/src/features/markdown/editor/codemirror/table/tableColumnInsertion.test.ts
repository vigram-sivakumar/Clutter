// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { history, redo, undo, undoDepth } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { tableSelectionDeletionHistory } from './tableSelectionDeletion';
import { insertColumnLeftSelection, insertColumnRightSelection } from './tableColumnInsertion';

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

const TWO_COL = '| Name | Role |\n| --- | --- |\n| Vik | Designer |\n| Sam | Engineer |';
const THREE_COL = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | NYC |\n| Sam | Engineer | SF |';

describe('insertColumnLeftSelection', () => {
  it('inserts an empty column immediately left of the first column, in every row including the header', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    const handled = insertColumnLeftSelection(view, view.state.field(tableSelectionField)!);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe(
      ['| | Name | Role |', '| --- | --- | --- |', '| | Vik | Designer |', '| | Sam | Engineer |'].join('\n')
    );
  });

  it('selects the newly inserted column, at the same columnIndex the selection was already at', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    insertColumnLeftSelection(view, view.state.field(tableSelectionField)!);

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 0 });
  });

  it('preserves alignment markers on every existing column, and gives the new column a plain (unaligned) marker', () => {
    const doc = '| Name | Role |\n| :-- | --: |\n| Vik | Designer |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    insertColumnLeftSelection(view, view.state.field(tableSelectionField)!);

    expect(view.state.doc.toString()).toBe('| Name | | Role |\n| :-- | --- | --: |\n| Vik | | Designer |');
  });

  it('preserves escaped pipe content in cells not being touched', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| A \\| B | Eng |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    insertColumnLeftSelection(view, view.state.field(tableSelectionField)!);

    expect(view.state.doc.toString()).toBe('| | Name | Role |\n| --- | --- | --- |\n| | A \\| B | Eng |');
  });

  it('a ragged row without a real column at the selected index is left untouched', () => {
    const doc = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | NYC |\n| Solo |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 }); // Role

    insertColumnLeftSelection(view, view.state.field(tableSelectionField)!);

    expect(view.state.doc.toString()).toBe(
      ['| Name | | Role | City |', '| --- | --- | --- | --- |', '| Vik | | Designer | NYC |', '| Solo |'].join('\n')
    );
  });

  it('is a no-op for a row selection', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    const handled = insertColumnLeftSelection(view, view.state.field(tableSelectionField)!);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(TWO_COL);
  });

  it('is a no-op when the table can no longer be found at tableFrom', () => {
    const view = mountRootView(TWO_COL);
    const stale: TableSelection = { kind: 'column', tableFrom: 999, columnIndex: 0 };

    expect(insertColumnLeftSelection(view, stale)).toBe(false);
    expect(view.state.doc.toString()).toBe(TWO_COL);
  });
});

describe('insertColumnRightSelection', () => {
  it('inserts an empty column immediately right of the first column', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    const handled = insertColumnRightSelection(view, view.state.field(tableSelectionField)!);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe(
      ['| Name | | Role |', '| --- | --- | --- |', '| Vik | | Designer |', '| Sam | | Engineer |'].join('\n')
    );
  });

  it('inserts a middle column, between two existing ones in a three-column table', () => {
    const view = mountRootView(THREE_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 }); // Name

    insertColumnRightSelection(view, view.state.field(tableSelectionField)!);

    expect(view.state.doc.toString()).toBe(
      ['| Name | | Role | City |', '| --- | --- | --- | --- |', '| Vik | | Designer | NYC |', '| Sam | | Engineer | SF |'].join('\n')
    );
  });

  it('inserts a new last column, after the last existing one', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 }); // Role (last)

    const handled = insertColumnRightSelection(view, view.state.field(tableSelectionField)!);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe(
      ['| Name | Role | |', '| --- | --- | --- |', '| Vik | Designer | |', '| Sam | Engineer | |'].join('\n')
    );
  });

  it('selects the newly inserted column, at columnIndex + 1', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    insertColumnRightSelection(view, view.state.field(tableSelectionField)!);

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });
  });

  it('is a no-op for a row selection', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    expect(insertColumnRightSelection(view, view.state.field(tableSelectionField)!)).toBe(false);
    expect(view.state.doc.toString()).toBe(TWO_COL);
  });
});

describe('insertColumnLeftSelection / insertColumnRightSelection — undo/redo', () => {
  it('undo restores the exact previous document and selection; redo re-applies the insertion', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });
    const depthBefore = undoDepth(view.state);

    insertColumnLeftSelection(view, view.state.field(tableSelectionField)!);
    expect(view.state.doc.toString()).not.toBe(TWO_COL);
    expect(undoDepth(view.state)).toBe(depthBefore + 1);

    undo(view);
    expect(view.state.doc.toString()).toBe(TWO_COL);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 0 });

    redo(view);
    expect(view.state.doc.toString()).not.toBe(TWO_COL);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 0 });
  });

  it('undo restores the pre-insertion selection for insert-right too', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    insertColumnRightSelection(view, view.state.field(tableSelectionField)!);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });

    undo(view);
    expect(view.state.doc.toString()).toBe(TWO_COL);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 0 });

    redo(view);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });
  });
});
