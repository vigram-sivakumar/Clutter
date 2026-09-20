// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { history, redo, undo, undoDepth } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { tableSelectionDeletionHistory } from './tableSelectionDeletion';
import { insertRowAboveSelection, insertRowBelowSelection } from './tableRowInsertion';

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

const NAR = '| Name | Age | Role |\n| --- | --- | --- |\n| Bob | 30 | UX |\n| Ann | 28 | Dev |';
const TWO_COL = '| Name | Role |\n| --- | --- |\n| Vik | Designer |\n| Sam | Engineer |';

describe('insertRowAboveSelection — body rows', () => {
  it('inserts an empty row immediately above the first body row', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 }); // Vik row

    const handled = insertRowAboveSelection(view, view.state.field(tableSelectionField)!);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| | |\n| Vik | Designer |\n| Sam | Engineer |');
  });

  it('inserts above a middle body row', () => {
    const view = mountRootView(NAR);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 2 }); // Ann row

    insertRowAboveSelection(view, view.state.field(tableSelectionField)!);

    expect(view.state.doc.toString()).toBe(
      '| Name | Age | Role |\n| --- | --- | --- |\n| Bob | 30 | UX |\n| | | |\n| Ann | 28 | Dev |'
    );
  });

  it('inserts above the last body row', () => {
    const view = mountRootView(NAR);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 2 }); // Ann row (last)

    insertRowAboveSelection(view, view.state.field(tableSelectionField)!);

    expect(view.state.doc.toString()).toBe(
      '| Name | Age | Role |\n| --- | --- | --- |\n| Bob | 30 | UX |\n| | | |\n| Ann | 28 | Dev |'
    );
  });

  it('selects the newly inserted row, at the same rowIndex the selection was already at', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    insertRowAboveSelection(view, view.state.field(tableSelectionField)!);

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 1 });
  });

  it('preserves column count and alignment', () => {
    const doc = '| Name | Role |\n| :-- | --: |\n| Vik | Designer |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    insertRowAboveSelection(view, view.state.field(tableSelectionField)!);

    expect(view.state.doc.toString()).toBe('| Name | Role |\n| :-- | --: |\n| | |\n| Vik | Designer |');
  });

  it('preserves ragged rows and escaped pipes elsewhere in the table', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| A \\| B | Eng |\n| Solo |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 }); // "A \| B" row

    insertRowAboveSelection(view, view.state.field(tableSelectionField)!);

    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| | |\n| A \\| B | Eng |\n| Solo |');
  });
});

describe('insertRowAboveSelection — header promotion', () => {
  it('inserting above the header makes the new row the header and demotes the old header to the first body row', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    const handled = insertRowAboveSelection(view, view.state.field(tableSelectionField)!);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe(
      '| | |\n| --- | --- |\n| Name | Role |\n| Vik | Designer |\n| Sam | Engineer |'
    );
  });

  it('selects the new header (rowIndex 0) after promotion', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    insertRowAboveSelection(view, view.state.field(tableSelectionField)!);

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 0 });
  });
});

describe('insertRowBelowSelection — body rows', () => {
  it('inserts an empty row immediately below the first body row', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 }); // Vik row

    const handled = insertRowBelowSelection(view, view.state.field(tableSelectionField)!);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| Vik | Designer |\n| | |\n| Sam | Engineer |');
  });

  it('inserts below the last body row', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 2 }); // Sam row (last)

    insertRowBelowSelection(view, view.state.field(tableSelectionField)!);

    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| Vik | Designer |\n| Sam | Engineer |\n| | |');
  });

  it('selects the newly inserted row, at rowIndex + 1', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    insertRowBelowSelection(view, view.state.field(tableSelectionField)!);

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 2 });
  });
});

describe('insertRowBelowSelection — header', () => {
  it('keeps the existing header unchanged and inserts a new body row immediately below it', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    const handled = insertRowBelowSelection(view, view.state.field(tableSelectionField)!);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| | |\n| Vik | Designer |\n| Sam | Engineer |');
  });

  it('selects the new body row (rowIndex 1), not the header', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    insertRowBelowSelection(view, view.state.field(tableSelectionField)!);

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 1 });
  });
});

describe('insertRowAboveSelection / insertRowBelowSelection — guards', () => {
  it('is a no-op for a column selection', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    const handledAbove = insertRowAboveSelection(view, view.state.field(tableSelectionField)!);
    const handledBelow = insertRowBelowSelection(view, view.state.field(tableSelectionField)!);

    expect(handledAbove).toBe(false);
    expect(handledBelow).toBe(false);
    expect(view.state.doc.toString()).toBe(TWO_COL);
  });

  it('is a no-op when the table can no longer be found at tableFrom', () => {
    const view = mountRootView(TWO_COL);
    const stale: TableSelection = { kind: 'row', tableFrom: 999, rowIndex: 1 };

    expect(insertRowAboveSelection(view, stale)).toBe(false);
    expect(insertRowBelowSelection(view, stale)).toBe(false);
    expect(view.state.doc.toString()).toBe(TWO_COL);
  });
});

describe('insertRowAboveSelection / insertRowBelowSelection — undo/redo', () => {
  it('undo restores the exact previous document and selection; redo re-applies the insertion', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });
    const depthBefore = undoDepth(view.state);

    insertRowAboveSelection(view, view.state.field(tableSelectionField)!);
    expect(view.state.doc.toString()).not.toBe(TWO_COL);
    expect(undoDepth(view.state)).toBe(depthBefore + 1);

    undo(view);
    expect(view.state.doc.toString()).toBe(TWO_COL);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 1 });

    redo(view);
    expect(view.state.doc.toString()).not.toBe(TWO_COL);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 1 });
  });

  it('undo/redo around header promotion restores the exact document and selection on both sides', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    insertRowAboveSelection(view, view.state.field(tableSelectionField)!);
    const afterInsert = view.state.doc.toString();

    undo(view);
    expect(view.state.doc.toString()).toBe(TWO_COL);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 0 });

    redo(view);
    expect(view.state.doc.toString()).toBe(afterInsert);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 0 });
  });

  it('undo restores the pre-insertion selection for insert-below too', () => {
    const view = mountRootView(TWO_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    insertRowBelowSelection(view, view.state.field(tableSelectionField)!);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 2 });

    undo(view);
    expect(view.state.doc.toString()).toBe(TWO_COL);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 1 });

    redo(view);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 2 });
  });
});
