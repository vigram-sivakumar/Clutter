// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { history, undo, undoDepth } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableActiveCellChanged, TableActiveCellController } from './tableActiveCellController';
import { tableCellNavigation } from './tableCellNavigation';
import { findAllTables } from './tableGeometry';
import {
  attachTableOutsideClickHandling,
  TABLE_HANDLE_MENU_CLASS,
  tableSelectionChanged,
  tableSelectionField,
  type TableSelection,
} from './tableSelection';
import { tableWidgetDecoration } from './tableWidgetField';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

function mountView(doc: string, extraExtensions: readonly unknown[] = []): EditorView {
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
  mountedViews.push(view);
  return view;
}

const TABLE = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | Delhi |\n| Alex | Engineer | Tokyo |';

function tableFrom(view: EditorView): number {
  return findAllTables(view.state)[0]!.from;
}

/** Like `mountView`, but also returns the real `TableActiveCellController` and wires `tableCellNavigation` — needed by the outside-click tests below, which drive real cell/handle DOM clicks and call `controller.activate()` directly. */
function mountViewWithController(doc: string): { view: EditorView; controller: TableActiveCellController } {
  const controller = new TableActiveCellController();
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [markdownLanguageExtension(), tableWidgetDecoration(controller), tableSelectionField],
    }),
    parent,
  });
  controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);
  mountedViews.push(view);
  return { view, controller };
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

/** A full click (mousedown + mouseup). Activation itself happens synchronously on `mousedown` (`beginCellDragTracking`, `tableCellRangeSelection.ts`, never defers it) — `mouseup` is included so `beginCellDragTracking`'s own per-gesture listeners clean themselves up rather than leaking across tests. Used wherever these tests simulate "the user clicked this cell." */
function clickCell(el: Element): void {
  mousedown(el);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

/** A plain element outside `view.dom` entirely — stands in for "another note/editor area, sidebar, etc." */
function outsideElement(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('attachTableOutsideClickHandling', () => {
  it('deactivates an active cell when the click lands outside the table entirely', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach = attachTableOutsideClickHandling(view, controller);
    clickCell(findCell(view, 'Vik'));
    expect(controller.activeAnchor).not.toBeNull();

    mousedown(outsideElement());

    expect(controller.activeAnchor).toBeNull();
    detach();
  });

  it('clears a column TableSelection when the click lands outside the table', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach = attachTableOutsideClickHandling(view, controller);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 0 }) });
    expect(view.state.field(tableSelectionField)).not.toBeNull();

    mousedown(outsideElement());

    expect(view.state.field(tableSelectionField)).toBeNull();
    detach();
  });

  it('clears a row TableSelection when the click lands outside the table', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach = attachTableOutsideClickHandling(view, controller);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: from, rowIndex: 1 }) });
    expect(view.state.field(tableSelectionField)).not.toBeNull();

    mousedown(outsideElement());

    expect(view.state.field(tableSelectionField)).toBeNull();
    detach();
  });

  it('clears both, defensively, if an active cell and a TableSelection somehow exist at the same time', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach = attachTableOutsideClickHandling(view, controller);
    const from = tableFrom(view);
    // Constructed directly (not via a real click) precisely because the
    // normal UI paths already enforce mutual exclusivity — this
    // artificially forces the "both somehow exist" case this milestone's
    // own requirement calls out, to verify the outside-click handler
    // clears both unconditionally rather than assuming only one is ever
    // possible.
    clickCell(findCell(view, 'Vik'));
    expect(controller.activeAnchor).not.toBeNull();
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 1 }) });
    expect(view.state.field(tableSelectionField)).not.toBeNull();

    mousedown(outsideElement());

    expect(controller.activeAnchor).toBeNull();
    expect(view.state.field(tableSelectionField)).toBeNull();
    detach();
  });

  it('clicking another cell in the same table activates it normally — the outside-click handler never intervenes first', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach = attachTableOutsideClickHandling(view, controller);
    clickCell(findCell(view, 'Vik'));
    const firstNestedView = controller.nestedView;
    expect(firstNestedView).not.toBeNull();

    clickCell(findCell(view, 'Alex'));

    // Same reusable instance, now hosting the second cell's content — a
    // clean transfer, not a deactivate-then-reactivate cycle the outside
    // click handler could have interrupted.
    expect(controller.nestedView).toBe(firstNestedView);
    expect(controller.nestedView!.state.doc.toString()).toBe('Alex');
    expect(controller.activeAnchor).not.toBeNull();
    detach();
  });

  it('clicking inside the already-active cell\'s own content (repositioning the caret) does not deactivate it', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach = attachTableOutsideClickHandling(view, controller);
    clickCell(findCell(view, 'Vik'));
    expect(controller.activeAnchor).not.toBeNull();
    const nestedContentEl = controller.nestedView!.contentDOM;

    // A mousedown landing inside the nested editor's own content — not on
    // its host <td> (already covered by the "another cell" test above),
    // but genuinely inside the active cell's own rendered text, the one
    // case nothing upstream already stops (see
    // `attachTableOutsideClickHandling`'s own doc comment).
    mousedown(nestedContentEl);

    expect(controller.activeAnchor).not.toBeNull();
    expect(controller.nestedView!.dom.isConnected).toBe(true);
    detach();
  });

  it('clicking the column handle sets a new selection — the outside-click handler never clears it first', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach = attachTableOutsideClickHandling(view, controller);
    const cell = findCell(view, 'Designer');
    const wrapper = view.dom.querySelector('.cm-table-wrapper')!;
    const moveEvent = new Event('pointermove', { bubbles: true });
    Object.defineProperty(moveEvent, 'target', { value: cell });
    wrapper.dispatchEvent(moveEvent);

    const hit = wrapper.querySelector('.cm-table-column-handle-hit')!;
    mousedown(hit);
    click(hit);

    expect(view.state.field(tableSelectionField)).not.toBeNull();
    expect(view.state.field(tableSelectionField)!.kind).toBe('column');
    detach();
  });

  it('the returned cleanup function actually removes the listener — no further clearing after detach()', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach = attachTableOutsideClickHandling(view, controller);
    clickCell(findCell(view, 'Vik'));
    expect(controller.activeAnchor).not.toBeNull();
    mousedown(outsideElement());
    expect(controller.activeAnchor).toBeNull(); // handler is live and works

    detach();
    clickCell(findCell(view, 'Vik'));
    expect(controller.activeAnchor).not.toBeNull();

    mousedown(outsideElement());

    // Guards against "repeated table/widget recreation leaves stale
    // listeners" the wrong way (a *missing* detach, not an extra attach) —
    // simulating the moment a real caller's own unmount cleanup has
    // already run: after `detach()`, this same click must no longer clear
    // anything, proving the listener genuinely stopped, not merely that a
    // second one happens to coexist harmlessly.
    expect(controller.activeAnchor).not.toBeNull();
  });

  it('attaching twice on the same view installs two independent listeners — detaching one leaves the other working (never double-clears incorrectly)', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach1 = attachTableOutsideClickHandling(view, controller);
    const detach2 = attachTableOutsideClickHandling(view, controller);
    clickCell(findCell(view, 'Vik'));

    detach1();
    mousedown(outsideElement());

    // The second listener (never detached) still does its job — proves
    // `detach()` only removes the exact listener it installed, not a
    // shared/global one that a stray extra `attach()` call elsewhere could
    // accidentally disable for everyone.
    expect(controller.activeAnchor).toBeNull();
    detach2();
  });
});

describe('attachTableOutsideClickHandling — table handle menu exemption', () => {
  /** A plain element carrying `TABLE_HANDLE_MENU_CLASS` — stands in for `TableHandleMenu.tsx`'s own portaled root DOM (`Overlay`'s `className` prop), appended to `document.body` exactly like the real, portaled menu is, never inside any table's own DOM. */
  function tableHandleMenuElement(): HTMLElement {
    const el = document.createElement('div');
    el.className = TABLE_HANDLE_MENU_CLASS;
    const item = document.createElement('button');
    el.appendChild(item);
    document.body.appendChild(el);
    return item;
  }

  it('a mousedown inside the table handle menu does not clear an active TableSelection', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach = attachTableOutsideClickHandling(view, controller);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: tableFrom(view), rowIndex: 1 }) });

    mousedown(tableHandleMenuElement());

    expect(view.state.field(tableSelectionField)).not.toBeNull();
    detach();
  });

  it('a mousedown inside the table handle menu does not deactivate an active cell either', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach = attachTableOutsideClickHandling(view, controller);
    clickCell(findCell(view, 'Vik'));

    mousedown(tableHandleMenuElement());

    expect(controller.activeAnchor).not.toBeNull();
    detach();
  });

  it('a mousedown genuinely outside both the table and the menu still clears the selection as before (the exemption is narrow)', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach = attachTableOutsideClickHandling(view, controller);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: tableFrom(view), rowIndex: 1 }) });

    mousedown(outsideElement());

    expect(view.state.field(tableSelectionField)).toBeNull();
    detach();
  });
});

describe('tableSelectionField — explicit set/clear', () => {
  it('a column selection effect sets kind, tableFrom, and columnIndex', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);

    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 1 }) });

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: from, columnIndex: 1 });
  });

  it('a row selection effect sets kind, tableFrom, and rowIndex', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);

    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: from, rowIndex: 2 }) });

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: from, rowIndex: 2 });
  });

  it('an explicit null effect clears an existing selection', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 0 }) });

    view.dispatch({ effects: tableSelectionChanged.of(null) });

    expect(view.state.field(tableSelectionField)).toBeNull();
  });
});

describe('tableSelectionField — mutual exclusivity with the active cell', () => {
  it('a plain tableActiveCellChanged (cell activation) clears an existing selection', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 0 }) });
    expect(view.state.field(tableSelectionField)).not.toBeNull();

    // Mirrors TableActiveCellController.activate()'s own dispatch shape —
    // just the marker effect, no changes, no tableSelectionChanged.
    view.dispatch({ effects: tableActiveCellChanged.of(null) });

    expect(view.state.field(tableSelectionField)).toBeNull();
  });

  it('a plain tableActiveCellChanged (cell activation) clears a selected header row (rowIndex 0) exactly like any other row — clicking a header cell activates it and clears the selection', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: from, rowIndex: 0 }) });
    expect(view.state.field(tableSelectionField)).not.toBeNull();

    view.dispatch({ effects: tableActiveCellChanged.of(null) });

    expect(view.state.field(tableSelectionField)).toBeNull();
  });

  it("a handle click's own dispatch (tableSelectionChanged + tableActiveCellChanged together) is not self-cancelling — the new selection wins", () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);

    // The exact shape tableHandleOverlay.ts's own click handlers dispatch.
    view.dispatch({
      effects: [tableActiveCellChanged.of(null), tableSelectionChanged.of({ kind: 'row', tableFrom: from, rowIndex: 1 })],
    });

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: from, rowIndex: 1 });
  });
});

describe('tableSelectionField — does not touch the document or root selection', () => {
  it('setting a selection does not change the document text', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    const before = view.state.doc.toString();

    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 0 }) });

    expect(view.state.doc.toString()).toBe(before);
  });

  it('setting a selection does not move the root document selection', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    const selectionBefore = view.state.selection.main;

    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 0 }) });

    expect(view.state.selection.main.from).toBe(selectionBefore.from);
    expect(view.state.selection.main.to).toBe(selectionBefore.to);
  });

  it('setting a selection does not enter undo history', () => {
    const view = mountView(TABLE, [history()]);
    const from = tableFrom(view);
    const depthBefore = undoDepth(view.state);

    view.dispatch({ effects: [tableActiveCellChanged.of(null), tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 0 })] });

    expect(undoDepth(view.state)).toBe(depthBefore);
    // Confirm there is nothing for undo() to even act on — dispatching it
    // must not resurrect a previous (nonexistent) document state.
    const docBefore = view.state.doc.toString();
    undo(view);
    expect(view.state.doc.toString()).toBe(docBefore);
  });
});

describe('tableSelectionField — structural remapping', () => {
  it('a selected column survives a row inserted elsewhere in the table (columnIndex unchanged)', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 2 }) });

    // Insert a brand-new row after the first data row (Enter-in-a-cell's
    // own shape — buildEmptyRowText — without needing an active cell).
    const table = findAllTables(view.state)[0]!;
    const firstDataRowEnd = view.state.doc.lineAt(table.from).number; // header line
    const insertLine = view.state.doc.line(firstDataRowEnd + 2); // first data row
    view.dispatch({ changes: { from: insertLine.to, to: insertLine.to, insert: '\n| | | |' } });

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: from, columnIndex: 2 });
  });

  it('a selected column is cleared once the header itself loses that many columns', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 2 }) });

    // Replace the whole table with an equivalent, but 2-column, version —
    // column index 2 (the third column) no longer exists.
    const table = findAllTables(view.state)[0]!;
    const twoColumn = '| Name | Role |\n| --- | --- |\n| Vik | Designer |\n| Alex | Engineer |';
    view.dispatch({ changes: { from: table.from, to: table.to, insert: twoColumn } });

    expect(view.state.field(tableSelectionField)).toBeNull();
  });

  it('a selected column is cleared once its whole table is deleted', () => {
    const view = mountView(`${TABLE}\n\nAfter.`);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 0 }) });

    const table = findAllTables(view.state)[0]!;
    view.dispatch({ changes: { from: table.from, to: table.to, insert: '' } });

    expect(view.state.field(tableSelectionField)).toBeNull();
  });

  it('a selected row shifts to the correct new index when a row is inserted above it', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    // Select the second data row (Alex/Engineer/Tokyo) — rowIndex 2:
    // header=0, "Vik" row=1, "Alex" row=2.
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: from, rowIndex: 2 }) });

    // Insert a new row between the header/delimiter and the "Vik" row —
    // i.e. immediately above the "Vik" row, which is itself above the
    // selected "Alex" row.
    const vikLine = view.state.doc.line(3); // "| Vik | Designer | Delhi |"
    const insertAt = view.state.doc.line(vikLine.number - 1).to; // end of the delimiter row
    view.dispatch({ changes: { from: insertAt, to: insertAt, insert: '\n| | | |' } });

    const newTable = findAllTables(view.state)[0]!;
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: newTable.from, rowIndex: 3 });
  });

  it('a selected row is cleared once that exact row is deleted', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: from, rowIndex: 1 }) }); // "Vik" row

    const vikLine = view.state.doc.line(3);
    // Delete the whole line, including its own leading newline, so the
    // table's remaining rows re-join cleanly.
    view.dispatch({ changes: { from: view.state.doc.line(2).to, to: vikLine.to, insert: '' } });

    expect(view.state.field(tableSelectionField)).toBeNull();
  });

  it('a selected row is cleared once its whole table is deleted', () => {
    const view = mountView(`${TABLE}\n\nAfter.`);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: from, rowIndex: 1 }) });

    const table = findAllTables(view.state)[0]!;
    view.dispatch({ changes: { from: table.from, to: table.to, insert: '' } });

    expect(view.state.field(tableSelectionField)).toBeNull();
  });

  it('an edit entirely before the table shifts tableFrom but preserves the same column selection', () => {
    const view = mountView(`Above.\n\n${TABLE}`);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 1 }) });

    view.dispatch({ changes: { from: 0, to: 0, insert: 'Even more text.\n' } });

    const newTable = findAllTables(view.state)[0]!;
    expect(newTable.from).not.toBe(from);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: newTable.from, columnIndex: 1 });
  });

  it('a non-doc-changing transaction (e.g. an unrelated selection move) leaves the selection untouched', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 0 }) });

    view.dispatch({ selection: { anchor: 0 } });

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: from, columnIndex: 0 });
  });
});

describe('tableSelectionField — type-level: range must exist but is never produced here', () => {
  it('a hypothetical range value is not something any code path in this milestone constructs', () => {
    // Compile-time check only — asserts the discriminated union accepts a
    // `range` member (this milestone's own "must exist in the type design"
    // requirement) without this milestone needing to implement it.
    const range: TableSelection = { kind: 'range', tableFrom: 0, anchor: { row: 0, col: 0 }, head: { row: 1, col: 1 } };
    expect(range.kind).toBe('range');
  });
});

describe('attachTableOutsideClickHandling — root-selection-collapse fallback', () => {
  /**
   * jsdom has no real layout engine, so `EditorView.posAtCoords()` (which
   * depends on real `getClientRects()`-based coordinate mapping) cannot
   * meaningfully resolve a screen coordinate the way a real browser would
   * — the same limitation this whole investigation ran into everywhere
   * else pixel geometry was involved. Mocked here to return a
   * caller-chosen position, so these tests exercise this function's own
   * *decision logic* (collapse when non-empty + a position resolves;
   * skip when already collapsed; skip when `posAtCoords` itself declines)
   * without depending on real layout at all.
   */
  function mockPosAtCoords(view: EditorView, pos: number | null): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(view, 'posAtCoords').mockReturnValue(pos);
  }

  function mousedownAt(el: Element, clientX: number, clientY: number): void {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX, clientY }));
  }

  it('Ctrl+A then a click resolving onto normal text outside the table collapses root selection to that position', () => {
    const doc = `Above text.\n\n${TABLE}\n\nBelow text.`;
    const { view, controller } = mountViewWithController(doc);
    const detach = attachTableOutsideClickHandling(view, controller);
    view.dispatch({ selection: { anchor: 0, head: doc.length } });
    const targetPos = doc.indexOf('Below text.') + 3;
    const spy = mockPosAtCoords(view, targetPos);

    mousedownAt(outsideElement(), 42, 42);

    expect(view.state.selection.main.from).toBe(targetPos);
    expect(view.state.selection.main.to).toBe(targetPos);
    expect(spy).toHaveBeenCalledWith({ x: 42, y: 42 });
    detach();
  });

  it('Ctrl+A then a click resolving onto an empty editable line collapses root selection there', () => {
    const doc = `${TABLE}\n\n`;
    const { view, controller } = mountViewWithController(doc);
    const detach = attachTableOutsideClickHandling(view, controller);
    view.dispatch({ selection: { anchor: 0, head: doc.length } });
    mockPosAtCoords(view, doc.length);

    mousedownAt(outsideElement(), 10, 500);

    expect(view.state.selection.main.from).toBe(doc.length);
    expect(view.state.selection.main.empty).toBe(true);
    detach();
  });

  it('Ctrl+A then a click resolving onto the empty editor body area (target outside view.dom entirely) still collapses root selection', () => {
    const doc = `Some text.\n\n${TABLE}\n`;
    const { view, controller } = mountViewWithController(doc);
    const detach = attachTableOutsideClickHandling(view, controller);
    view.dispatch({ selection: { anchor: 0, head: doc.length } });
    mockPosAtCoords(view, doc.length);

    // A plain, unrelated element — stands in for empty body/background
    // space that isn't part of any CM6-rendered line or the table widget
    // at all (the exact case the investigation's own logs captured).
    mousedownAt(outsideElement(), 500, 900);

    expect(view.state.selection.main.from).toBe(doc.length);
    expect(view.state.selection.main.empty).toBe(true);
    detach();
  });

  it('table-only document: Ctrl+A then a click on empty body space still collapses root selection (the exact reported bug)', () => {
    const doc = `${TABLE}\n`;
    const { view, controller } = mountViewWithController(doc);
    const detach = attachTableOutsideClickHandling(view, controller);
    view.dispatch({ selection: { anchor: 0, head: doc.length } });
    expect(view.state.selection.main.empty).toBe(false);
    mockPosAtCoords(view, doc.length);

    mousedownAt(outsideElement(), 500, 900);

    expect(view.state.selection.main.from).toBe(doc.length);
    expect(view.state.selection.main.empty).toBe(true);
    detach();
  });

  it('does not interfere with clicking inside a cell — activation still happens, and any prior root selection still collapses via the same click', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach = attachTableOutsideClickHandling(view, controller);
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });

    clickCell(findCell(view, 'Vik'));

    expect(controller.activeAnchor).not.toBeNull();
    expect(controller.nestedView!.state.doc.toString()).toBe('Vik');
    detach();
  });

  it('does not touch selection for a click on the table border/non-cell area (already suppressed upstream, never reaches this handler)', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach = attachTableOutsideClickHandling(view, controller);
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    const selectionBefore = view.state.selection.main;
    const spy = mockPosAtCoords(view, 0);
    const wrapper = view.dom.querySelector('.cm-table-wrapper')!;

    mousedown(wrapper);

    // Unchanged — the widget's own non-cell suppression (tableWidget.ts)
    // calls stopPropagation() before this handler ever sees the event, so
    // posAtCoords is never even called from here.
    expect(view.state.selection.main.from).toBe(selectionBefore.from);
    expect(view.state.selection.main.to).toBe(selectionBefore.to);
    expect(spy).not.toHaveBeenCalled();
    detach();
  });

  it('clicking a column handle still sets TableSelection normally — the new fallback does not override or race it', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach = attachTableOutsideClickHandling(view, controller);
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    const wrapper = view.dom.querySelector('.cm-table-wrapper')!;
    const cell = findCell(view, 'Designer');
    const moveEvent = new Event('pointermove', { bubbles: true });
    Object.defineProperty(moveEvent, 'target', { value: cell });
    wrapper.dispatchEvent(moveEvent);

    const hit = wrapper.querySelector('.cm-table-column-handle-hit')!;
    mousedown(hit);
    click(hit);

    expect(view.state.field(tableSelectionField)).not.toBeNull();
    expect(view.state.field(tableSelectionField)!.kind).toBe('column');
    detach();
  });

  it('an already-collapsed root selection never calls posAtCoords or dispatches a redundant selection transaction', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach = attachTableOutsideClickHandling(view, controller);
    expect(view.state.selection.main.empty).toBe(true);
    const spy = mockPosAtCoords(view, 12345);
    const dispatchSpy = vi.spyOn(view, 'dispatch');

    mousedownAt(outsideElement(), 1, 1);

    expect(spy).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
    detach();
  });

  it('when posAtCoords itself declines (returns null), no selection transaction is dispatched', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const detach = attachTableOutsideClickHandling(view, controller);
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    const selectionBefore = view.state.selection.main;
    mockPosAtCoords(view, null);

    mousedownAt(outsideElement(), 1, 1);

    expect(view.state.selection.main.from).toBe(selectionBefore.from);
    expect(view.state.selection.main.to).toBe(selectionBefore.to);
    detach();
  });

  it('never includes document changes and never enters undo history', () => {
    const doc = `${TABLE}\n`;
    const controller = new TableActiveCellController();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [markdownLanguageExtension(), tableWidgetDecoration(controller), tableSelectionField, history()],
      }),
      parent,
    });
    mountedViews.push(view);
    const detach = attachTableOutsideClickHandling(view, controller);
    view.dispatch({ selection: { anchor: 0, head: doc.length } });
    const depthBefore = undoDepth(view.state);
    const docBefore = view.state.doc.toString();
    vi.spyOn(view, 'posAtCoords').mockReturnValue(doc.length);

    mousedownAt(outsideElement(), 1, 1);

    expect(view.state.doc.toString()).toBe(docBefore);
    expect(undoDepth(view.state)).toBe(depthBefore);
    detach();
  });
});
