// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { history, undoDepth } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { TableActiveCellController } from './tableActiveCellController';
import { tableCellNavigation } from './tableCellNavigation';
import { findAllTables } from './tableGeometry';
import { attachTableOutsideClickHandling, tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { tableWidgetDecoration } from './tableWidgetField';

const mountedViews: EditorView[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

const TABLE = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | Delhi |\n| Alex | Engineer | Tokyo |\n| Sam | PM | Oslo |';

function mountViewWithController(doc: string, extraExtensions: readonly unknown[] = []): { view: EditorView; controller: TableActiveCellController } {
  const controller = new TableActiveCellController();
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [markdownLanguageExtension(), tableWidgetDecoration(controller), tableSelectionField, ...(extraExtensions as never[])],
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

/** jsdom doesn't implement `document.elementFromPoint` at all (no real layout engine) — assigned directly (not `vi.spyOn`, which requires the property to already exist) to return a caller-chosen element per call, the same "provide what jsdom's lack of real layout can't" pattern `tableSelection.test.ts`'s own `mockPosAtCoords` uses for `EditorView.posAtCoords`. */
function mockElementFromPoint(): (el: Element | null) => void {
  let current: Element | null = null;
  document.elementFromPoint = ((): Element | null => current) as typeof document.elementFromPoint;
  return (el) => {
    current = el;
  };
}

/** Simulates the pointer moving over `cell` — dispatches a real, bubbling `mousemove` after pointing the `elementFromPoint` mock at `cell`. */
function moveOver(setTarget: (el: Element | null) => void, cell: Element): void {
  setTarget(cell);
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true }));
}

function selection(view: EditorView): TableSelection | null {
  return view.state.field(tableSelectionField);
}

describe('beginCellRangeDrag — click vs. drag', () => {
  it('a plain click (mousedown + mouseup, no movement) activates the cell and never creates a range', () => {
    const { view, controller } = mountViewWithController(TABLE);

    mousedown(findCell(view, 'Vik'));
    mouseup();

    expect(controller.activeAnchor).not.toBeNull();
    expect(controller.nestedView!.state.doc.toString()).toBe('Vik');
    expect(selection(view)).toBeNull();
  });

  it('a "drag" that only ever resolves back to the same cell as the anchor still activates it as a plain click', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const setTarget = mockElementFromPoint();
    const cell = findCell(view, 'Vik');

    mousedown(cell);
    moveOver(setTarget, cell);
    moveOver(setTarget, cell);
    mouseup();

    expect(controller.activeAnchor).not.toBeNull();
    expect(selection(view)).toBeNull();
  });

  it('horizontal drag (same row, different columns) creates a range', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const setTarget = mockElementFromPoint();

    mousedown(findCell(view, 'Vik'));
    moveOver(setTarget, findCell(view, 'Delhi'));
    mouseup();

    expect(controller.activeAnchor).toBeNull();
    expect(selection(view)).toEqual({ kind: 'range', tableFrom: tableFrom(view), anchor: { row: 1, col: 0 }, head: { row: 1, col: 2 } });
  });

  it('vertical drag (same column, different rows) creates a range', () => {
    const { view } = mountViewWithController(TABLE);
    const setTarget = mockElementFromPoint();

    mousedown(findCell(view, 'Vik'));
    moveOver(setTarget, findCell(view, 'Alex'));
    mouseup();

    expect(selection(view)).toEqual({ kind: 'range', tableFrom: tableFrom(view), anchor: { row: 1, col: 0 }, head: { row: 2, col: 0 } });
  });

  it('multi-row x multi-column drag tracks the live head as the pointer crosses more cells', () => {
    const { view } = mountViewWithController(TABLE);
    const setTarget = mockElementFromPoint();

    mousedown(findCell(view, 'Vik'));
    moveOver(setTarget, findCell(view, 'Engineer')); // row 2, col 1 — first cross, arms the range
    expect(selection(view)).toEqual({ kind: 'range', tableFrom: tableFrom(view), anchor: { row: 1, col: 0 }, head: { row: 2, col: 1 } });

    moveOver(setTarget, findCell(view, 'Oslo')); // row 3, col 2 — live update
    expect(selection(view)).toEqual({ kind: 'range', tableFrom: tableFrom(view), anchor: { row: 1, col: 0 }, head: { row: 3, col: 2 } });
    mouseup();
  });

  it('reverse-direction drag (starting at a later cell, dragging to an earlier one) records anchor/head exactly as dragged, unswapped', () => {
    const { view } = mountViewWithController(TABLE);
    const setTarget = mockElementFromPoint();

    mousedown(findCell(view, 'Oslo')); // row 3, col 2
    moveOver(setTarget, findCell(view, 'Vik')); // row 1, col 0
    mouseup();

    expect(selection(view)).toEqual({ kind: 'range', tableFrom: tableFrom(view), anchor: { row: 3, col: 2 }, head: { row: 1, col: 0 } });
  });

  it('redundant mousemove events over the same already-current head do not dispatch again', () => {
    const { view } = mountViewWithController(TABLE);
    const setTarget = mockElementFromPoint();
    const dispatchSpy = vi.spyOn(view, 'dispatch');

    mousedown(findCell(view, 'Vik'));
    moveOver(setTarget, findCell(view, 'Alex'));
    const callsAfterFirstCross = dispatchSpy.mock.calls.length;
    moveOver(setTarget, findCell(view, 'Alex'));
    moveOver(setTarget, findCell(view, 'Alex'));
    mouseup();

    expect(dispatchSpy.mock.calls.length).toBe(callsAfterFirstCross);
  });
});

describe('beginCellRangeDrag — mutual exclusivity with row/column selection and the active cell', () => {
  it('starting a drag deactivates a cell that was already active', () => {
    const { view, controller } = mountViewWithController(TABLE);
    mousedown(findCell(view, 'Vik'));
    mouseup();
    expect(controller.activeAnchor).not.toBeNull();

    const setTarget = mockElementFromPoint();
    mousedown(findCell(view, 'Designer'));
    moveOver(setTarget, findCell(view, 'Delhi'));
    mouseup();

    expect(controller.activeAnchor).toBeNull();
    expect(selection(view)?.kind).toBe('range');
  });

  it('a range selection replaces an existing row selection', () => {
    const { view } = mountViewWithController(TABLE);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: from, rowIndex: 1 }) });
    expect(selection(view)?.kind).toBe('row');

    const setTarget = mockElementFromPoint();
    mousedown(findCell(view, 'Alex'));
    moveOver(setTarget, findCell(view, 'Sam'));
    mouseup();

    expect(selection(view)).toEqual({ kind: 'range', tableFrom: from, anchor: { row: 2, col: 0 }, head: { row: 3, col: 0 } });
  });

  it('a range selection replaces an existing column selection', () => {
    const { view } = mountViewWithController(TABLE);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 0 }) });
    expect(selection(view)?.kind).toBe('column');

    const setTarget = mockElementFromPoint();
    mousedown(findCell(view, 'Vik'));
    moveOver(setTarget, findCell(view, 'Designer'));
    mouseup();

    expect(selection(view)).toEqual({ kind: 'range', tableFrom: from, anchor: { row: 1, col: 0 }, head: { row: 1, col: 1 } });
  });

  it('clicking a cell after a range is selected clears the range and activates that cell', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const setTarget = mockElementFromPoint();
    mousedown(findCell(view, 'Vik'));
    moveOver(setTarget, findCell(view, 'Alex'));
    mouseup();
    expect(selection(view)?.kind).toBe('range');

    mousedown(findCell(view, 'Sam'));
    mouseup();

    expect(selection(view)).toBeNull();
    expect(controller.activeAnchor).not.toBeNull();
    expect(controller.nestedView!.state.doc.toString()).toBe('Sam');
  });

  it('clicking outside the table clears the range', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach = attachTableOutsideClickHandling(view, controller);
    const setTarget = mockElementFromPoint();
    mousedown(findCell(view, 'Vik'));
    moveOver(setTarget, findCell(view, 'Alex'));
    mouseup();
    expect(selection(view)?.kind).toBe('range');

    const outside = document.createElement('div');
    document.body.appendChild(outside);
    mousedown(outside);

    expect(selection(view)).toBeNull();
    detach();
  });
});

describe('beginCellRangeDrag — document and history are untouched', () => {
  it('no document changes occur during a full drag gesture', () => {
    const { view } = mountViewWithController(TABLE);
    const setTarget = mockElementFromPoint();
    const docBefore = view.state.doc.toString();

    mousedown(findCell(view, 'Vik'));
    moveOver(setTarget, findCell(view, 'Engineer'));
    moveOver(setTarget, findCell(view, 'Oslo'));
    mouseup();

    expect(view.state.doc.toString()).toBe(docBefore);
  });

  it('no undo-history entry is created by a drag gesture', () => {
    const { view } = mountViewWithController(TABLE, [history()]);
    const setTarget = mockElementFromPoint();
    const depthBefore = undoDepth(view.state);

    mousedown(findCell(view, 'Vik'));
    moveOver(setTarget, findCell(view, 'Engineer'));
    mouseup();

    expect(undoDepth(view.state)).toBe(depthBefore);
  });
});
