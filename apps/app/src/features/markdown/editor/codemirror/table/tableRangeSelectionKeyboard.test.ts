// @vitest-environment jsdom
import { afterEach, describe, expect, it, } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { TableActiveCellController } from './tableActiveCellController';
import { tableCellNavigation } from './tableCellNavigation';
import { findAllTables, resolveLogicalCell } from './tableGeometry';
import { tableRangeSelectionKeyboard } from './tableRangeSelectionKeyboard';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { tableWidgetDecoration } from './tableWidgetField';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

const TABLE = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | Delhi |\n| Alex | Engineer | Tokyo |\n| Sam | PM | Oslo |';

function mountViewWithController(doc: string): { view: EditorView; controller: TableActiveCellController } {
  const controller = new TableActiveCellController();
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [markdownLanguageExtension(), tableWidgetDecoration(controller), tableSelectionField, tableRangeSelectionKeyboard(controller)],
    }),
    parent,
  });
  controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);
  mountedViews.push(view);
  return { view, controller };
}

function tableFrom(view: EditorView): number {
  return findAllTables(view.state)[0]!.from;
}

function findCell(view: EditorView, text: string): HTMLElement {
  const cell = Array.from(view.dom.querySelectorAll('th, td')).find((el) => el.textContent === text);
  if (!cell) {
    throw new Error(`no cell with text "${text}"`);
  }
  return cell as HTMLElement;
}

function mousedown(el: Element): void {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

function mouseup(): void {
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
}

function mockElementFromPoint(): (el: Element | null) => void {
  let current: Element | null = null;
  document.elementFromPoint = ((): Element | null => current) as typeof document.elementFromPoint;
  return (el) => {
    current = el;
  };
}

function moveOver(setTarget: (el: Element | null) => void, cell: Element): void {
  setTarget(cell);
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true }));
}

/** Drags from `from`'s cell to `to`'s cell, promoting the gesture to a range selection, and releases the mouse. */
function dragRange(view: EditorView, from: string, to: string): void {
  const setTarget = mockElementFromPoint();
  mousedown(findCell(view, from));
  moveOver(setTarget, findCell(view, to));
  mouseup();
}

function selection(view: EditorView): TableSelection | null {
  return view.state.field(tableSelectionField);
}

function dispatchKey(view: EditorView, key: string, shiftKey = false): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
}

/** The active cell's own nested-editor document text, or `null` if no cell is active. */
function activeCellText(controller: TableActiveCellController): string | null {
  return controller.nestedView && controller.activeAnchor ? controller.nestedView.state.doc.toString() : null;
}

describe('tableRangeSelectionKeyboard — Arrow keys clear the range and navigate from the anchor', () => {
  it('ArrowUp clears the selection, activates the anchor, and moves up one row from it', () => {
    const { view, controller } = mountViewWithController(TABLE);
    dragRange(view, 'Alex', 'Tokyo'); // anchor: row2/col0, head: row2/col2
    expect(selection(view)).not.toBeNull();

    dispatchKey(view, 'ArrowUp');

    expect(selection(view)).toBeNull();
    expect(activeCellText(controller)).toBe('Vik');
  });

  it('ArrowDown clears the selection, activates the anchor, and moves down one row from it', () => {
    const { view, controller } = mountViewWithController(TABLE);
    dragRange(view, 'Alex', 'Tokyo');

    dispatchKey(view, 'ArrowDown');

    expect(selection(view)).toBeNull();
    expect(activeCellText(controller)).toBe('Sam');
  });

  it('ArrowLeft clears the selection, activates the anchor at content start, and moves to the previous cell', () => {
    const { view, controller } = mountViewWithController(TABLE);
    dragRange(view, 'Designer', 'Delhi'); // anchor: row1/col1, head: row1/col2

    dispatchKey(view, 'ArrowLeft');

    expect(selection(view)).toBeNull();
    expect(activeCellText(controller)).toBe('Vik');
  });

  it('ArrowRight clears the selection, activates the anchor at content end, and moves to the next cell', () => {
    const { view, controller } = mountViewWithController(TABLE);
    dragRange(view, 'Designer', 'Delhi');

    dispatchKey(view, 'ArrowRight');

    expect(selection(view)).toBeNull();
    expect(activeCellText(controller)).toBe('Delhi');
  });
});

describe('tableRangeSelectionKeyboard — Tab/Shift-Tab clear the range and navigate from the anchor', () => {
  it('Tab clears the selection and moves to the next cell (row-major) from the anchor', () => {
    const { view, controller } = mountViewWithController(TABLE);
    dragRange(view, 'Designer', 'Delhi');

    dispatchKey(view, 'Tab');

    expect(selection(view)).toBeNull();
    expect(activeCellText(controller)).toBe('Delhi');
  });

  it('Shift-Tab clears the selection and moves to the previous cell from the anchor', () => {
    const { view, controller } = mountViewWithController(TABLE);
    dragRange(view, 'Designer', 'Delhi');

    dispatchKey(view, 'Tab', true);

    expect(selection(view)).toBeNull();
    expect(activeCellText(controller)).toBe('Vik');
  });
});

describe('tableRangeSelectionKeyboard — Enter and Shift-Enter', () => {
  it('clears the range and moves down one row in the anchor column without changing the table', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const docBefore = view.state.doc.toString();
    dragRange(view, 'Designer', 'Delhi'); // anchor: row1/col1 ("Designer")

    dispatchKey(view, 'Enter');

    expect(view.state.doc.toString()).toBe(docBefore);
    expect(selection(view)).toBeNull();
    expect(activeCellText(controller)).toBe('Engineer');
    expect(resolveLogicalCell(view.state, controller.activeAnchor!.from)?.columnIndex).toBe(1);
  });

  it('consumes Shift-Enter without clearing or changing an active range selection', () => {
    const { view, controller } = mountViewWithController(TABLE);
    dragRange(view, 'Designer', 'Delhi');
    const before = selection(view);

    dispatchKey(view, 'Enter', true);

    expect(selection(view)).toEqual(before);
    expect(controller.activeAnchor).toBeNull();
    expect(view.state.doc.toString()).toBe(TABLE);
  });
});

describe('tableRangeSelectionKeyboard — scoped strictly to range selections', () => {
  it('does not intercept Arrow keys for a row-kind TableSelection', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const rowSelection: TableSelection = { kind: 'row', tableFrom: tableFrom(view), rowIndex: 1 };
    view.dispatch({ effects: [tableSelectionChanged.of(rowSelection)] });

    dispatchKey(view, 'ArrowUp');

    expect(selection(view)).toEqual(rowSelection);
    expect(controller.activeAnchor).toBeNull();
  });

  it('does not intercept Arrow keys for a column-kind TableSelection', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const columnSelection: TableSelection = { kind: 'column', tableFrom: tableFrom(view), columnIndex: 1 };
    view.dispatch({ effects: [tableSelectionChanged.of(columnSelection)] });

    dispatchKey(view, 'Tab');

    expect(selection(view)).toEqual(columnSelection);
    expect(controller.activeAnchor).toBeNull();
  });

  it('does not intercept Arrow keys when there is no TableSelection at all', () => {
    const { view, controller } = mountViewWithController(TABLE);

    dispatchKey(view, 'ArrowDown');

    expect(selection(view)).toBeNull();
    expect(controller.activeAnchor).toBeNull();
  });
});
