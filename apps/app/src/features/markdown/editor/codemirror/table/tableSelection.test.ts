// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { history, undo, undoDepth } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableActiveCellChanged, TableActiveCellController } from './tableActiveCellController';
import { tableCellNavigation } from './tableCellNavigation';
import { findAllTables } from './tableGeometry';
import { attachTableOutsideClickHandling, tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
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
    mousedown(findCell(view, 'Vik'));
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
    mousedown(findCell(view, 'Vik'));
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
    mousedown(findCell(view, 'Vik'));
    const firstNestedView = controller.nestedView;
    expect(firstNestedView).not.toBeNull();

    mousedown(findCell(view, 'Alex'));

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
    mousedown(findCell(view, 'Vik'));
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
    mousedown(findCell(view, 'Vik'));
    expect(controller.activeAnchor).not.toBeNull();
    mousedown(outsideElement());
    expect(controller.activeAnchor).toBeNull(); // handler is live and works

    detach();
    mousedown(findCell(view, 'Vik'));
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
    mousedown(findCell(view, 'Vik'));

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
