// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { TableActiveCellController } from './tableActiveCellController';
import { tableCellNavigation } from './tableCellNavigation';
import { endOfCellContent, resolveLogicalCell, startOfCellContent, type CellBounds } from './tableGeometry';

/** Mirrors tableCellNavigation.ts's own `trimmedCellRange` — a cell's real editable content range, excluding the padding spaces around it. */
function trimmed(state: EditorState, bounds: CellBounds): { readonly from: number; readonly to: number } {
  return { from: startOfCellContent(state, bounds), to: endOfCellContent(state, bounds) };
}

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

function mountRootView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [markdownLanguageExtension(), history()] }),
    parent,
  });
  mountedViews.push(view);
  return view;
}

function makeContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

/** Activates the cell containing `text`'s first occurrence of `needle` in `root`, caret at the occurrence's own start, wired with tableCellNavigation. */
function activateCellContaining(root: EditorView, needle: string): { controller: TableActiveCellController; container: HTMLElement } {
  const controller = new TableActiveCellController();
  controller.setNestedExtensions([tableCellNavigation(() => root, controller)]);
  const container = makeContainer();
  const pos = root.state.doc.toString().indexOf(needle);
  const cell = resolveLogicalCell(root.state, pos);
  if (!cell) {
    throw new Error(`"${needle}" did not resolve to a table cell`);
  }
  const range = trimmed(root.state, cell.bounds);
  controller.activate(root, container, range.from, range.to, pos);
  return { controller, container };
}

function dispatchKey(view: EditorView, key: string, shiftKey = false): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
}

const TABLE = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';

describe('tableCellNavigation — Tab/Shift-Tab (row-major crossing)', () => {
  it('Tab moves activation to the next cell, row-major, landing at its content end', () => {
    const root = mountRootView(TABLE);
    const { controller } = activateCellContaining(root, 'Name');

    dispatchKey(controller.nestedView!, 'Tab');

    expect(controller.nestedView!.state.doc.toString()).toBe('Role');
    expect(controller.nestedView!.state.selection.main.head).toBe('Role'.length);
  });

  it('Shift-Tab moves activation to the previous cell, landing at its content end', () => {
    const root = mountRootView(TABLE);
    const { controller } = activateCellContaining(root, 'Role');

    dispatchKey(controller.nestedView!, 'Tab', true);

    expect(controller.nestedView!.state.doc.toString()).toBe('Name');
    expect(controller.nestedView!.state.selection.main.head).toBe('Name'.length);
  });

  it('Tab from the last cell of the header row continues into the first cell of the next row (flattened, row-major)', () => {
    const root = mountRootView(TABLE);
    const { controller } = activateCellContaining(root, 'Role');

    dispatchKey(controller.nestedView!, 'Tab');

    expect(controller.nestedView!.state.doc.toString()).toBe('Vik');
  });

  it('Tab at the final cell of the entire table does nothing — no row created, activation stays put', () => {
    const root = mountRootView(TABLE);
    const { controller } = activateCellContaining(root, 'Designer');
    const anchorBefore = controller.activeAnchor;

    dispatchKey(controller.nestedView!, 'Tab');

    expect(root.state.doc.toString()).toBe(TABLE);
    expect(controller.activeAnchor).toEqual(anchorBefore);
    expect(controller.nestedView!.state.doc.toString()).toBe('Designer');
  });

  it('Shift-Tab from the first cell of the table does nothing', () => {
    const root = mountRootView(TABLE);
    const { controller } = activateCellContaining(root, 'Name');
    const anchorBefore = controller.activeAnchor;

    dispatchKey(controller.nestedView!, 'Tab', true);

    expect(controller.activeAnchor).toEqual(anchorBefore);
    expect(controller.nestedView!.state.doc.toString()).toBe('Name');
  });
});

describe('tableCellNavigation — Tab (empty-cell entry/exit)', () => {
  it('Tab from an empty cell still moves to the next cell', () => {
    const doc = '| A | | C |\n| - | - | - |\n| 1 | | 3 |';
    const root = mountRootView(doc);
    const controller = new TableActiveCellController();
    controller.setNestedExtensions([tableCellNavigation(() => root, controller)]);
    const container = makeContainer();
    // The middle (empty) cell of the last row.
    const oneCell = resolveLogicalCell(root.state, doc.lastIndexOf('1'));
    const emptyBounds = resolveLogicalCell(root.state, oneCell!.bounds.rightDelimiterFrom + 1)!.bounds;
    const emptyRange = trimmed(root.state, emptyBounds);
    controller.activate(root, container, emptyRange.from, emptyRange.to, emptyRange.from);
    expect(controller.nestedView!.state.doc.toString()).toBe('');

    dispatchKey(controller.nestedView!, 'Tab');

    expect(controller.nestedView!.state.doc.toString()).toBe('3');
  });

  it('Shift-Tab into an empty destination cell activates it with an empty nested document', () => {
    const doc = '| A | | C |\n| - | - | - |\n| 1 | | 3 |';
    const root = mountRootView(doc);
    const { controller } = activateCellContaining(root, '3');

    dispatchKey(controller.nestedView!, 'Tab', true);

    expect(controller.nestedView!.state.doc.toString()).toBe('');
  });
});

describe('tableCellNavigation — ArrowUp/ArrowDown (column preservation, ragged rows)', () => {
  const RAGGED = '| Name | Description|\n| --- | --- |\n| Vigram | This is another description I am here |\n| | |';

  it('Down from the header goes straight to the first data row, same column', () => {
    const root = mountRootView(TABLE);
    const { controller } = activateCellContaining(root, 'Name');

    dispatchKey(controller.nestedView!, 'ArrowDown');

    expect(controller.nestedView!.state.doc.toString()).toBe('Vik');
  });

  it('Up from the first data row goes straight to the header, same column', () => {
    const root = mountRootView(TABLE);
    const { controller } = activateCellContaining(root, 'Vik');

    dispatchKey(controller.nestedView!, 'ArrowUp');

    expect(controller.nestedView!.state.doc.toString()).toBe('Name');
  });

  it('preserves the table column across cells of very different lengths', () => {
    const root = mountRootView(RAGGED);
    const { controller } = activateCellContaining(root, 'Description');

    dispatchKey(controller.nestedView!, 'ArrowDown');

    expect(controller.nestedView!.state.doc.toString()).toBe('This is another description I am here');
  });

  it('preserves column when the destination cell is empty', () => {
    const root = mountRootView(RAGGED);
    const { controller } = activateCellContaining(root, 'This is another');

    dispatchKey(controller.nestedView!, 'ArrowDown');

    expect(controller.nestedView!.state.doc.toString()).toBe('');
  });

  it('preserves column when the source cell is empty (last row -> Up)', () => {
    const root = mountRootView(RAGGED);
    const lastRow = '| | |';
    const emptyCol2 = RAGGED.lastIndexOf(lastRow) + lastRow.lastIndexOf('| |') + 1;
    const controller = new TableActiveCellController();
    controller.setNestedExtensions([tableCellNavigation(() => root, controller)]);
    const container = makeContainer();
    const cell = resolveLogicalCell(root.state, emptyCol2)!;
    const range = trimmed(root.state, cell.bounds);
    controller.activate(root, container, range.from, range.to, emptyCol2);

    dispatchKey(controller.nestedView!, 'ArrowUp');

    expect(controller.nestedView!.state.doc.toString()).toBe('This is another description I am here');
  });

  it('Up from the header declines (no row above) — activation, document, and nested content stay unchanged', () => {
    const root = mountRootView(TABLE);
    const { controller } = activateCellContaining(root, 'Name');
    const anchorBefore = controller.activeAnchor;

    dispatchKey(controller.nestedView!, 'ArrowUp');

    expect(root.state.doc.toString()).toBe(TABLE);
    expect(controller.activeAnchor).toEqual(anchorBefore);
    expect(controller.nestedView!.state.doc.toString()).toBe('Name');
  });
});

describe('tableCellNavigation — ArrowDown exits the table at its last row (header/last-row special case)', () => {
  it('at the last row with nothing below the table, inserts a blank line after it, moves root selection there, and deactivates', () => {
    const root = mountRootView(TABLE);
    const { controller } = activateCellContaining(root, 'Designer');

    dispatchKey(controller.nestedView!, 'ArrowDown');

    expect(root.state.doc.toString()).toBe(TABLE + '\n');
    expect(root.state.selection.main.head).toBe(TABLE.length + 1);
    expect(controller.activeAnchor).toBeNull();
  });

  it('does not create another line when a non-empty paragraph already exists below the table', () => {
    const doc = TABLE + '\n\nalready here';
    const root = mountRootView(doc);
    const { controller } = activateCellContaining(root, 'Designer');

    dispatchKey(controller.nestedView!, 'ArrowDown');

    expect(root.state.doc.toString()).toBe(doc);
    expect(controller.activeAnchor).not.toBeNull();
  });

  it('does not create another line when an empty paragraph already exists below the table', () => {
    const doc = TABLE + '\n\n';
    const root = mountRootView(doc);
    const { controller } = activateCellContaining(root, 'Designer');

    dispatchKey(controller.nestedView!, 'ArrowDown');

    expect(root.state.doc.toString()).toBe(doc);
  });
});

describe('tableCellNavigation — Enter creates a new row and activates the same column', () => {
  const NAMED_TABLE = '| Name | Role |\n| --- | --- |\n| Vikram | Designer |';

  it('creates an empty row immediately below the current one, preserving column count, without splitting existing text', () => {
    const root = mountRootView(NAMED_TABLE);
    const { controller } = activateCellContaining(root, 'Vikram');

    dispatchKey(controller.nestedView!, 'Enter');

    expect(root.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| Vikram | Designer |\n| | |');
  });

  it('activates the same column of the new row, with an empty nested document', () => {
    const root = mountRootView(NAMED_TABLE);
    const { controller } = activateCellContaining(root, 'Designer');

    dispatchKey(controller.nestedView!, 'Enter');

    expect(controller.nestedView!.state.doc.toString()).toBe('');
    expect(root.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| Vikram | Designer |\n| | |');
    // The new active cell is the second column of the freshly created row.
    expect(root.state.sliceDoc(controller.activeAnchor!.from, controller.activeAnchor!.to)).toBe('');
    const newCell = resolveLogicalCell(root.state, controller.activeAnchor!.from);
    expect(newCell?.columnIndex).toBe(1);
    expect(newCell?.row.from).toBe(root.state.doc.toString().lastIndexOf('| | |'));
  });

  it('works when the current cell is already empty', () => {
    const doc = '| A | |\n| --- | --- |\n| 1 | |';
    const root = mountRootView(doc);
    const controller = new TableActiveCellController();
    controller.setNestedExtensions([tableCellNavigation(() => root, controller)]);
    const container = makeContainer();
    const emptyCellPos = doc.lastIndexOf('| |') + 2;
    const cell = resolveLogicalCell(root.state, emptyCellPos)!;
    const range = trimmed(root.state, cell.bounds);
    controller.activate(root, container, range.from, range.to, emptyCellPos);

    dispatchKey(controller.nestedView!, 'Enter');

    expect(root.state.doc.toString()).toBe('| A | |\n| --- | --- |\n| 1 | |\n| | |');
  });

  it('Enter in the header inserts the new row after the delimiter row, keeping header/delimiter adjacent', () => {
    const root = mountRootView(NAMED_TABLE);
    const { controller } = activateCellContaining(root, 'Name');

    dispatchKey(controller.nestedView!, 'Enter');

    expect(root.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| | |\n| Vikram | Designer |');
  });

  it('is a single root undo step', () => {
    const root = mountRootView(NAMED_TABLE);
    const { controller } = activateCellContaining(root, 'Vikram');

    dispatchKey(controller.nestedView!, 'Enter');

    expect(root.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| Vikram | Designer |\n| | |');
    undo(root);
    expect(root.state.doc.toString()).toBe(NAMED_TABLE);
  });
});
