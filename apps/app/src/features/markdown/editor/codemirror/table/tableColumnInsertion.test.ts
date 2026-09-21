// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { history, redo, undo, undoDepth } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { tableSelectionDeletionHistory } from './tableSelectionDeletion';
import { duplicateSelectedColumn, insertColumnLeftSelection, insertColumnRightSelection } from './tableColumnInsertion';

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

const FOUR_COL = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | Delhi |\n| Alex | Engineer | Pune |';

describe('duplicateSelectedColumn', () => {
  it('duplicates the first column immediately to its right, keeping the original selected', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 }); // Name

    const handled = duplicateSelectedColumn(view, view.state.field(tableSelectionField)!);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe(
      ['| Name | Name | Role |', '| --- | --- | --- |', '| Vik | Vik | Designer |', '| Sam | Sam | Engineer |'].join('\n')
    );
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 0 });
  });

  it('duplicates a middle column immediately to its right, keeping the original selected', () => {
    const view = mountRootView(FOUR_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 }); // Role

    duplicateSelectedColumn(view, view.state.field(tableSelectionField)!);

    expect(view.state.doc.toString()).toBe(
      [
        '| Name | Role | Role | City |',
        '| --- | --- | --- | --- |',
        '| Vik | Designer | Designer | Delhi |',
        '| Alex | Engineer | Engineer | Pune |',
      ].join('\n')
    );
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });
  });

  it('duplicates the last column immediately to its right, keeping the original selected', () => {
    const view = mountRootView(THREE_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 2 }); // City

    duplicateSelectedColumn(view, view.state.field(tableSelectionField)!);

    expect(view.state.doc.toString()).toBe(
      ['| Name | Role | City | City |', '| --- | --- | --- | --- |', '| Vik | Designer | NYC | NYC |', '| Sam | Engineer | SF | SF |'].join('\n')
    );
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 2 });
  });

  it('duplicates the only column of a table', () => {
    const view = mountRootView('| Name |\n| --- |\n| Vik |');
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    duplicateSelectedColumn(view, view.state.field(tableSelectionField)!);

    expect(view.state.doc.toString()).toBe('| Name | Name |\n| --- | --- |\n| Vik | Vik |');
  });

  it('duplicates a column containing empty cells', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| Vik |  |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    duplicateSelectedColumn(view, view.state.field(tableSelectionField)!);

    const lastLine = view.state.doc.toString().split('\n')[2]!;
    const cells = lastLine.split('|').slice(1, -1).map((s) => s.trim());
    expect(cells).toEqual(['Vik', '', '']);
  });

  it('duplicates a column containing Markdown formatting verbatim', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| Vik | **Designer** |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    duplicateSelectedColumn(view, view.state.field(tableSelectionField)!);

    expect(view.state.doc.toString()).toContain('| **Designer** | **Designer** |');
  });

  it('preserves the original column\'s own alignment marker on the duplicate', () => {
    const doc = '| Name | Role |\n| :-- | --: |\n| Vik | Designer |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 }); // Role, right-aligned

    duplicateSelectedColumn(view, view.state.field(tableSelectionField)!);

    expect(view.state.doc.toString()).toBe('| Name | Role | Role |\n| :-- | --: | --: |\n| Vik | Designer | Designer |');
  });

  it('preserves the header cell\'s own text on the duplicate', () => {
    const view = mountRootView(THREE_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    duplicateSelectedColumn(view, view.state.field(tableSelectionField)!);

    expect(view.state.doc.toString().split('\n')[0]).toBe('| Name | Name | Role | City |');
  });

  it('a ragged row without a real column at the selected index is left untouched by this operation, and the rectangular-table invariant still holds afterward', () => {
    const doc = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | NYC |\n| Solo |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 }); // Role

    duplicateSelectedColumn(view, view.state.field(tableSelectionField)!);

    // "Solo" is untouched by this operation itself...
    const lines = view.state.doc.toString().split('\n');
    expect(lines[0]).toBe('| Name | Role | Role | City |');
    // ...but the already-installed rectangular-table invariant filter
    // (`tableRectangularNormalization.ts`) is a *separate* extension not
    // installed in this bare test harness — this test only asserts what
    // `duplicateSelectedColumn` itself is responsible for.
    expect(lines[3]).toBe('| Solo |');
  });

  it('undo/redo restores document and selection coherently', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });
    const before = view.state.doc.toString();

    duplicateSelectedColumn(view, view.state.field(tableSelectionField)!);
    expect(undoDepth(view.state)).toBe(1);

    undo(view);
    expect(view.state.doc.toString()).toBe(before);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });

    redo(view);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });
  });

  it('returns false (no-op) for a non-column selection', () => {
    const view = mountRootView(TWO_COL);
    const before = view.state.doc.toString();

    const handled = duplicateSelectedColumn(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(before);
  });
});
