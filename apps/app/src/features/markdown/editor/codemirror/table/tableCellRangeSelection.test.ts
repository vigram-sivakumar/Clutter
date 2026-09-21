// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { history, undo, undoDepth } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { TableActiveCellController } from './tableActiveCellController';
import { tableCellNavigation } from './tableCellNavigation';
import { findAllTables } from './tableGeometry';
import { attachTableOutsideClickHandling, tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { tableSelectionClearKeymap } from './tableSelectionClear';
import { tableSelectionDeletionHistory } from './tableSelectionDeletion';
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

describe('beginCellDragTracking — click vs. drag', () => {
  it('clicking a cell activates it immediately, on mousedown — cell-first, not deferred to mouseup', () => {
    const { view, controller } = mountViewWithController(TABLE);

    mousedown(findCell(view, 'Vik'));

    // Activation already happened — this milestone's own core requirement
    // ("click B2 → B2 becomes the active/selected cell... The active cell
    // is therefore also the starting cell for a possible future drag
    // selection"). No `mouseup` needed to observe it, unlike the prior
    // deferred-activation design this milestone replaces.
    expect(controller.activeAnchor).not.toBeNull();
    expect(controller.nestedView!.state.doc.toString()).toBe('Vik');
    expect(selection(view)).toBeNull();
    mouseup();
  });

  it('a plain click (mousedown + mouseup, no movement) activates the cell and never creates a range', () => {
    const { view, controller } = mountViewWithController(TABLE);

    mousedown(findCell(view, 'Vik'));
    mouseup();

    expect(controller.activeAnchor).not.toBeNull();
    expect(controller.nestedView!.state.doc.toString()).toBe('Vik');
    expect(selection(view)).toBeNull();
  });

  it('an in-cell drag leaves CM6\'s own native text selection completely undisturbed', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const setTarget = mockElementFromPoint();
    const cell = findCell(view, 'Designer');

    mousedown(cell);
    const nested = controller.nestedView!;
    expect(nested.state.doc.toString()).toBe('Designer');

    // Stands in for what CM6's own internal `MouseSelection` would do as
    // the user drags across the cell's own text — this module never reads
    // or reacts to the nested view's own selection at all, so dispatching
    // directly here is a faithful, mechanism-agnostic stand-in for that
    // native behavior (jsdom's lack of a real layout engine means
    // `posAtCoords`-driven mouse selection can't be exercised end to end —
    // see this module's own header comment on `positionRangeSelectionOverlay`'s
    // sibling functions for the same, already-established limitation).
    nested.dispatch({ selection: { anchor: 0, head: 4 } });

    // Movement events that stay within the same cell the whole time —
    // must never touch the nested selection this module doesn't own, and
    // must never promote to a range.
    moveOver(setTarget, cell);
    moveOver(setTarget, cell);
    mouseup();

    expect(controller.activeAnchor).not.toBeNull();
    expect(nested.state.selection.main.from).toBe(0);
    expect(nested.state.selection.main.to).toBe(4);
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
    expect(selection(view)).toEqual({ kind: 'range', tableFrom: tableFrom(view), anchor: { row: 1, col: 0 }, head: { row: 1, col: 2 }, anchorCaretOffset: 0 });
  });

  it('vertical drag (same column, different rows) creates a range', () => {
    const { view } = mountViewWithController(TABLE);
    const setTarget = mockElementFromPoint();

    mousedown(findCell(view, 'Vik'));
    moveOver(setTarget, findCell(view, 'Alex'));
    mouseup();

    expect(selection(view)).toEqual({ kind: 'range', tableFrom: tableFrom(view), anchor: { row: 1, col: 0 }, head: { row: 2, col: 0 }, anchorCaretOffset: 0 });
  });

  it('multi-row x multi-column drag tracks the live head as the pointer crosses more cells', () => {
    const { view } = mountViewWithController(TABLE);
    const setTarget = mockElementFromPoint();

    mousedown(findCell(view, 'Vik'));
    moveOver(setTarget, findCell(view, 'Engineer')); // row 2, col 1 — first cross, arms the range
    expect(selection(view)).toEqual({ kind: 'range', tableFrom: tableFrom(view), anchor: { row: 1, col: 0 }, head: { row: 2, col: 1 }, anchorCaretOffset: 0 });

    moveOver(setTarget, findCell(view, 'Oslo')); // row 3, col 2 — live update
    expect(selection(view)).toEqual({ kind: 'range', tableFrom: tableFrom(view), anchor: { row: 1, col: 0 }, head: { row: 3, col: 2 }, anchorCaretOffset: 0 });
    mouseup();
  });

  it('reverse-direction drag (starting at a later cell, dragging to an earlier one) records anchor/head exactly as dragged, unswapped', () => {
    const { view } = mountViewWithController(TABLE);
    const setTarget = mockElementFromPoint();

    mousedown(findCell(view, 'Oslo')); // row 3, col 2
    moveOver(setTarget, findCell(view, 'Vik')); // row 1, col 0
    mouseup();

    expect(selection(view)).toEqual({ kind: 'range', tableFrom: tableFrom(view), anchor: { row: 3, col: 2 }, head: { row: 1, col: 0 }, anchorCaretOffset: 0 });
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

describe('beginCellDragTracking — mutual exclusivity with row/column selection and the active cell', () => {
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

    expect(selection(view)).toEqual({ kind: 'range', tableFrom: from, anchor: { row: 2, col: 0 }, head: { row: 3, col: 0 }, anchorCaretOffset: 0 });
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

    expect(selection(view)).toEqual({ kind: 'range', tableFrom: from, anchor: { row: 1, col: 0 }, head: { row: 1, col: 1 }, anchorCaretOffset: 0 });
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

describe('beginCellDragTracking — row/column handles remain independent', () => {
  it('a mousedown that starts on a column handle never reaches the cell-drag gesture, even when dragged across cells', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const setTarget = mockElementFromPoint();
    // Hovering a body cell first is what makes `attachTableHandleOverlay`
    // show the handle and record which column it's currently over —
    // mirroring how a real pointer would reach the handle at all.
    const wrapper = findCell(view, 'Vik').closest('.cm-table-wrapper')!;
    const hoverEvent = new MouseEvent('pointermove', { bubbles: true });
    Object.defineProperty(hoverEvent, 'target', { value: findCell(view, 'Vik'), enumerable: true });
    wrapper.dispatchEvent(hoverEvent);
    const columnHit = wrapper.querySelector<HTMLElement>('.cm-table-column-handle-hit')!;

    mousedown(columnHit);
    moveOver(setTarget, findCell(view, 'Delhi'));
    mouseup();

    // Reserved for structural (row/column) operations — never promoted
    // into a cell-range gesture, and the active cell (there is none here)
    // stays untouched.
    expect(selection(view)?.kind).not.toBe('range');
    expect(controller.activeAnchor).toBeNull();
  });

  it('clicking the column handle still selects the column normally, independent of the cell-drag mechanism', () => {
    const { view } = mountViewWithController(TABLE);
    const wrapper = findCell(view, 'Vik').closest('.cm-table-wrapper')!;
    const hoverEvent = new MouseEvent('pointermove', { bubbles: true });
    Object.defineProperty(hoverEvent, 'target', { value: findCell(view, 'Vik'), enumerable: true });
    wrapper.dispatchEvent(hoverEvent);
    const columnHit = wrapper.querySelector<HTMLElement>('.cm-table-column-handle-hit')!;

    columnHit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(selection(view)).toEqual({ kind: 'column', tableFrom: tableFrom(view), columnIndex: 0 });
  });
});

describe('beginCellDragTracking — document and history are untouched', () => {
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

/**
 * Regression coverage for the focus-loss bug fixed alongside these tests:
 * promoting a drag to a `range` selection deactivates the previously-active
 * cell (`controller.deactivate()`, removing its nested editor's focused DOM
 * node) but, before this fix, never returned browser focus to root
 * afterward — leaving `document.activeElement` on `document.body`. The very
 * next Backspace/Delete then reached no CM6 keymap at all (nothing listens
 * on `document.body`), silently doing nothing in Chromium; in WKWebView,
 * per this codebase's own prior investigation of the identical bug class
 * (`tableHandleOverlay.ts`'s own row/column click handlers, fixed the same
 * way earlier), the browser's own native contenteditable deletion could
 * take over instead, deleting far more than the selected cells.
 *
 * jsdom faithfully tracks `document.activeElement` for explicit `.focus()`/
 * blur-on-removal, the same "verifiable here" model `tableLiveWiring.test.ts`'s
 * own doc comment already establishes for `TableActiveCellController`'s
 * identical `nestedView.focus()` pattern — so the fix's actual contract
 * (`view.focus()` after `deactivate()`) is directly, faithfully testable
 * here, not just its downstream symptom.
 *
 * What this suite deliberately does *not* attempt to simulate: a real
 * browser's own routing of a physical keydown to whatever element currently
 * holds OS-level focus. `dispatchKeyAtActiveElement` below dispatches the
 * `keydown` directly at `document.activeElement` (falling back to
 * `document.body`) specifically so that routing is still exercised
 * faithfully via normal DOM bubbling — a keydown dispatched at `body` never
 * bubbles down into `view.contentDOM`, so this test fails exactly the way
 * the real bug did (event reaches no CM6 keymap) rather than trivially
 * passing by dispatching straight at `view.contentDOM` regardless of where
 * focus actually ended up. What it cannot cover is the WKWebView-specific
 * *fallback* behavior itself (native contenteditable deletion stepping in
 * for an unhandled keydown) — that is a real-engine default action jsdom
 * does not implement at all, so it is verified only via live manual
 * reproduction (see this fix's own commit/PR notes), not a unit test.
 */
describe('beginCellDragTracking — focus after range promotion (regression)', () => {
  function dispatchKeyAtActiveElement(key: string): void {
    const target = document.activeElement ?? document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }

  it('returns focus to the root editor once a drag promotes to a range selection', () => {
    const { view } = mountViewWithController(TABLE);
    const setTarget = mockElementFromPoint();

    mousedown(findCell(view, 'Vik'));
    expect(document.activeElement).not.toBe(view.contentDOM); // baseline: the nested cell editor holds focus, not root

    moveOver(setTarget, findCell(view, 'Designer'));
    mouseup();

    expect(selection(view)?.kind).toBe('range');
    expect(document.activeElement).toBe(view.contentDOM);
  });

  it('Backspace after a range promotion reaches root\'s own clear keymap, instead of going nowhere', () => {
    const { view } = mountViewWithController(TABLE, [tableSelectionClearKeymap(), tableSelectionDeletionHistory(), history()]);
    const setTarget = mockElementFromPoint();
    const docBefore = view.state.doc.toString();

    mousedown(findCell(view, 'Vik'));
    moveOver(setTarget, findCell(view, 'Designer'));
    mouseup();
    expect(selection(view)).toEqual({ kind: 'range', tableFrom: tableFrom(view), anchor: { row: 1, col: 0 }, head: { row: 1, col: 1 }, anchorCaretOffset: 0 });

    dispatchKeyAtActiveElement('Backspace');

    expect(view.state.doc.toString()).not.toBe(docBefore);
  });

  it('clears only the selected cells — table structure and unselected cells stay intact', () => {
    const { view } = mountViewWithController(TABLE, [tableSelectionClearKeymap(), tableSelectionDeletionHistory(), history()]);
    const setTarget = mockElementFromPoint();

    mousedown(findCell(view, 'Vik'));
    moveOver(setTarget, findCell(view, 'Designer'));
    mouseup();

    dispatchKeyAtActiveElement('Delete');

    const expectedRow = '|' + ' '.repeat(5) + '|' + ' '.repeat(10) + '| Delhi |';
    expect(view.state.doc.toString()).toBe(
      ['| Name | Role | City |', '| --- | --- | --- |', expectedRow, '| Alex | Engineer | Tokyo |', '| Sam | PM | Oslo |'].join('\n')
    );
  });

  it('selection remains active, on the same range, after clearing', () => {
    const { view } = mountViewWithController(TABLE, [tableSelectionClearKeymap(), tableSelectionDeletionHistory(), history()]);
    const setTarget = mockElementFromPoint();
    const from = tableFrom(view);

    mousedown(findCell(view, 'Vik'));
    moveOver(setTarget, findCell(view, 'Designer'));
    mouseup();

    dispatchKeyAtActiveElement('Delete');

    expect(selection(view)).toEqual({ kind: 'range', tableFrom: from, anchor: { row: 1, col: 0 }, head: { row: 1, col: 1 }, anchorCaretOffset: 0 });
  });

  it('undo restores the cleared contents', () => {
    const { view } = mountViewWithController(TABLE, [tableSelectionClearKeymap(), tableSelectionDeletionHistory(), history()]);
    const setTarget = mockElementFromPoint();
    const docBefore = view.state.doc.toString();

    mousedown(findCell(view, 'Vik'));
    moveOver(setTarget, findCell(view, 'Designer'));
    mouseup();
    dispatchKeyAtActiveElement('Delete');
    expect(view.state.doc.toString()).not.toBe(docBefore);

    undo(view);

    expect(view.state.doc.toString()).toBe(docBefore);
  });
});

describe('beginCellDragTracking — range selection can include a ragged row\'s synthetic (padded) cell', () => {
  it('dragging into the missing City cell of a ragged row includes it in the range, geometry unaffected by raggedness', () => {
    const RAGGED_TABLE = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer |\n| Alex | Engineer | Tokyo |';
    const { view } = mountViewWithController(RAGGED_TABLE);
    const setTarget = mockElementFromPoint();

    const tableElBefore = view.dom.querySelector('table') as HTMLTableElement;
    expect(tableElBefore.tBodies[0]!.rows[0]!.cells).toHaveLength(3); // rendered rectangular, City is an empty synthetic <td>

    mousedown(findCell(view, 'Vik'));
    // Activation rebuilds the table's own DOM (`tableWidgetField`'s own
    // decoration rebuild) — re-query fresh afterward, never the
    // pre-mousedown `raggedRow`/cell references (ADR-034's own "stale
    // click-handler closures" bug class applies to a stale *test*
    // reference just as much as production code).
    const raggedRowAfter = (view.dom.querySelector('table') as HTMLTableElement).tBodies[0]!.rows[0]!;
    moveOver(setTarget, raggedRowAfter.cells[2]!); // drag into the synthetic City cell

    const current = selection(view);
    expect(current?.kind).toBe('range');
    expect(current).toMatchObject({ anchor: { row: 1, col: 0 }, head: { row: 1, col: 2 } });
    mouseup();
  });
});
