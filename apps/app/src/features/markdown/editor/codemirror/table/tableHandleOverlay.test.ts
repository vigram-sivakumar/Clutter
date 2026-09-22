// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { history, undoDepth } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { TableActiveCellController } from './tableActiveCellController';
import { attachTableHandleOverlay, resolveHoveredCell } from './tableHandleOverlay';
import { tableSelectionDeletionHistory } from './tableSelectionDeletion';
import { tableSelectionField } from './tableSelection';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

/**
 * A minimal root `EditorView` + `TableActiveCellController`, for the
 * click-to-select tests below — the document text itself is unrelated to
 * `buildTable()`'s own synthetic DOM (these tests exercise
 * `attachTableHandleOverlay`'s own click-dispatch wiring, not real
 * `TableWidget` rendering), so any non-empty doc and a fixed `tableFrom`
 * are sufficient.
 */
function mountRootView(): { view: EditorView; controller: TableActiveCellController } {
  const controller = new TableActiveCellController();
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({ doc: 'Some document text.', extensions: [markdownLanguageExtension(), tableSelectionField] }),
    parent,
  });
  mountedViews.push(view);
  return { view, controller };
}

const TEST_TABLE_FROM = 0;

/** Hover-only tests don't care about the view/controller `attachTableHandleOverlay` now also requires for its click-dispatch wiring — this wraps a throwaway pair so each hover test doesn't have to. */
function attach(wrapper: HTMLElement, columnCount: number): void {
  const { view, controller } = mountRootView();
  attachTableHandleOverlay(wrapper, columnCount, view, controller, TEST_TABLE_FROM, null, null, () => undefined);
}

/**
 * Builds a minimal `.cm-table-wrapper > .cm-table-scroll > table` DOM,
 * matching `TableWidget.toDOM()`'s own real structure closely enough for
 * `resolveHoveredCell`'s purely-structural query (it never touches layout,
 * so jsdom's lack of a real layout engine — every `getBoundingClientRect()`
 * call returns all-zero rects — is not a concern for these assertions).
 */
function buildTable(rows: number, columns: number): { wrapper: HTMLElement; table: HTMLTableElement } {
  const wrapper = document.createElement('div');
  wrapper.className = 'cm-table-wrapper';
  const scroll = document.createElement('div');
  scroll.className = 'cm-table-scroll';
  wrapper.appendChild(scroll);
  const table = document.createElement('table');
  scroll.appendChild(table);

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (let c = 0; c < columns; c++) {
    headerRow.appendChild(document.createElement('th'));
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement('tr');
    for (let c = 0; c < columns; c++) {
      tr.appendChild(document.createElement('td'));
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  document.body.appendChild(wrapper);
  return { wrapper, table };
}

describe('resolveHoveredCell', () => {
  it('resolves a header cell: correct columnIndex, isHeaderRow true', () => {
    const { wrapper, table } = buildTable(2, 3);
    const headerCell = table.querySelector('thead th:nth-child(2)')!;

    const result = resolveHoveredCell(wrapper, headerCell);

    expect(result).not.toBeNull();
    expect(result!.columnIndex).toBe(1);
    expect(result!.isHeaderRow).toBe(true);
    expect(result!.row).toBe(headerCell.closest('tr'));
  });

  it('resolves a body cell: correct columnIndex, isHeaderRow false', () => {
    const { wrapper, table } = buildTable(2, 3);
    const bodyCell = table.querySelectorAll('tbody tr')[1]!.children[2]!;

    const result = resolveHoveredCell(wrapper, bodyCell);

    expect(result).not.toBeNull();
    expect(result!.columnIndex).toBe(2);
    expect(result!.isHeaderRow).toBe(false);
  });

  it('resolves the target from a descendant of the cell (e.g. .cm-table-cell-wrapper content), not just the cell itself', () => {
    const { wrapper, table } = buildTable(1, 2);
    const cell = table.querySelector('tbody td')!;
    const innerText = document.createElement('span');
    cell.appendChild(innerText);

    const result = resolveHoveredCell(wrapper, innerText);

    expect(result).not.toBeNull();
    expect(result!.columnIndex).toBe(0);
  });

  it('returns null for a target outside any td/th (the wrapper/table/tr themselves)', () => {
    const { wrapper, table } = buildTable(1, 2);

    expect(resolveHoveredCell(wrapper, wrapper)).toBeNull();
    expect(resolveHoveredCell(wrapper, table)).toBeNull();
    expect(resolveHoveredCell(wrapper, table.querySelector('tr'))).toBeNull();
  });

  it('returns null for a cell belonging to a different table/wrapper entirely', () => {
    const { wrapper: wrapperA } = buildTable(1, 2);
    const { table: tableB } = buildTable(1, 2);
    const cellB = tableB.querySelector('td')!;

    expect(resolveHoveredCell(wrapperA, cellB)).toBeNull();
  });

  it('returns null for a non-Element event target', () => {
    const { wrapper } = buildTable(1, 2);

    expect(resolveHoveredCell(wrapper, null)).toBeNull();
    expect(resolveHoveredCell(wrapper, {} as EventTarget)).toBeNull();
  });
});

describe('attachTableHandleOverlay — hover show/hide wiring', () => {
  it('creates exactly one reusable element pair per axis, initially hidden', () => {
    const { wrapper } = buildTable(2, 2);
    attach(wrapper, 2);

    expect(wrapper.querySelectorAll('.cm-table-column-handle')).toHaveLength(1);
    expect(wrapper.querySelectorAll('.cm-table-column-handle-hit')).toHaveLength(1);
    expect(wrapper.querySelectorAll('.cm-table-row-handle')).toHaveLength(1);
    expect(wrapper.querySelectorAll('.cm-table-row-handle-hit')).toHaveLength(1);
    expect(wrapper.querySelector('.cm-table-column-handle')?.classList.contains('cm-table-handle-visible')).toBe(false);
    expect(wrapper.querySelector('.cm-table-row-handle')?.classList.contains('cm-table-handle-visible')).toBe(false);
  });

  it('hovering a body cell shows both the column and row handle', () => {
    const { wrapper, table } = buildTable(2, 2);
    attach(wrapper, 2);

    const bodyCell = table.querySelectorAll('tbody td')[1]!;
    const event = new Event('pointermove', { bubbles: true });
    Object.defineProperty(event, 'target', { value: bodyCell });
    wrapper.dispatchEvent(event);

    expect(wrapper.querySelector('.cm-table-column-handle')?.classList.contains('cm-table-handle-visible')).toBe(true);
    expect(wrapper.querySelector('.cm-table-row-handle')?.classList.contains('cm-table-handle-visible')).toBe(true);
  });

  it('hovering a header cell shows both the column handle and the row handle — the header is a selectable row like any other', () => {
    const { wrapper, table } = buildTable(2, 2);
    attach(wrapper, 2);

    const headerCell = table.querySelector('thead th')!;
    const event = new Event('pointermove', { bubbles: true });
    Object.defineProperty(event, 'target', { value: headerCell });
    wrapper.dispatchEvent(event);

    expect(wrapper.querySelector('.cm-table-column-handle')?.classList.contains('cm-table-handle-visible')).toBe(true);
    expect(wrapper.querySelector('.cm-table-row-handle')?.classList.contains('cm-table-handle-visible')).toBe(true);
  });

  it('moving outside the table (pointerleave) hides both handles', () => {
    const { wrapper, table } = buildTable(2, 2);
    attach(wrapper, 2);

    const bodyCell = table.querySelectorAll('tbody td')[0]!;
    const moveEvent = new Event('pointermove', { bubbles: true });
    Object.defineProperty(moveEvent, 'target', { value: bodyCell });
    wrapper.dispatchEvent(moveEvent);
    expect(wrapper.querySelector('.cm-table-column-handle')?.classList.contains('cm-table-handle-visible')).toBe(true);

    wrapper.dispatchEvent(new Event('pointerleave', { bubbles: true }));

    expect(wrapper.querySelector('.cm-table-column-handle')?.classList.contains('cm-table-handle-visible')).toBe(false);
    expect(wrapper.querySelector('.cm-table-row-handle')?.classList.contains('cm-table-handle-visible')).toBe(false);
  });

  it('regression: a pointermove that lands on the handle\'s own hit-area (moving toward it to interact with it) keeps it visible, rather than hiding-then-reshowing on every tick', () => {
    const { wrapper, table } = buildTable(2, 2);
    attach(wrapper, 2);

    const bodyCell = table.querySelectorAll('tbody td')[0]!;
    const onCell = new Event('pointermove', { bubbles: true });
    Object.defineProperty(onCell, 'target', { value: bodyCell });
    wrapper.dispatchEvent(onCell);
    expect(wrapper.querySelector('.cm-table-column-handle')?.classList.contains('cm-table-handle-visible')).toBe(true);

    // The pointer has now moved onto the hit-area itself — a real browser
    // makes it the event target the instant the cursor reaches it, since
    // it's the topmost element at that point once `pointer-events: auto`
    // applies (`tableHandleOverlay.css`). Confirmed via direct interactive
    // testing to otherwise flicker: without the guard this test exercises,
    // this pointermove reports "not over any td/th" and hides the handle,
    // which drops `pointer-events` back to `none`, so the *next* tick's
    // hit-test falls through to the cell underneath again and re-shows it
    // — an infinite show/hide loop.
    const onHitArea = new Event('pointermove', { bubbles: true });
    const hitArea = wrapper.querySelector('.cm-table-column-handle-hit')!;
    Object.defineProperty(onHitArea, 'target', { value: hitArea });
    wrapper.dispatchEvent(onHitArea);

    expect(wrapper.querySelector('.cm-table-column-handle')?.classList.contains('cm-table-handle-visible')).toBe(true);
  });

  it("a pointermove landing outside any cell (e.g. the wrapper's own border) hides both handles without erroring", () => {
    const { wrapper, table } = buildTable(2, 2);
    attach(wrapper, 2);

    const bodyCell = table.querySelectorAll('tbody td')[0]!;
    const onCell = new Event('pointermove', { bubbles: true });
    Object.defineProperty(onCell, 'target', { value: bodyCell });
    wrapper.dispatchEvent(onCell);

    const offCell = new Event('pointermove', { bubbles: true });
    Object.defineProperty(offCell, 'target', { value: wrapper });
    wrapper.dispatchEvent(offCell);

    expect(wrapper.querySelector('.cm-table-column-handle')?.classList.contains('cm-table-handle-visible')).toBe(false);
  });

  it("a mousedown on the handle's hit area is prevented and stopped (never reaches an ancestor listener)", () => {
    const { wrapper, table } = buildTable(1, 2);
    attach(wrapper, 2);

    const bodyCell = table.querySelector('tbody td')!;
    const moveEvent = new Event('pointermove', { bubbles: true });
    Object.defineProperty(moveEvent, 'target', { value: bodyCell });
    wrapper.dispatchEvent(moveEvent);

    let reachedAncestor = false;
    document.addEventListener('mousedown', () => {
      reachedAncestor = true;
    });

    const hitArea = wrapper.querySelector('.cm-table-column-handle-hit')!;
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    hitArea.dispatchEvent(mousedown);

    expect(mousedown.defaultPrevented).toBe(true);
    expect(reachedAncestor).toBe(false);
  });
});

describe('attachTableHandleOverlay — selected handle stays visible (visible = hovered || selected)', () => {
  function hoverCell(wrapper: HTMLElement, cell: Element): void {
    const event = new Event('pointermove', { bubbles: true });
    Object.defineProperty(event, 'target', { value: cell });
    wrapper.dispatchEvent(event);
  }

  function columnVisible(wrapper: HTMLElement): boolean {
    return wrapper.querySelector('.cm-table-column-handle')!.classList.contains('cm-table-handle-visible');
  }

  function rowVisible(wrapper: HTMLElement): boolean {
    return wrapper.querySelector('.cm-table-row-handle')!.classList.contains('cm-table-handle-visible');
  }

  it('a selected column shows its handle even with no hover at all (fresh attach, never hovered)', () => {
    const { view, controller } = mountRootView();
    const { wrapper } = buildTable(2, 3);

    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, 1, null, () => undefined);

    expect(columnVisible(wrapper)).toBe(true);
    expect(rowVisible(wrapper)).toBe(false);
  });

  it('a selected row shows its handle even with no hover at all (fresh attach, never hovered)', async () => {
    const { view, controller } = mountRootView();
    const { wrapper } = buildTable(2, 3);

    // Native `rowIndex` convention (header = 0) — row 1 is the first body row.
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, 1, () => undefined);
    // The row axis's own initial-state measurement is deferred to a
    // microtask (`attachTableHandleOverlay`'s own doc comment) — real
    // `getBoundingClientRect()`-based positioning can't run correctly
    // against a still-detached subtree, exactly like
    // `tableSelectionOverlay.ts`'s own deferred positioning.
    await Promise.resolve();

    expect(rowVisible(wrapper)).toBe(true);
    expect(columnVisible(wrapper)).toBe(false);
  });

  /**
   * Regression test for the exact bug this deferral fixes: a `column` →
   * `row` `TableSelection` change rebuilds `TableWidget` (a fresh
   * `attachTableHandleOverlay` call, `selectedRowIndex` now set), and
   * before the fix, that fresh call's own initial `hideRow()` measured
   * `getBoundingClientRect()` synchronously — meaningless (zero) on a
   * still-detached subtree in the real app, which pinned the row handle to
   * `top: 0` (the wrapper's own top edge) instead of the selected row.
   * jsdom returns an all-zero rect for *every* element by default, which
   * would silently pass a same-zero-either-way assertion — real, distinct
   * rects are mocked here specifically so a `top: 0px` regression is
   * actually distinguishable from the correct, non-zero position.
   */
  function mockRect(el: Element, rect: { top: number; height: number }): void {
    el.getBoundingClientRect = () => ({ top: rect.top, height: rect.height, bottom: rect.top + rect.height, left: 0, right: 0, width: 0, x: 0, y: rect.top, toJSON: () => ({}) });
  }

  it('regression: switching selection to a row positions its handle at the row, never pinned to the wrapper\'s top edge', async () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);
    mockRect(wrapper, { top: 100, height: 200 });
    const selectedRow = table.querySelectorAll('tbody tr')[0]! as HTMLTableRowElement;
    mockRect(selectedRow, { top: 150, height: 40 }); // row 1 (first body row) — well below the wrapper's own top

    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, 1, () => undefined);
    await Promise.resolve();

    expect(rowVisible(wrapper)).toBe(true);
    // (150 - 100) + 40/2 = 70 — the row's own actual midpoint, not 0.
    expect((wrapper.querySelector('.cm-table-row-handle') as HTMLElement).style.top).toBe('70px');
  });

  it('a selected header row (rowIndex 0) shows its handle even with no hover at all — the header is a selectable row like any other', async () => {
    const { view, controller } = mountRootView();
    const { wrapper } = buildTable(2, 3);

    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, 0, () => undefined);
    await Promise.resolve();

    expect(rowVisible(wrapper)).toBe(true);
    expect(columnVisible(wrapper)).toBe(false);
  });

  it('switching selection from a column to the header row shows the row handle at the header and hides the column handle (simulates the TableWidget rebuild a kind change triggers)', async () => {
    const before = mountRootView();
    const beforeTable = buildTable(2, 3);
    attachTableHandleOverlay(beforeTable.wrapper, 3, before.view, before.controller, TEST_TABLE_FROM, 1, null, () => undefined);
    expect(columnVisible(beforeTable.wrapper)).toBe(true);

    // A fresh `attachTableHandleOverlay` call against a fresh wrapper is
    // exactly what a `TableSelection` kind change produces in the real
    // app — a new `TableWidget.toDOM()` call, per that file's own doc
    // comment — `selectedColumnIndex` now `null`, `selectedRowIndex` now
    // `0` (the header).
    const after = mountRootView();
    const afterTable = buildTable(2, 3);
    attachTableHandleOverlay(afterTable.wrapper, 3, after.view, after.controller, TEST_TABLE_FROM, null, 0, () => undefined);
    await Promise.resolve();

    expect(rowVisible(afterTable.wrapper)).toBe(true);
    expect(columnVisible(afterTable.wrapper)).toBe(false);
  });

  it('switching selection from the header row to a body row shows the row handle at the new row (simulates the TableWidget rebuild a kind change triggers)', async () => {
    const before = mountRootView();
    const beforeTable = buildTable(2, 3);
    attachTableHandleOverlay(beforeTable.wrapper, 3, before.view, before.controller, TEST_TABLE_FROM, null, 0, () => undefined);
    await Promise.resolve();
    expect(rowVisible(beforeTable.wrapper)).toBe(true);

    const after = mountRootView();
    const afterTable = buildTable(2, 3);
    attachTableHandleOverlay(afterTable.wrapper, 3, after.view, after.controller, TEST_TABLE_FROM, null, 1, () => undefined);
    await Promise.resolve();

    expect(rowVisible(afterTable.wrapper)).toBe(true);
    expect(columnVisible(afterTable.wrapper)).toBe(false);
  });

  it('hovering a different column still shows it (hover takes over the shared element); leaving hover falls back to the selected column', () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, 0, null, () => undefined);

    const otherCell = table.querySelectorAll('tbody td')[2]!; // column 2
    hoverCell(wrapper, otherCell);
    expect(columnVisible(wrapper)).toBe(true);
    expect((wrapper.querySelector('.cm-table-column-handle') as HTMLElement).style.left).toBe('83.33333333333334%'); // (2 + 0.5) / 3

    wrapper.dispatchEvent(new Event('pointerleave'));

    expect(columnVisible(wrapper)).toBe(true);
    expect((wrapper.querySelector('.cm-table-column-handle') as HTMLElement).style.left).toBe('16.666666666666664%'); // back to selected column 0: (0 + 0.5) / 3
  });

  it('moving the pointer away from the table entirely still leaves the selected row/column handle visible', () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, 1, () => undefined);

    const bodyCell = table.querySelectorAll('tbody td')[1]!;
    hoverCell(wrapper, bodyCell);
    expect(rowVisible(wrapper)).toBe(true);

    wrapper.dispatchEvent(new Event('pointerleave'));

    expect(rowVisible(wrapper)).toBe(true); // still visible — row 1 is selected, not just hovered
  });

  it('hovering the header row falls back to the selected row handle instead of hiding it (header never gets a row handle of its own)', () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, 1, () => undefined);

    const headerCell = table.querySelector('thead th')!;
    hoverCell(wrapper, headerCell);

    expect(rowVisible(wrapper)).toBe(true); // falls back to the selected row, never truly hidden
    expect(columnVisible(wrapper)).toBe(true); // header hover still shows its own column handle as usual
  });

  it('with no selection at all, leaving hover hides the handle exactly as before this fix', () => {
    const { wrapper, table } = buildTable(2, 3);
    attach(wrapper, 3);

    const bodyCell = table.querySelectorAll('tbody td')[1]!;
    hoverCell(wrapper, bodyCell);
    expect(columnVisible(wrapper)).toBe(true);
    expect(rowVisible(wrapper)).toBe(true);

    wrapper.dispatchEvent(new Event('pointerleave'));

    expect(columnVisible(wrapper)).toBe(false);
    expect(rowVisible(wrapper)).toBe(false);
  });
});

describe('attachTableHandleOverlay — click-to-select', () => {
  function hoverBodyCell(wrapper: HTMLElement, table: HTMLTableElement, rowIndexInBody: number, columnIndex: number): HTMLTableRowElement {
    const row = table.querySelectorAll('tbody tr')[rowIndexInBody]! as HTMLTableRowElement;
    const cell = row.children[columnIndex]!;
    const event = new Event('pointermove', { bubbles: true });
    Object.defineProperty(event, 'target', { value: cell });
    wrapper.dispatchEvent(event);
    return row;
  }

  function click(el: Element): MouseEvent {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event;
  }

  it('clicking the column handle sets a column TableSelection for the hovered column', () => {
    const { wrapper, table } = buildTable(2, 3);
    const { view, controller } = mountRootView();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => undefined);

    hoverBodyCell(wrapper, table, 0, 2);
    click(wrapper.querySelector('.cm-table-column-handle-hit')!);

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: TEST_TABLE_FROM, columnIndex: 2 });
  });

  it('clicking the row handle sets a row TableSelection using the native rowIndex (header + body combined)', () => {
    const { wrapper, table } = buildTable(2, 3);
    const { view, controller } = mountRootView();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => undefined);

    const row = hoverBodyCell(wrapper, table, 1, 0); // second body row -> rowIndex 2 (header=0, first body=1)
    click(wrapper.querySelector('.cm-table-row-handle-hit')!);

    expect(row.rowIndex).toBe(2);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: TEST_TABLE_FROM, rowIndex: 2 });
  });

  it('a click on the column/row handle never modifies the document or the root selection', () => {
    const { wrapper, table } = buildTable(2, 3);
    const { view, controller } = mountRootView();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => undefined);
    view.dispatch({ selection: { anchor: 3 } });
    const docBefore = view.state.doc.toString();
    const selectionBefore = view.state.selection.main;

    hoverBodyCell(wrapper, table, 0, 1);
    click(wrapper.querySelector('.cm-table-column-handle-hit')!);

    expect(view.state.doc.toString()).toBe(docBefore);
    expect(view.state.selection.main.from).toBe(selectionBefore.from);
    expect(view.state.selection.main.to).toBe(selectionBefore.to);
  });

  it('clicking a handle while a cell is active cleanly deactivates it', () => {
    const { wrapper, table } = buildTable(2, 3);
    const { view, controller } = mountRootView();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => undefined);
    const container = document.createElement('div');
    document.body.appendChild(container);
    controller.activate(view, container, 0, 4, 0);
    expect(controller.activeAnchor).not.toBeNull();
    expect(controller.nestedView!.dom.parentElement).toBe(container);

    hoverBodyCell(wrapper, table, 0, 0);
    click(wrapper.querySelector('.cm-table-column-handle-hit')!);

    expect(controller.activeAnchor).toBeNull();
    expect(controller.nestedView!.dom.parentElement).toBeNull();
  });

  it('clicking the header row\'s own row handle selects it — rowIndex 0, a valid TableSelection.row like any other', () => {
    const { wrapper, table } = buildTable(2, 3);
    const { view, controller } = mountRootView();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => undefined);

    const headerCell = table.querySelector('thead th')!;
    const event = new Event('pointermove', { bubbles: true });
    Object.defineProperty(event, 'target', { value: headerCell });
    wrapper.dispatchEvent(event);

    const rowHit = wrapper.querySelector('.cm-table-row-handle-hit')!;
    expect(rowHit.classList.contains('cm-table-handle-visible')).toBe(true);
    click(rowHit);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: TEST_TABLE_FROM, rowIndex: 0 });
  });

  it('a click on the handle before any hover (no column/row tracked yet) does nothing', () => {
    const { wrapper } = buildTable(2, 3);
    const { view, controller } = mountRootView();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => undefined);

    click(wrapper.querySelector('.cm-table-column-handle-hit')!);
    click(wrapper.querySelector('.cm-table-row-handle-hit')!);

    expect(view.state.field(tableSelectionField)).toBeNull();
  });
});

describe('attachTableHandleOverlay — opening the handle menu', () => {
  function hoverBodyCell(wrapper: HTMLElement, table: HTMLTableElement, rowIndexInBody: number, columnIndex: number): void {
    const row = table.querySelectorAll('tbody tr')[rowIndexInBody]! as HTMLTableRowElement;
    const cell = row.children[columnIndex]!;
    const event = new Event('pointermove', { bubbles: true });
    Object.defineProperty(event, 'target', { value: cell });
    wrapper.dispatchEvent(event);
  }

  function click(el: Element): void {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }

  /**
   * Re-parents `wrapper` under a `.cm-table-widget[data-table-from]`
   * appended into `view.dom` — the real `TableWidget.toDOM()` shape
   * (`tableWidget.ts`'s own doc comment) `resolveCurrentHandleElement`
   * (`tableHandleOverlay.ts`) queries against, required for these tests
   * specifically: unlike every other describe block in this file (which
   * only exercises hover/click wiring against a standalone `wrapper`, per
   * `buildTable`'s own doc comment), these tests exercise the *menu-open*
   * path, which re-resolves its own anchor from `view.dom` after
   * dispatching — a `wrapper` left parented under `document.body` alone
   * (as `buildTable` itself leaves it) would never be found by that query.
   */
  function embedInViewDom(view: EditorView, wrapper: HTMLElement, tableFromValue: number): void {
    const widget = document.createElement('div');
    widget.className = 'cm-table-widget';
    widget.dataset.tableFrom = String(tableFromValue);
    widget.appendChild(wrapper);
    view.dom.appendChild(widget);
  }

  it('clicking a column handle calls the menu-change callback with the current visible handle as anchor and the same column selection just dispatched', () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);
    embedInViewDom(view, wrapper, TEST_TABLE_FROM);
    const onMenuChange = vi.fn();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => onMenuChange);

    hoverBodyCell(wrapper, table, 0, 2);
    click(wrapper.querySelector('.cm-table-column-handle-hit')!);

    expect(onMenuChange).toHaveBeenCalledExactlyOnceWith({
      anchor: wrapper.querySelector('.cm-table-column-handle'),
      selection: { kind: 'column', tableFrom: TEST_TABLE_FROM, columnIndex: 2 },
    });
  });

  it('clicking a row handle calls the menu-change callback with the current visible handle as anchor and the same row selection just dispatched (deferred to a microtask)', async () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);
    embedInViewDom(view, wrapper, TEST_TABLE_FROM);
    const onMenuChange = vi.fn();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => onMenuChange);

    hoverBodyCell(wrapper, table, 1, 0);
    click(wrapper.querySelector('.cm-table-row-handle-hit')!);
    expect(onMenuChange).not.toHaveBeenCalled(); // deferred — see attachTableHandleOverlay's own doc comment on the row click handler
    await Promise.resolve();

    expect(onMenuChange).toHaveBeenCalledExactlyOnceWith({
      anchor: wrapper.querySelector('.cm-table-row-handle'),
      selection: { kind: 'row', tableFrom: TEST_TABLE_FROM, rowIndex: 2 },
    });
  });

  it('switching from a column handle to a row handle calls the menu-change callback again with the new row selection (no explicit close in between)', async () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);
    embedInViewDom(view, wrapper, TEST_TABLE_FROM);
    const onMenuChange = vi.fn();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => onMenuChange);

    hoverBodyCell(wrapper, table, 0, 1);
    click(wrapper.querySelector('.cm-table-column-handle-hit')!);
    onMenuChange.mockClear();

    hoverBodyCell(wrapper, table, 0, 0);
    click(wrapper.querySelector('.cm-table-row-handle-hit')!);
    await Promise.resolve();

    expect(onMenuChange).toHaveBeenCalledExactlyOnceWith({
      anchor: wrapper.querySelector('.cm-table-row-handle'),
      selection: { kind: 'row', tableFrom: TEST_TABLE_FROM, rowIndex: 1 },
    });
  });

  it('does not call the menu-change callback when a handle is clicked with nothing hovered/tracked yet', async () => {
    const { view, controller } = mountRootView();
    const { wrapper } = buildTable(2, 3);
    embedInViewDom(view, wrapper, TEST_TABLE_FROM);
    const onMenuChange = vi.fn();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => onMenuChange);

    click(wrapper.querySelector('.cm-table-column-handle-hit')!);
    click(wrapper.querySelector('.cm-table-row-handle-hit')!);
    await Promise.resolve();

    expect(onMenuChange).not.toHaveBeenCalled();
  });

  it('never calls the menu-change callback from hover alone — only an actual click opens/updates the menu', () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);
    embedInViewDom(view, wrapper, TEST_TABLE_FROM);
    const onMenuChange = vi.fn();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => onMenuChange);

    hoverBodyCell(wrapper, table, 0, 0);

    expect(onMenuChange).not.toHaveBeenCalled();
  });
});

describe('attachTableHandleOverlay — drag-to-reorder gesture', () => {
  /** A root view whose real document is an actual Markdown table (unlike `mountRootView`'s throwaway doc) — needed here because a completed drag dispatches a real `moveSelectedRowToIndex`/`moveSelectedColumnToIndex` transaction against `view.state`, not just a `TableSelection` value. `history()` is installed so undo/redo can be exercised. */
  function mountRootViewWithTable(doc: string): { view: EditorView; controller: TableActiveCellController } {
    const controller = new TableActiveCellController();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({ doc, extensions: [markdownLanguageExtension(), tableSelectionField, tableSelectionDeletionHistory(), history()] }),
      parent,
    });
    mountedViews.push(view);
    return { view, controller };
  }

  const FOUR_ROWS = '| Name | Role |\n| --- | --- |\n| A | 1 |\n| B | 2 |\n| C | 3 |';

  /** Distinct, non-zero rects for every row (header + 3 body), 40px tall each starting at `top`, so `resolveRowTargetIndex`'s own nearest-midpoint search has real geometry to work with — jsdom's default all-zero rects would make every row equidistant. Row `i`'s own midpoint is `top + i * 40 + 20`. */
  function mockRowRects(table: HTMLTableElement, top = 0): void {
    for (let i = 0; i < table.rows.length; i++) {
      const row = table.rows[i]!;
      const rowTop = top + i * 40;
      row.getBoundingClientRect = () => ({ top: rowTop, height: 40, bottom: rowTop + 40, left: 0, right: 0, width: 0, x: 0, y: rowTop, toJSON: () => ({}) }) as DOMRect;
    }
  }

  function mockWrapperRect(wrapper: HTMLElement, rect: { top: number; left: number; width: number; height: number }): void {
    wrapper.getBoundingClientRect = () =>
      ({ top: rect.top, left: rect.left, width: rect.width, height: rect.height, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) }) as DOMRect;
  }

  function hoverBodyCell(wrapper: HTMLElement, table: HTMLTableElement, rowIndexInBody: number, columnIndex: number): void {
    const row = table.querySelectorAll('tbody tr')[rowIndexInBody]!;
    const cell = row.children[columnIndex]!;
    const event = new Event('pointermove', { bubbles: true });
    Object.defineProperty(event, 'target', { value: cell });
    wrapper.dispatchEvent(event);
  }

  /** `pointerdown`/`pointermove`/`pointerup` dispatched as plain `MouseEvent`s carrying `clientX`/`clientY`/`button` — jsdom event dispatch matches listeners by the event's own `type` string, not its constructor, and `handlePointerDown`/`handlePointerMove` (`tableHandleOverlay.ts`) only ever read those three properties, all present on `MouseEvent` too, so this is a faithful stand-in for a real `PointerEvent` without depending on this jsdom version's own support for that constructor. */
  function pointer(type: string, el: EventTarget, x: number, y: number): void {
    el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
  }

  function click(el: Element): void {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }

  /** Same re-parenting `embedInViewDom` (the "opening the handle menu" describe block, above) uses — needed only by the two tests below that check whether the menu-change callback fires, since that path re-resolves its own anchor from `view.dom`. */
  function embedInViewDom(view: EditorView, wrapper: HTMLElement, tableFromValue: number): void {
    const widget = document.createElement('div');
    widget.className = 'cm-table-widget';
    widget.dataset.tableFrom = String(tableFromValue);
    widget.appendChild(wrapper);
    view.dom.appendChild(widget);
  }

  it('dragging a body row down past the threshold moves it, and the moved row remains selected', () => {
    const { view, controller } = mountRootViewWithTable(FOUR_ROWS);
    const { wrapper, table } = buildTable(3, 2);
    mockRowRects(table);
    attachTableHandleOverlay(wrapper, 2, view, controller, TEST_TABLE_FROM, null, null, () => undefined);

    hoverBodyCell(wrapper, table, 0, 0); // "A" row -> rowIndex 1
    const rowHit = wrapper.querySelector('.cm-table-row-handle-hit')!;
    pointer('pointerdown', rowHit, 10, 60); // row 1's own midpoint (top 40 + 20)
    pointer('pointermove', document, 10, 140); // row 3's own midpoint (top 120 + 20) — well past the threshold

    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 140, button: 0, bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| B | 2 |\n| C | 3 |\n| A | 1 |');
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: TEST_TABLE_FROM, rowIndex: 3 });
  });

  it('dragging the header row down promotes the row it lands on top of, and the header remains selected at its new (demoted) index', () => {
    const { view, controller } = mountRootViewWithTable(FOUR_ROWS);
    const { wrapper, table } = buildTable(3, 2);
    mockRowRects(table);
    attachTableHandleOverlay(wrapper, 2, view, controller, TEST_TABLE_FROM, null, null, () => undefined);

    const headerCell = table.querySelector('thead th')!;
    const hoverEvent = new Event('pointermove', { bubbles: true });
    Object.defineProperty(hoverEvent, 'target', { value: headerCell });
    wrapper.dispatchEvent(hoverEvent); // rowIndex 0

    const rowHit = wrapper.querySelector('.cm-table-row-handle-hit')!;
    pointer('pointerdown', rowHit, 10, 20); // row 0's own midpoint
    pointer('pointermove', document, 10, 100); // row 2's own midpoint

    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 100, button: 0, bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe('| A | 1 |\n| --- | --- |\n| B | 2 |\n| Name | Role |\n| C | 3 |');
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: TEST_TABLE_FROM, rowIndex: 2 });
  });

  it('a drag that never crosses the threshold does not move anything, and the ordinary click that follows still opens the menu', async () => {
    const { view, controller } = mountRootViewWithTable(FOUR_ROWS);
    const { wrapper, table } = buildTable(3, 2);
    mockRowRects(table);
    embedInViewDom(view, wrapper, TEST_TABLE_FROM);
    const onMenuChange = vi.fn();
    attachTableHandleOverlay(wrapper, 2, view, controller, TEST_TABLE_FROM, null, null, () => onMenuChange);

    hoverBodyCell(wrapper, table, 0, 0); // rowIndex 1
    const rowHit = wrapper.querySelector('.cm-table-row-handle-hit')!;
    pointer('pointerdown', rowHit, 10, 60);
    pointer('pointermove', document, 11, 61); // 1px jitter, under DRAG_THRESHOLD_PX
    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 11, clientY: 61, button: 0, bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe(FOUR_ROWS); // untouched — no drag ever started

    click(rowHit);
    // The row click handler's own menu-open call is deferred to a
    // microtask (see `attachTableHandleOverlay`'s own row-click doc
    // comment) — awaiting one lets it run before asserting.
    await Promise.resolve();

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: TEST_TABLE_FROM, rowIndex: 1 });
    expect(onMenuChange).toHaveBeenCalledOnce(); // the ordinary click still opens the menu, exactly as before
  });

  it('a completed drag never opens the handle menu, and the click that follows it is suppressed', () => {
    const { view, controller } = mountRootViewWithTable(FOUR_ROWS);
    const { wrapper, table } = buildTable(3, 2);
    mockRowRects(table);
    embedInViewDom(view, wrapper, TEST_TABLE_FROM);
    const onMenuChange = vi.fn();
    attachTableHandleOverlay(wrapper, 2, view, controller, TEST_TABLE_FROM, null, null, () => onMenuChange);

    hoverBodyCell(wrapper, table, 0, 0); // rowIndex 1
    const rowHit = wrapper.querySelector('.cm-table-row-handle-hit')!;
    pointer('pointerdown', rowHit, 10, 60);
    pointer('pointermove', document, 10, 140);
    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 140, button: 0, bubbles: true, cancelable: true }));
    expect(onMenuChange).not.toHaveBeenCalled();

    // The browser's own trailing `click` (mousedown+mouseup both landed on
    // `rowHit`) — must be swallowed, not treated as a fresh ordinary click.
    click(rowHit);

    expect(onMenuChange).not.toHaveBeenCalled();
  });

  it('dragging back to the same row is a no-op: the document is unchanged, but the row is still selected', () => {
    const { view, controller } = mountRootViewWithTable(FOUR_ROWS);
    const { wrapper, table } = buildTable(3, 2);
    mockRowRects(table);
    attachTableHandleOverlay(wrapper, 2, view, controller, TEST_TABLE_FROM, null, null, () => undefined);

    hoverBodyCell(wrapper, table, 1, 0); // "B" row -> rowIndex 2
    const rowHit = wrapper.querySelector('.cm-table-row-handle-hit')!;
    pointer('pointerdown', rowHit, 10, 100); // row 2's own midpoint
    pointer('pointermove', document, 10, 140); // drag away, past the threshold...
    pointer('pointermove', document, 10, 100); // ...then back to the exact same row

    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 100, button: 0, bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe(FOUR_ROWS);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: TEST_TABLE_FROM, rowIndex: 2 });
  });

  it('a completed drag reorder is exactly one undo step', () => {
    const { view, controller } = mountRootViewWithTable(FOUR_ROWS);
    const { wrapper, table } = buildTable(3, 2);
    mockRowRects(table);
    attachTableHandleOverlay(wrapper, 2, view, controller, TEST_TABLE_FROM, null, null, () => undefined);
    const depthBefore = undoDepth(view.state);

    hoverBodyCell(wrapper, table, 0, 0); // rowIndex 1
    const rowHit = wrapper.querySelector('.cm-table-row-handle-hit')!;
    pointer('pointerdown', rowHit, 10, 60);
    pointer('pointermove', document, 10, 140);
    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 140, button: 0, bubbles: true, cancelable: true }));

    expect(undoDepth(view.state)).toBe(depthBefore + 1);
  });

  it('column drag: dragging the first column past the threshold moves it to the target column', () => {
    const doc = '| A | B | C |\n| --- | --- | --- |\n| a | b | c |';
    const { view, controller } = mountRootViewWithTable(doc);
    const { wrapper, table } = buildTable(1, 3);
    mockWrapperRect(wrapper, { top: 0, left: 0, width: 300, height: 100 }); // 3 columns, 100px each
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => undefined);

    hoverBodyCell(wrapper, table, 0, 0); // "a" cell -> columnIndex 0
    const columnHit = wrapper.querySelector('.cm-table-column-handle-hit')!;
    pointer('pointerdown', columnHit, 50, 10); // column 0's own midpoint
    pointer('pointermove', document, 250, 10); // column 2's own midpoint

    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 250, clientY: 10, button: 0, bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe('| B | C | A |\n| --- | --- | --- |\n| b | c | a |');
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: TEST_TABLE_FROM, columnIndex: 2 });
  });

  it('a drag beginning while a cell is active deactivates it (no lingering nested editor)', () => {
    const { view, controller } = mountRootViewWithTable(FOUR_ROWS);
    const { wrapper, table } = buildTable(3, 2);
    mockRowRects(table);
    attachTableHandleOverlay(wrapper, 2, view, controller, TEST_TABLE_FROM, null, null, () => undefined);
    const container = document.createElement('div');
    document.body.appendChild(container);
    controller.activate(view, container, 0, 4, 0);
    expect(controller.activeAnchor).not.toBeNull();

    hoverBodyCell(wrapper, table, 0, 0);
    const rowHit = wrapper.querySelector('.cm-table-row-handle-hit')!;
    pointer('pointerdown', rowHit, 10, 60);
    pointer('pointermove', document, 10, 140); // crosses the threshold

    expect(controller.activeAnchor).toBeNull();
    expect(controller.nestedView!.dom.parentElement).toBeNull();

    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 140, button: 0, bubbles: true, cancelable: true }));
  });
});
