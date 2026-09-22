// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { history, redo, undo, undoDepth } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { tableSelectionDeletionHistory } from './tableSelectionDeletion';
import {
  columnMoveAvailability,
  moveSelectedColumnLeft,
  moveSelectedColumnRight,
  moveSelectedRowDown,
  moveSelectedRowUp,
  resolveColumnMoveAvailability,
  resolveRowMoveAvailability,
  rowMoveAvailability,
} from './tableRowColumnMove';

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

function currentSelection(view: EditorView): TableSelection | null {
  return view.state.field(tableSelectionField);
}

const THREE_ROWS = '| Name | Role |\n| --- | --- |\n| Vik | Designer |\n| Alex | Engineer |\n| Sam | PM |';
const SINGLE_BODY_ROW = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';
const THREE_COLS = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | NYC |\n| Sam | Engineer | SF |';

// ---------------------------------------------------------------------------
// rowMoveAvailability / columnMoveAvailability — pure boundary logic
// ---------------------------------------------------------------------------

describe('rowMoveAvailability', () => {
  it('the header (rowIndex 0) cannot move up (it is already the first row), but can move down', () => {
    expect(rowMoveAvailability(4, 0)).toEqual({ canMoveUp: false, canMoveDown: true });
  });

  it('the first body row can move up (into the header slot) and down', () => {
    expect(rowMoveAvailability(4, 1)).toEqual({ canMoveUp: true, canMoveDown: true });
  });

  it('a middle body row can move both up and down', () => {
    expect(rowMoveAvailability(4, 2)).toEqual({ canMoveUp: true, canMoveDown: true });
  });

  it('the last row can move up, but not down', () => {
    expect(rowMoveAvailability(4, 3)).toEqual({ canMoveUp: true, canMoveDown: false });
  });

  it('a single-row table (header only) can move neither up nor down', () => {
    expect(rowMoveAvailability(1, 0)).toEqual({ canMoveUp: false, canMoveDown: false });
  });
});

describe('columnMoveAvailability', () => {
  it('first column cannot move left, but can move right', () => {
    expect(columnMoveAvailability(3, 0)).toEqual({ canMoveLeft: false, canMoveRight: true });
  });

  it('a middle column can move both left and right', () => {
    expect(columnMoveAvailability(3, 1)).toEqual({ canMoveLeft: true, canMoveRight: true });
  });

  it('last column can move left, but not right', () => {
    expect(columnMoveAvailability(3, 2)).toEqual({ canMoveLeft: true, canMoveRight: false });
  });

  it('a single-column table can move neither left nor right', () => {
    expect(columnMoveAvailability(1, 0)).toEqual({ canMoveLeft: false, canMoveRight: false });
  });
});

// ---------------------------------------------------------------------------
// Row movement
// ---------------------------------------------------------------------------

describe('moveSelectedRowUp / moveSelectedRowDown — body-only movement (no header boundary crossed)', () => {
  it('moves the first body row down (within the body, not into the header)', () => {
    const view = mountRootView(THREE_ROWS);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 2 }); // Alex, moving toward Sam — stays within the body

    moveSelectedRowDown(view, currentSelection(view)!);

    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| Vik | Designer |\n| Sam | PM |\n| Alex | Engineer |');
    expect(currentSelection(view)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 3 });
  });

  it('moves a middle body row up', () => {
    const view = mountRootView(THREE_ROWS);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 2 }); // Alex

    moveSelectedRowUp(view, currentSelection(view)!);

    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| Alex | Engineer |\n| Vik | Designer |\n| Sam | PM |');
    expect(currentSelection(view)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 1 });
  });

  it('moves the last row up (within the body)', () => {
    const view = mountRootView(THREE_ROWS);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 3 }); // Sam

    moveSelectedRowUp(view, currentSelection(view)!);

    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| Vik | Designer |\n| Sam | PM |\n| Alex | Engineer |');
    expect(currentSelection(view)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 2 });
  });

  it('preserves empty cells while moving', () => {
    const doc = '| Name | Note |\n| --- | --- |\n| Vik |  |\n| Alex | mid |\n| Sam | Note |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 2 }); // Alex

    moveSelectedRowDown(view, currentSelection(view)!);

    expect(view.state.doc.toString()).toBe('| Name | Note |\n| --- | --- |\n| Vik |  |\n| Sam | Note |\n| Alex | mid |');
  });

  it('preserves inline Markdown formatting while moving', () => {
    const doc = '| Name | Note |\n| --- | --- |\n| Vik | one |\n| Alex | **bold** |\n| Sam | *italic* |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 2 }); // Alex

    moveSelectedRowDown(view, currentSelection(view)!);

    expect(view.state.doc.toString()).toBe('| Name | Note |\n| --- | --- |\n| Vik | one |\n| Sam | *italic* |\n| Alex | **bold** |');
  });

  it('preserves escaped pipes while moving', () => {
    const doc = '| Name | Note |\n| --- | --- |\n| Vik | one |\n| A \\| B | two |\n| C | three |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 2 });

    moveSelectedRowDown(view, currentSelection(view)!);

    expect(view.state.doc.toString()).toBe('| Name | Note |\n| --- | --- |\n| Vik | one |\n| C | three |\n| A \\| B | two |');
  });

  it('keeps the table rectangular (row count, column count unchanged) after a move', () => {
    const view = mountRootView(THREE_ROWS);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 2 });

    moveSelectedRowDown(view, currentSelection(view)!);

    const lines = view.state.doc.toString().split('\n');
    expect(lines).toHaveLength(5);
  });
});

describe('moveSelectedRowUp / moveSelectedRowDown — crossing the header/body boundary', () => {
  it('the first body row moving up becomes the header, and the old header becomes a body row', () => {
    const view = mountRootView(THREE_ROWS);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 }); // Vik

    const handled = moveSelectedRowUp(view, currentSelection(view)!);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('| Vik | Designer |\n| --- | --- |\n| Name | Role |\n| Alex | Engineer |\n| Sam | PM |');
    // Selection follows the promoted row — now the header, rowIndex 0.
    expect(currentSelection(view)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 0 });
  });

  it('the header moving down demotes it to a body row, and the next row becomes the new header', () => {
    const view = mountRootView(THREE_ROWS);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 }); // header

    const handled = moveSelectedRowDown(view, currentSelection(view)!);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('| Vik | Designer |\n| --- | --- |\n| Name | Role |\n| Alex | Engineer |\n| Sam | PM |');
    // Selection follows the demoted header — now a body row, rowIndex 1.
    expect(currentSelection(view)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 1 });
  });

  it('the delimiter/alignment row is untouched when the header/body swap happens', () => {
    const doc = '| Name | Role |\n| :-- | --: |\n| Vik | Designer |\n| Sam | Engineer |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    moveSelectedRowDown(view, currentSelection(view)!);

    expect(view.state.doc.toString()).toBe('| Vik | Designer |\n| :-- | --: |\n| Name | Role |\n| Sam | Engineer |');
  });

  it('preserves escaped pipes across the header/body swap', () => {
    const doc = '| Name | Note |\n| --- | --- |\n| A \\| B | one |\n| C | two |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    moveSelectedRowDown(view, currentSelection(view)!);

    expect(view.state.doc.toString()).toBe('| A \\| B | one |\n| --- | --- |\n| Name | Note |\n| C | two |');
  });

  it('preserves inline Markdown formatting across the header/body swap', () => {
    const doc = '| Name | Note |\n| --- | --- |\n| Vik | **bold** |\n| Sam | two |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    moveSelectedRowDown(view, currentSelection(view)!);

    expect(view.state.doc.toString()).toBe('| Vik | **bold** |\n| --- | --- |\n| Name | Note |\n| Sam | two |');
  });

  it('keeps the table rectangular (row count, column count unchanged) across the header/body swap', () => {
    const view = mountRootView(THREE_ROWS);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    moveSelectedRowDown(view, currentSelection(view)!);

    const lines = view.state.doc.toString().split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]!.split('|')).toHaveLength(lines[1]!.split('|').length);
  });
});

describe('moveSelectedRowUp / moveSelectedRowDown — physical boundaries', () => {
  it('the first row (the header) cannot move up — no-op, document and selection unchanged', () => {
    const view = mountRootView(THREE_ROWS);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    const handled = moveSelectedRowUp(view, currentSelection(view)!);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(THREE_ROWS);
    expect(currentSelection(view)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 0 });
  });

  it('the last row cannot move down — no-op, document and selection unchanged', () => {
    const view = mountRootView(THREE_ROWS);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 3 });

    const handled = moveSelectedRowDown(view, currentSelection(view)!);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(THREE_ROWS);
    expect(currentSelection(view)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 3 });
  });

  it('a single-row table (header only, no body rows) can move neither up nor down', () => {
    const doc = '| Name | Role |\n| --- | --- |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 });

    expect(moveSelectedRowUp(view, currentSelection(view)!)).toBe(false);
    expect(moveSelectedRowDown(view, currentSelection(view)!)).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('a table with exactly one body row: the body row can move up (promoting it), but the header cannot then move down further', () => {
    const view = mountRootView(SINGLE_BODY_ROW);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    expect(moveSelectedRowDown(view, currentSelection(view)!)).toBe(false); // already the last row
    const handled = moveSelectedRowUp(view, currentSelection(view)!);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('| Vik | Designer |\n| --- | --- |\n| Name | Role |');
    expect(currentSelection(view)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 0 });
  });
});

describe('moveSelectedRowUp / moveSelectedRowDown — guards', () => {
  it('returns false for a column selection', () => {
    const view = mountRootView(THREE_ROWS);
    const selection: TableSelection = { kind: 'column', tableFrom: 0, columnIndex: 0 };

    expect(moveSelectedRowUp(view, selection)).toBe(false);
    expect(moveSelectedRowDown(view, selection)).toBe(false);
    expect(view.state.doc.toString()).toBe(THREE_ROWS);
  });

  it('returns false when the table can no longer be found', () => {
    const view = mountRootView(THREE_ROWS);
    const selection: TableSelection = { kind: 'row', tableFrom: 9999, rowIndex: 1 };

    expect(moveSelectedRowUp(view, selection)).toBe(false);
    expect(moveSelectedRowDown(view, selection)).toBe(false);
  });
});

describe('moveSelectedRowUp / moveSelectedRowDown — undo/redo', () => {
  it('undo restores the exact previous document and selection; redo re-applies the move (body-only)', () => {
    const view = mountRootView(THREE_ROWS);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 2 });
    const depthBefore = undoDepth(view.state);

    moveSelectedRowDown(view, currentSelection(view)!);
    const afterMove = view.state.doc.toString();
    expect(afterMove).not.toBe(THREE_ROWS);
    expect(undoDepth(view.state)).toBe(depthBefore + 1);

    undo(view);
    expect(view.state.doc.toString()).toBe(THREE_ROWS);
    expect(currentSelection(view)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 2 });

    redo(view);
    expect(view.state.doc.toString()).toBe(afterMove);
    expect(currentSelection(view)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 3 });
  });

  it('undo/redo preserves header promotion/demotion and selection across the header/body boundary', () => {
    const view = mountRootView(THREE_ROWS);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 0 }); // header
    const depthBefore = undoDepth(view.state);

    moveSelectedRowDown(view, currentSelection(view)!);
    const afterMove = view.state.doc.toString();
    expect(undoDepth(view.state)).toBe(depthBefore + 1);
    expect(currentSelection(view)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 1 });

    undo(view);
    expect(view.state.doc.toString()).toBe(THREE_ROWS);
    expect(currentSelection(view)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 0 });

    redo(view);
    expect(view.state.doc.toString()).toBe(afterMove);
    expect(currentSelection(view)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 1 });
  });
});

// ---------------------------------------------------------------------------
// Column movement
// ---------------------------------------------------------------------------

describe('moveSelectedColumnLeft / moveSelectedColumnRight — column movement', () => {
  it('moves the first column right', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 }); // Name

    const handled = moveSelectedColumnRight(view, currentSelection(view)!);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe(
      '| Role | Name | City |\n| --- | --- | --- |\n| Designer | Vik | NYC |\n| Engineer | Sam | SF |'
    );
    expect(currentSelection(view)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });
  });

  it('moves a middle column left', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 }); // Role

    moveSelectedColumnLeft(view, currentSelection(view)!);

    expect(view.state.doc.toString()).toBe(
      '| Role | Name | City |\n| --- | --- | --- |\n| Designer | Vik | NYC |\n| Engineer | Sam | SF |'
    );
    expect(currentSelection(view)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 0 });
  });

  it('moves a middle column right', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 }); // Role

    moveSelectedColumnRight(view, currentSelection(view)!);

    expect(view.state.doc.toString()).toBe(
      '| Name | City | Role |\n| --- | --- | --- |\n| Vik | NYC | Designer |\n| Sam | SF | Engineer |'
    );
    expect(currentSelection(view)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 2 });
  });

  it('moves the last column left', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 2 }); // City

    moveSelectedColumnLeft(view, currentSelection(view)!);

    expect(view.state.doc.toString()).toBe(
      '| Name | City | Role |\n| --- | --- | --- |\n| Vik | NYC | Designer |\n| Sam | SF | Engineer |'
    );
    expect(currentSelection(view)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });
  });

  it('the first column cannot move left — no-op, document and selection unchanged', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    const handled = moveSelectedColumnLeft(view, currentSelection(view)!);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(THREE_COLS);
    expect(currentSelection(view)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 0 });
  });

  it('the last column cannot move right — no-op, document and selection unchanged', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 2 });

    const handled = moveSelectedColumnRight(view, currentSelection(view)!);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(THREE_COLS);
    expect(currentSelection(view)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 2 });
  });

  it('preserves empty cells while moving', () => {
    const doc = '| Name | Note | City |\n| --- | --- | --- |\n| Vik |  | NYC |\n| Sam | hi | SF |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    moveSelectedColumnRight(view, currentSelection(view)!);

    expect(view.state.doc.toString()).toBe('| Note | Name | City |\n| --- | --- | --- |\n|  | Vik | NYC |\n| hi | Sam | SF |');
  });

  it('preserves inline Markdown formatting while moving', () => {
    const doc = '| Name | Note |\n| --- | --- |\n| Vik | **bold** |\n| Sam | *italic* |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    moveSelectedColumnRight(view, currentSelection(view)!);

    expect(view.state.doc.toString()).toBe('| Note | Name |\n| --- | --- |\n| **bold** | Vik |\n| *italic* | Sam |');
  });

  it('preserves escaped pipes while moving', () => {
    const doc = '| Name | Note |\n| --- | --- |\n| A \\| B | one |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    moveSelectedColumnRight(view, currentSelection(view)!);

    expect(view.state.doc.toString()).toBe('| Note | Name |\n| --- | --- |\n| one | A \\| B |');
  });

  it('preserves column alignment while moving', () => {
    const doc = '| Name | Role |\n| :-- | --: |\n| Vik | Designer |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    moveSelectedColumnRight(view, currentSelection(view)!);

    expect(view.state.doc.toString()).toBe('| Role | Name |\n| --: | :-- |\n| Designer | Vik |');
  });

  it('keeps the table rectangular (row count, column count unchanged) after a move', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    moveSelectedColumnRight(view, currentSelection(view)!);

    const table = view.state.doc.line(1).text;
    expect(table.split('|').length).toBe(THREE_COLS.split('\n')[0]!.split('|').length);
  });
});

describe('moveSelectedColumnLeft / moveSelectedColumnRight — guards', () => {
  it('returns false for a row selection', () => {
    const view = mountRootView(THREE_COLS);
    const selection: TableSelection = { kind: 'row', tableFrom: 0, rowIndex: 1 };

    expect(moveSelectedColumnLeft(view, selection)).toBe(false);
    expect(moveSelectedColumnRight(view, selection)).toBe(false);
    expect(view.state.doc.toString()).toBe(THREE_COLS);
  });

  it('returns false when the table can no longer be found', () => {
    const view = mountRootView(THREE_COLS);
    const selection: TableSelection = { kind: 'column', tableFrom: 9999, columnIndex: 0 };

    expect(moveSelectedColumnLeft(view, selection)).toBe(false);
    expect(moveSelectedColumnRight(view, selection)).toBe(false);
  });
});

describe('moveSelectedColumnLeft / moveSelectedColumnRight — undo/redo', () => {
  it('undo restores the exact previous document and selection; redo re-applies the move', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });
    const depthBefore = undoDepth(view.state);

    moveSelectedColumnRight(view, currentSelection(view)!);
    const afterMove = view.state.doc.toString();
    expect(afterMove).not.toBe(THREE_COLS);
    expect(undoDepth(view.state)).toBe(depthBefore + 1);

    undo(view);
    expect(view.state.doc.toString()).toBe(THREE_COLS);
    expect(currentSelection(view)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 0 });

    redo(view);
    expect(view.state.doc.toString()).toBe(afterMove);
    expect(currentSelection(view)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });
  });
});

// ---------------------------------------------------------------------------
// resolveRowMoveAvailability / resolveColumnMoveAvailability — menu wiring
// ---------------------------------------------------------------------------

describe('resolveRowMoveAvailability', () => {
  it('resolves availability for a real row selection', () => {
    const view = mountRootView(THREE_ROWS);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 2 });

    expect(resolveRowMoveAvailability(view, currentSelection(view)!)).toEqual({ canMoveUp: true, canMoveDown: true });
  });

  it('returns null for a column selection', () => {
    const view = mountRootView(THREE_ROWS);
    expect(resolveRowMoveAvailability(view, { kind: 'column', tableFrom: 0, columnIndex: 0 })).toBeNull();
  });

  it('returns null when the table cannot be found', () => {
    const view = mountRootView(THREE_ROWS);
    expect(resolveRowMoveAvailability(view, { kind: 'row', tableFrom: 9999, rowIndex: 1 })).toBeNull();
  });
});

describe('resolveColumnMoveAvailability', () => {
  it('resolves availability for a real column selection', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    expect(resolveColumnMoveAvailability(view, currentSelection(view)!)).toEqual({ canMoveLeft: true, canMoveRight: true });
  });

  it('returns null for a row selection', () => {
    const view = mountRootView(THREE_COLS);
    expect(resolveColumnMoveAvailability(view, { kind: 'row', tableFrom: 0, rowIndex: 0 })).toBeNull();
  });

  it('returns null when the table cannot be found', () => {
    const view = mountRootView(THREE_COLS);
    expect(resolveColumnMoveAvailability(view, { kind: 'column', tableFrom: 9999, columnIndex: 0 })).toBeNull();
  });
});
