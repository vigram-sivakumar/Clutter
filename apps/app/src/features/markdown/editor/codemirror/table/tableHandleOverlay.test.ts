// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { TableActiveCellController } from './tableActiveCellController';
import { attachTableHandleOverlay, resolveHoveredCell } from './tableHandleOverlay';
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
  attachTableHandleOverlay(wrapper, columnCount, view, controller, TEST_TABLE_FROM, null, null);
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

    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, 1, null);

    expect(columnVisible(wrapper)).toBe(true);
    expect(rowVisible(wrapper)).toBe(false);
  });

  it('a selected row shows its handle even with no hover at all (fresh attach, never hovered)', async () => {
    const { view, controller } = mountRootView();
    const { wrapper } = buildTable(2, 3);

    // Native `rowIndex` convention (header = 0) — row 1 is the first body row.
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, 1);
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

    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, 1);
    await Promise.resolve();

    expect(rowVisible(wrapper)).toBe(true);
    // (150 - 100) + 40/2 = 70 — the row's own actual midpoint, not 0.
    expect((wrapper.querySelector('.cm-table-row-handle') as HTMLElement).style.top).toBe('70px');
  });

  it('a selected header row (rowIndex 0) shows its handle even with no hover at all — the header is a selectable row like any other', async () => {
    const { view, controller } = mountRootView();
    const { wrapper } = buildTable(2, 3);

    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, 0);
    await Promise.resolve();

    expect(rowVisible(wrapper)).toBe(true);
    expect(columnVisible(wrapper)).toBe(false);
  });

  it('switching selection from a column to the header row shows the row handle at the header and hides the column handle (simulates the TableWidget rebuild a kind change triggers)', async () => {
    const before = mountRootView();
    const beforeTable = buildTable(2, 3);
    attachTableHandleOverlay(beforeTable.wrapper, 3, before.view, before.controller, TEST_TABLE_FROM, 1, null);
    expect(columnVisible(beforeTable.wrapper)).toBe(true);

    // A fresh `attachTableHandleOverlay` call against a fresh wrapper is
    // exactly what a `TableSelection` kind change produces in the real
    // app — a new `TableWidget.toDOM()` call, per that file's own doc
    // comment — `selectedColumnIndex` now `null`, `selectedRowIndex` now
    // `0` (the header).
    const after = mountRootView();
    const afterTable = buildTable(2, 3);
    attachTableHandleOverlay(afterTable.wrapper, 3, after.view, after.controller, TEST_TABLE_FROM, null, 0);
    await Promise.resolve();

    expect(rowVisible(afterTable.wrapper)).toBe(true);
    expect(columnVisible(afterTable.wrapper)).toBe(false);
  });

  it('switching selection from the header row to a body row shows the row handle at the new row (simulates the TableWidget rebuild a kind change triggers)', async () => {
    const before = mountRootView();
    const beforeTable = buildTable(2, 3);
    attachTableHandleOverlay(beforeTable.wrapper, 3, before.view, before.controller, TEST_TABLE_FROM, null, 0);
    await Promise.resolve();
    expect(rowVisible(beforeTable.wrapper)).toBe(true);

    const after = mountRootView();
    const afterTable = buildTable(2, 3);
    attachTableHandleOverlay(afterTable.wrapper, 3, after.view, after.controller, TEST_TABLE_FROM, null, 1);
    await Promise.resolve();

    expect(rowVisible(afterTable.wrapper)).toBe(true);
    expect(columnVisible(afterTable.wrapper)).toBe(false);
  });

  it('hovering a different column still shows it (hover takes over the shared element); leaving hover falls back to the selected column', () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, 0, null);

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
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, 1);

    const bodyCell = table.querySelectorAll('tbody td')[1]!;
    hoverCell(wrapper, bodyCell);
    expect(rowVisible(wrapper)).toBe(true);

    wrapper.dispatchEvent(new Event('pointerleave'));

    expect(rowVisible(wrapper)).toBe(true); // still visible — row 1 is selected, not just hovered
  });

  it('hovering the header row falls back to the selected row handle instead of hiding it (header never gets a row handle of its own)', () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, 1);

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
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null);

    hoverBodyCell(wrapper, table, 0, 2);
    click(wrapper.querySelector('.cm-table-column-handle-hit')!);

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: TEST_TABLE_FROM, columnIndex: 2 });
  });

  it('clicking the row handle sets a row TableSelection using the native rowIndex (header + body combined)', () => {
    const { wrapper, table } = buildTable(2, 3);
    const { view, controller } = mountRootView();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null);

    const row = hoverBodyCell(wrapper, table, 1, 0); // second body row -> rowIndex 2 (header=0, first body=1)
    click(wrapper.querySelector('.cm-table-row-handle-hit')!);

    expect(row.rowIndex).toBe(2);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: TEST_TABLE_FROM, rowIndex: 2 });
  });

  it('a click on the column/row handle never modifies the document or the root selection', () => {
    const { wrapper, table } = buildTable(2, 3);
    const { view, controller } = mountRootView();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null);
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
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null);
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
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null);

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
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null);

    click(wrapper.querySelector('.cm-table-column-handle-hit')!);
    click(wrapper.querySelector('.cm-table-row-handle-hit')!);

    expect(view.state.field(tableSelectionField)).toBeNull();
  });
});
