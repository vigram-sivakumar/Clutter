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

/** Hover-only tests don't care about the view/controller `attachTableHandleOverlay` also requires for its click-dispatch wiring — this wraps a throwaway pair so each hover test doesn't have to. */
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

  it('resolves the target from a descendant of the cell (e.g. a handle it hosts), not just the cell itself', () => {
    const { wrapper, table } = buildTable(1, 2);
    const cell = table.querySelector('tbody td')!;
    const innerHandle = document.createElement('div');
    innerHandle.className = 'cm-table-row-handle-hit';
    cell.appendChild(innerHandle);

    const result = resolveHoveredCell(wrapper, innerHandle);

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

describe('attachTableHandleOverlay — DOM ownership: one handle per column, one per row', () => {
  it('creates exactly one column-handle pair per header cell — never in a body cell', () => {
    const { wrapper, table } = buildTable(2, 3);
    attach(wrapper, 3);

    expect(wrapper.querySelectorAll('.cm-table-column-handle')).toHaveLength(3);
    table.querySelectorAll('thead th').forEach((th) => {
      expect(th.querySelectorAll(':scope > .cm-table-column-handle-hit')).toHaveLength(1);
      expect(th.querySelectorAll(':scope > .cm-table-column-handle')).toHaveLength(1);
    });
    table.querySelectorAll('tbody td').forEach((td) => {
      expect(td.querySelectorAll('.cm-table-column-handle-hit')).toHaveLength(0);
    });
  });

  it('creates exactly one row-handle pair per row, hosted in that row\'s own first cell (header included)', () => {
    const { wrapper, table } = buildTable(2, 3);
    attach(wrapper, 3);

    expect(wrapper.querySelectorAll('.cm-table-row-handle')).toHaveLength(3); // header + 2 body rows
    table.querySelectorAll('tr').forEach((row) => {
      const firstCell = row.children[0]!;
      expect(firstCell.querySelectorAll(':scope > .cm-table-row-handle-hit')).toHaveLength(1);
      Array.from(row.children)
        .slice(1)
        .forEach((cell) => {
          expect(cell.querySelectorAll(':scope > .cm-table-row-handle-hit')).toHaveLength(0);
        });
    });
  });

  it('the top-left header cell owns both its own column handle (column 0) and its own row handle (row 0)', () => {
    const { wrapper, table } = buildTable(2, 3);
    attach(wrapper, 3);

    const topLeft = table.querySelector('thead th')!;
    expect(topLeft.querySelectorAll(':scope > .cm-table-column-handle-hit')).toHaveLength(1);
    expect(topLeft.querySelectorAll(':scope > .cm-table-row-handle-hit')).toHaveLength(1);
  });

  it('every handle starts hidden', () => {
    const { wrapper } = buildTable(2, 2);
    attach(wrapper, 2);

    wrapper.querySelectorAll('.cm-table-column-handle, .cm-table-row-handle').forEach((el) => {
      expect(el.classList.contains('cm-table-handle-visible')).toBe(false);
    });
  });

  it('does not duplicate the drop indicators — exactly one column and one row drop indicator, at the wrapper level', () => {
    const { wrapper } = buildTable(2, 3);
    attach(wrapper, 3);

    expect(wrapper.querySelectorAll(':scope > .cm-table-column-drop-indicator')).toHaveLength(1);
    expect(wrapper.querySelectorAll(':scope > .cm-table-row-drop-indicator')).toHaveLength(1);
  });
});

describe('attachTableHandleOverlay — hover show/hide wiring', () => {
  it('hovering a body cell shows that column\'s own handle (in the header) and that row\'s own handle (in its first cell)', () => {
    const { wrapper, table } = buildTable(2, 2);
    attach(wrapper, 2);

    const bodyCell = table.querySelectorAll('tbody td')[1]!; // row 2 (first body row), column 1
    const event = new Event('pointermove', { bubbles: true });
    Object.defineProperty(event, 'target', { value: bodyCell });
    wrapper.dispatchEvent(event);

    const headerCellForColumn1 = table.querySelector('thead th:nth-child(2)')!;
    expect(headerCellForColumn1.querySelector('.cm-table-column-handle')!.classList.contains('cm-table-handle-visible')).toBe(true);
    const firstCellOfRow = table.querySelectorAll('tbody tr')[0]!.children[0]!;
    expect(firstCellOfRow.querySelector('.cm-table-row-handle')!.classList.contains('cm-table-handle-visible')).toBe(true);
  });

  it('hovering a header cell shows both the column handle (its own) and the row handle (row 0) — the header is a selectable row like any other', () => {
    const { wrapper, table } = buildTable(2, 2);
    attach(wrapper, 2);

    const headerCell = table.querySelector('thead th')!;
    const event = new Event('pointermove', { bubbles: true });
    Object.defineProperty(event, 'target', { value: headerCell });
    wrapper.dispatchEvent(event);

    expect(headerCell.querySelector('.cm-table-column-handle')!.classList.contains('cm-table-handle-visible')).toBe(true);
    expect(headerCell.querySelector('.cm-table-row-handle')!.classList.contains('cm-table-handle-visible')).toBe(true);
  });

  it('moving outside the table (pointerleave) hides both handles', () => {
    const { wrapper, table } = buildTable(2, 2);
    attach(wrapper, 2);

    const bodyCell = table.querySelectorAll('tbody td')[0]!;
    const moveEvent = new Event('pointermove', { bubbles: true });
    Object.defineProperty(moveEvent, 'target', { value: bodyCell });
    wrapper.dispatchEvent(moveEvent);
    expect(wrapper.querySelectorAll('.cm-table-column-handle.cm-table-handle-visible')).toHaveLength(1);

    wrapper.dispatchEvent(new Event('pointerleave', { bubbles: true }));

    expect(wrapper.querySelectorAll('.cm-table-column-handle.cm-table-handle-visible')).toHaveLength(0);
    expect(wrapper.querySelectorAll('.cm-table-row-handle.cm-table-handle-visible')).toHaveLength(0);
  });

  it('regression: a pointermove that lands on a handle\'s own hit-area (a descendant of its owning cell) keeps it visible, no flicker', () => {
    const { wrapper, table } = buildTable(2, 2);
    attach(wrapper, 2);

    const headerCell = table.querySelector('thead th')!;
    const onCell = new Event('pointermove', { bubbles: true });
    Object.defineProperty(onCell, 'target', { value: headerCell });
    wrapper.dispatchEvent(onCell);
    expect(headerCell.querySelector('.cm-table-column-handle')!.classList.contains('cm-table-handle-visible')).toBe(true);

    const onHitArea = new Event('pointermove', { bubbles: true });
    const hitArea = headerCell.querySelector('.cm-table-column-handle-hit')!;
    Object.defineProperty(onHitArea, 'target', { value: hitArea });
    wrapper.dispatchEvent(onHitArea);

    expect(headerCell.querySelector('.cm-table-column-handle')!.classList.contains('cm-table-handle-visible')).toBe(true);
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

    expect(wrapper.querySelectorAll('.cm-table-column-handle.cm-table-handle-visible')).toHaveLength(0);
  });

  it("a mousedown on a handle's hit area is prevented and stopped (never reaches an ancestor listener)", () => {
    const { wrapper, table } = buildTable(1, 2);
    attach(wrapper, 2);

    let reachedAncestor = false;
    document.addEventListener('mousedown', () => {
      reachedAncestor = true;
    });

    const hitArea = table.querySelector('thead th .cm-table-column-handle-hit')!;
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

  function visibleColumnHandles(wrapper: HTMLElement): Element[] {
    return Array.from(wrapper.querySelectorAll('.cm-table-column-handle.cm-table-handle-visible'));
  }

  function visibleRowHandles(wrapper: HTMLElement): Element[] {
    return Array.from(wrapper.querySelectorAll('.cm-table-row-handle.cm-table-handle-visible'));
  }

  it('a selected column shows its handle (in the header) even with no hover at all', () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);

    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, 1, null, () => undefined);

    const visible = visibleColumnHandles(wrapper);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.parentElement).toBe(table.querySelector('thead th:nth-child(2)'));
    expect(visibleRowHandles(wrapper)).toHaveLength(0);
  });

  it('a selected row shows its handle (in that row\'s own first cell) even with no hover at all', () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);

    // Native `rowIndex` convention (header = 0) — row 1 is the first body row.
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, 1, () => undefined);

    const visible = visibleRowHandles(wrapper);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.parentElement).toBe(table.querySelectorAll('tbody tr')[0]!.children[0]);
    expect(visibleColumnHandles(wrapper)).toHaveLength(0);
  });

  it('a selected header row (rowIndex 0) shows its handle even with no hover at all — the header is a selectable row like any other', () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);

    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, 0, () => undefined);

    const visible = visibleRowHandles(wrapper);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.parentElement).toBe(table.querySelector('thead th'));
    expect(visibleColumnHandles(wrapper)).toHaveLength(0);
  });

  it('switching selection from a column to the header row shows the row handle at the header and hides the column handle (simulates the TableWidget rebuild a kind change triggers)', () => {
    const before = mountRootView();
    const beforeTable = buildTable(2, 3);
    attachTableHandleOverlay(beforeTable.wrapper, 3, before.view, before.controller, TEST_TABLE_FROM, 1, null, () => undefined);
    expect(visibleColumnHandles(beforeTable.wrapper)).toHaveLength(1);

    // A fresh `attachTableHandleOverlay` call against a fresh wrapper is
    // exactly what a `TableSelection` kind change produces in the real
    // app — a new `TableWidget.toDOM()` call — `selectedColumnIndex` now
    // `null`, `selectedRowIndex` now `0` (the header).
    const after = mountRootView();
    const afterTable = buildTable(2, 3);
    attachTableHandleOverlay(afterTable.wrapper, 3, after.view, after.controller, TEST_TABLE_FROM, null, 0, () => undefined);

    expect(visibleRowHandles(afterTable.wrapper)).toHaveLength(1);
    expect(visibleColumnHandles(afterTable.wrapper)).toHaveLength(0);
  });

  it('hovering a different column shows it; leaving hover falls back to the selected column\'s own header handle', () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, 0, null, () => undefined);

    const otherCell = table.querySelectorAll('tbody td')[2]!; // column 2
    hoverCell(wrapper, otherCell);
    expect(visibleColumnHandles(wrapper)[0]!.parentElement).toBe(table.querySelector('thead th:nth-child(3)'));

    wrapper.dispatchEvent(new Event('pointerleave'));

    expect(visibleColumnHandles(wrapper)[0]!.parentElement).toBe(table.querySelector('thead th:nth-child(1)'));
  });

  it('moving the pointer away from the table entirely still leaves the selected row handle visible on its own first cell', () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, 1, () => undefined);

    const bodyCell = table.querySelectorAll('tbody td')[1]!;
    hoverCell(wrapper, bodyCell);
    expect(visibleRowHandles(wrapper)).toHaveLength(1);

    wrapper.dispatchEvent(new Event('pointerleave'));

    expect(visibleRowHandles(wrapper)).toHaveLength(1); // still visible — row 1 is selected, not just hovered
    expect(visibleRowHandles(wrapper)[0]!.parentElement).toBe(table.querySelectorAll('tbody tr')[0]!.children[0]);
  });

  it('with no selection at all, leaving hover hides the handle exactly as before this fix', () => {
    const { wrapper, table } = buildTable(2, 3);
    attach(wrapper, 3);

    const bodyCell = table.querySelectorAll('tbody td')[1]!;
    hoverCell(wrapper, bodyCell);
    expect(visibleColumnHandles(wrapper)).toHaveLength(1);
    expect(visibleRowHandles(wrapper)).toHaveLength(1);

    wrapper.dispatchEvent(new Event('pointerleave'));

    expect(visibleColumnHandles(wrapper)).toHaveLength(0);
    expect(visibleRowHandles(wrapper)).toHaveLength(0);
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
    click(table.querySelector('thead th:nth-child(3) .cm-table-column-handle-hit')!);

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: TEST_TABLE_FROM, columnIndex: 2 });
  });

  it('clicking the row handle sets a row TableSelection using the native rowIndex (header + body combined)', () => {
    const { wrapper, table } = buildTable(2, 3);
    const { view, controller } = mountRootView();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => undefined);

    const row = hoverBodyCell(wrapper, table, 1, 0); // second body row -> rowIndex 2
    click(row.children[0]!.querySelector('.cm-table-row-handle-hit')!);

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
    click(table.querySelector('thead th:nth-child(2) .cm-table-column-handle-hit')!);

    expect(view.state.doc.toString()).toBe(docBefore);
    expect(view.state.selection.main.from).toBe(selectionBefore.from);
    expect(view.state.selection.main.to).toBe(selectionBefore.to);
  });

  it('a click on the column/row handle collapses a stale non-empty root selection, in the same transaction as the TableSelection dispatch', () => {
    const { wrapper, table } = buildTable(2, 3);
    const { view, controller } = mountRootView();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => undefined);
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    expect(view.state.selection.main.empty).toBe(false);
    const dispatchSpy = vi.spyOn(view, 'dispatch');

    hoverBodyCell(wrapper, table, 0, 1);
    click(table.querySelector('thead th:nth-child(2) .cm-table-column-handle-hit')!);

    expect(view.state.selection.main.empty).toBe(true);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: TEST_TABLE_FROM, columnIndex: 1 });
    const dispatchesWithSelection = dispatchSpy.mock.calls.filter((args) => {
      const spec = args[0];
      return !Array.isArray(spec) && !!spec && typeof spec === 'object' && 'selection' in spec;
    });
    expect(dispatchesWithSelection).toHaveLength(1);
    expect((dispatchesWithSelection[0]![0] as { effects?: unknown }).effects).toBeDefined();
  });

  it('a row handle click collapses a stale non-empty root selection the same way the column handle does', () => {
    const { wrapper, table } = buildTable(2, 3);
    const { view, controller } = mountRootView();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => undefined);
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });

    const row = hoverBodyCell(wrapper, table, 0, 0);
    click(row.children[0]!.querySelector('.cm-table-row-handle-hit')!);

    expect(view.state.selection.main.empty).toBe(true);
    expect(view.state.field(tableSelectionField)?.kind).toBe('row');
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
    click(table.querySelector('thead th .cm-table-column-handle-hit')!);

    expect(controller.activeAnchor).toBeNull();
    expect(controller.nestedView!.dom.parentElement).toBeNull();
  });

  it("clicking the header row's own row handle selects it — rowIndex 0, a valid TableSelection.row like any other", () => {
    const { wrapper, table } = buildTable(2, 3);
    const { view, controller } = mountRootView();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => undefined);

    const headerCell = table.querySelector('thead th')!;
    click(headerCell.querySelector('.cm-table-row-handle-hit')!);

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: TEST_TABLE_FROM, rowIndex: 0 });
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
   * appended into `view.dom` — the real `TableWidget.toDOM()` shape, needed
   * because the menu-open path re-resolves its own anchor from `view.dom`
   * after dispatching.
   */
  function embedInViewDom(view: EditorView, wrapper: HTMLElement, tableFromValue: number): void {
    const widget = document.createElement('div');
    widget.className = 'cm-table-widget';
    widget.dataset.tableFrom = String(tableFromValue);
    widget.appendChild(wrapper);
    view.dom.appendChild(widget);
  }

  it('clicking a column handle calls the menu-change callback with that column\'s own fresh header handle as anchor', () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);
    embedInViewDom(view, wrapper, TEST_TABLE_FROM);
    const onMenuChange = vi.fn();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => onMenuChange);

    hoverBodyCell(wrapper, table, 0, 2);
    click(table.querySelector('thead th:nth-child(3) .cm-table-column-handle-hit')!);

    expect(onMenuChange).toHaveBeenCalledExactlyOnceWith({
      anchor: table.querySelector('thead th:nth-child(3) .cm-table-column-handle'),
      selection: { kind: 'column', tableFrom: TEST_TABLE_FROM, columnIndex: 2 },
    });
  });

  it('clicking a row handle calls the menu-change callback synchronously (no deferral needed — position is pure CSS now)', () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);
    embedInViewDom(view, wrapper, TEST_TABLE_FROM);
    const onMenuChange = vi.fn();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => onMenuChange);

    hoverBodyCell(wrapper, table, 1, 0);
    const row = table.querySelectorAll('tbody tr')[1]!;
    click(row.children[0]!.querySelector('.cm-table-row-handle-hit')!);

    expect(onMenuChange).toHaveBeenCalledExactlyOnceWith({
      anchor: row.children[0]!.querySelector('.cm-table-row-handle'),
      selection: { kind: 'row', tableFrom: TEST_TABLE_FROM, rowIndex: 2 },
    });
  });

  it('switching from a column handle to a row handle calls the menu-change callback again with the new row selection (no explicit close in between)', () => {
    const { view, controller } = mountRootView();
    const { wrapper, table } = buildTable(2, 3);
    embedInViewDom(view, wrapper, TEST_TABLE_FROM);
    const onMenuChange = vi.fn();
    attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => onMenuChange);

    hoverBodyCell(wrapper, table, 0, 1);
    click(table.querySelector('thead th:nth-child(2) .cm-table-column-handle-hit')!);
    onMenuChange.mockClear();

    hoverBodyCell(wrapper, table, 0, 0);
    const row = table.querySelectorAll('tbody tr')[0]!;
    click(row.children[0]!.querySelector('.cm-table-row-handle-hit')!);

    expect(onMenuChange).toHaveBeenCalledExactlyOnceWith({
      anchor: row.children[0]!.querySelector('.cm-table-row-handle'),
      selection: { kind: 'row', tableFrom: TEST_TABLE_FROM, rowIndex: 1 },
    });
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

  /** `pointerdown`/`pointermove`/`pointerup` dispatched as plain `MouseEvent`s carrying `clientX`/`clientY`/`button` — jsdom event dispatch matches listeners by the event's own `type` string, not its constructor, and the handlers here only ever read those three properties, all present on `MouseEvent` too, so this is a faithful stand-in for a real `PointerEvent` without depending on this jsdom version's own support for that constructor. */
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
    const row = table.querySelectorAll('tbody tr')[0]!;
    const rowHit = row.children[0]!.querySelector('.cm-table-row-handle-hit')!;
    pointer('pointerdown', rowHit, 10, 60); // row 1's own midpoint (top 40 + 20)
    // Target = whichever row's own *body* the pointer is inside (never a
    // coordinate/midpoint search) — dispatched from row "C"'s own cell so
    // `event.target` resolves there, landing the drag immediately after it.
    pointer('pointermove', table.querySelectorAll('tbody tr')[2]!.children[0]!, 10, 140);

    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 140, button: 0, bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| B | 2 |\n| C | 3 |\n| A | 1 |');
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: TEST_TABLE_FROM, rowIndex: 3 });
  });

  it('the row drop indicator spans the table\'s own actual rendered width, never the wrapper\'s full width — a table narrower than its wrapper (an explicit, persisted table width) must not draw the indicator past its own right edge', () => {
    const { view, controller } = mountRootViewWithTable(FOUR_ROWS);
    const { wrapper, table } = buildTable(3, 2);
    mockRowRects(table);
    mockWrapperRect(wrapper, { top: 0, left: 0, width: 600, height: 160 });
    table.getBoundingClientRect = () =>
      ({ top: 0, left: 40, width: 300, height: 160, right: 340, bottom: 160, x: 40, y: 0, toJSON: () => ({}) }) as DOMRect;
    attachTableHandleOverlay(wrapper, 2, view, controller, TEST_TABLE_FROM, null, null, () => undefined);

    hoverBodyCell(wrapper, table, 0, 0); // "A" row -> rowIndex 1
    const row = table.querySelectorAll('tbody tr')[0]!;
    const rowHit = row.children[0]!.querySelector('.cm-table-row-handle-hit')!;
    pointer('pointerdown', rowHit, 10, 60);
    pointer('pointermove', table.querySelectorAll('tbody tr')[2]!.children[0]!, 10, 140);

    const indicator = wrapper.querySelector('.cm-table-row-drop-indicator') as HTMLElement;
    expect(indicator.style.left).toBe('40px');
    expect(indicator.style.width).toBe('300px');

    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 140, button: 0, bubbles: true, cancelable: true }));
  });

  it('dragging the header row down promotes the row it lands on top of, and the header remains selected at its new (demoted) index', () => {
    const { view, controller } = mountRootViewWithTable(FOUR_ROWS);
    const { wrapper, table } = buildTable(3, 2);
    mockRowRects(table);
    attachTableHandleOverlay(wrapper, 2, view, controller, TEST_TABLE_FROM, null, null, () => undefined);

    const headerCell = table.querySelector('thead th')!;
    const rowHit = headerCell.querySelector('.cm-table-row-handle-hit')!;
    pointer('pointerdown', rowHit, 10, 20); // row 0's own midpoint
    // Target row "B"'s own body -> lands immediately after it.
    pointer('pointermove', table.querySelectorAll('tbody tr')[1]!.children[0]!, 10, 100);

    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 100, button: 0, bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe('| A | 1 |\n| --- | --- |\n| B | 2 |\n| Name | Role |\n| C | 3 |');
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: TEST_TABLE_FROM, rowIndex: 2 });
  });

  it('a drag that never crosses the threshold does not move anything, and the ordinary click that follows still opens the menu', () => {
    const { view, controller } = mountRootViewWithTable(FOUR_ROWS);
    const { wrapper, table } = buildTable(3, 2);
    mockRowRects(table);
    embedInViewDom(view, wrapper, TEST_TABLE_FROM);
    const onMenuChange = vi.fn();
    attachTableHandleOverlay(wrapper, 2, view, controller, TEST_TABLE_FROM, null, null, () => onMenuChange);

    hoverBodyCell(wrapper, table, 0, 0); // rowIndex 1
    const row = table.querySelectorAll('tbody tr')[0]!;
    const rowHit = row.children[0]!.querySelector('.cm-table-row-handle-hit')!;
    pointer('pointerdown', rowHit, 10, 60);
    pointer('pointermove', document, 11, 61); // 1px jitter, under DRAG_THRESHOLD_PX
    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 11, clientY: 61, button: 0, bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe(FOUR_ROWS); // untouched — no drag ever started

    click(rowHit);

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
    const row = table.querySelectorAll('tbody tr')[0]!;
    const rowHit = row.children[0]!.querySelector('.cm-table-row-handle-hit')!;
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
    const row = table.querySelectorAll('tbody tr')[1]!;
    const rowHit = row.children[0]!.querySelector('.cm-table-row-handle-hit')!;
    pointer('pointerdown', rowHit, 10, 100); // row 2's own midpoint
    pointer('pointermove', table.querySelectorAll('tbody tr')[2]!.children[0]!, 10, 140); // drag away, into row "C"'s own body...
    pointer('pointermove', row.children[0]!, 10, 100); // ...then back into the dragged row's own body (a genuine no-op target, not just an unresolved one)

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
    const row = table.querySelectorAll('tbody tr')[0]!;
    const rowHit = row.children[0]!.querySelector('.cm-table-row-handle-hit')!;
    pointer('pointerdown', rowHit, 10, 60);
    pointer('pointermove', table.querySelectorAll('tbody tr')[2]!.children[0]!, 10, 140);
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
    const columnHit = table.querySelector('thead th:nth-child(1) .cm-table-column-handle-hit')!;
    pointer('pointerdown', columnHit, 50, 10); // column 0's own midpoint
    // Target = whichever column's own *body* the pointer is inside —
    // dispatched from column "C"'s own body cell so `event.target`
    // resolves there, landing the drag immediately after it.
    pointer('pointermove', table.querySelectorAll('tbody tr')[0]!.children[2]!, 250, 10);

    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 250, clientY: 10, button: 0, bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe('| B | C | A |\n| --- | --- | --- |\n| b | c | a |');
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: TEST_TABLE_FROM, columnIndex: 2 });
  });

  /** Mocks a real header-cell rect per column, `width` wide each, starting at `left` — needed by the tests below that verify the drop indicator's own real-geometry positioning (never a `columnCount`-based percentage) under uneven/persisted column widths. */
  function mockHeaderCellRects(table: HTMLTableElement, widths: number[], left = 0): void {
    const headerRow = table.rows[0]!;
    let x = left;
    for (let i = 0; i < headerRow.children.length; i++) {
      const cellLeft = x;
      const width = widths[i]!;
      const cell = headerRow.children[i] as HTMLElement;
      cell.getBoundingClientRect = () =>
        ({ top: 0, height: 30, bottom: 30, left: cellLeft, right: cellLeft + width, width, x: cellLeft, y: 0, toJSON: () => ({}) }) as DOMRect;
      x += width;
    }
  }

  /** A stand-in for one of `tableColumnResizeHandle.ts`'s own `.cm-table-column-resize-hit` elements — real per-column-boundary hit-strips this milestone reuses as the divider's own neutral zone, rather than inventing a separate pixel threshold. Appended into `wrapper` (its real mount point is `.cm-table-scroll`, but these tests only need it to exist somewhere reachable via `closest()`, not to be laid out correctly). */
  function buildResizeHitStrip(wrapper: HTMLElement): HTMLElement {
    const hit = document.createElement('div');
    hit.className = 'cm-table-column-resize-hit';
    wrapper.appendChild(hit);
    return hit;
  }

  describe('column drag — target = the column body the pointer is inside, divider is a neutral zone', () => {
    const doc = '| A | B | C |\n| --- | --- | --- |\n| a | b | c |';

    function setUp(): { view: EditorView; controller: TableActiveCellController; wrapper: HTMLElement; table: HTMLTableElement } {
      const { view, controller } = mountRootViewWithTable(doc);
      const { wrapper, table } = buildTable(1, 3);
      mockWrapperRect(wrapper, { top: 0, left: 0, width: 300, height: 100 });
      mockHeaderCellRects(table, [100, 100, 100]);
      attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => undefined);
      return { view, controller, wrapper, table };
    }

    function beginColumnDrag(wrapper: HTMLElement, table: HTMLTableElement, startColumnIndex: number): void {
      hoverBodyCell(wrapper, table, 0, startColumnIndex);
      const columnHit = table.querySelectorAll('thead th')[startColumnIndex]!.querySelector('.cm-table-column-handle-hit')!;
      pointer('pointerdown', columnHit, 50, 10);
    }

    it('acceptance 1: dragging column 1 into column 2\'s body shows the indicator immediately after column 2', () => {
      const { wrapper, table } = setUp();
      beginColumnDrag(wrapper, table, 0); // dragging "A"

      pointer('pointermove', table.querySelectorAll('tbody tr')[0]!.children[1]!, 150, 10); // inside "B"'s own body

      const indicator = wrapper.querySelector('.cm-table-column-drop-indicator')!;
      expect(indicator.classList.contains('cm-table-handle-visible')).toBe(true);
      // Column B's own real right edge — 100 (left) + 100 (width) = 200.
      expect((indicator as HTMLElement).style.left).toBe('200px');
    });

    it('acceptance 2: continuing to move within column 2\'s own body keeps the indicator after column 2', () => {
      const { wrapper, table } = setUp();
      beginColumnDrag(wrapper, table, 0);
      const columnBCell = table.querySelectorAll('tbody tr')[0]!.children[1]!;

      pointer('pointermove', columnBCell, 110, 10); // left edge of B's own body
      const leftLeft = (wrapper.querySelector('.cm-table-column-drop-indicator') as HTMLElement).style.left;
      pointer('pointermove', columnBCell, 190, 10); // right edge of B's own body — same cell, same target

      expect((wrapper.querySelector('.cm-table-column-drop-indicator') as HTMLElement).style.left).toBe(leftLeft);
      expect(leftLeft).toBe('200px');
    });

    it('acceptance 3: moving onto the divider between column 2 and column 3 hides the indicator', () => {
      const { wrapper, table } = setUp();
      beginColumnDrag(wrapper, table, 0);
      pointer('pointermove', table.querySelectorAll('tbody tr')[0]!.children[1]!, 150, 10); // inside B, indicator visible
      expect(wrapper.querySelector('.cm-table-column-drop-indicator')!.classList.contains('cm-table-handle-visible')).toBe(true);

      const divider = buildResizeHitStrip(wrapper);
      pointer('pointermove', divider, 200, 10);

      expect(wrapper.querySelector('.cm-table-column-drop-indicator')!.classList.contains('cm-table-handle-visible')).toBe(false);
    });

    it('acceptance 4: entering column 3\'s own body after the divider shows the indicator after column 3', () => {
      const { wrapper, table } = setUp();
      beginColumnDrag(wrapper, table, 0);
      pointer('pointermove', buildResizeHitStrip(wrapper), 200, 10); // cross the divider first

      pointer('pointermove', table.querySelectorAll('tbody tr')[0]!.children[2]!, 250, 10); // into C's own body

      const indicator = wrapper.querySelector('.cm-table-column-drop-indicator')!;
      expect(indicator.classList.contains('cm-table-handle-visible')).toBe(true);
      expect((indicator as HTMLElement).style.left).toBe('300px'); // column C's own right edge: 200 + 100
    });

    it('acceptance 5: dragging column 2 into column 1\'s body shows the indicator after column 1', () => {
      const { wrapper, table } = setUp();
      beginColumnDrag(wrapper, table, 1); // dragging "B" — pointerdown is always at clientX 50

      pointer('pointermove', table.querySelectorAll('tbody tr')[0]!.children[0]!, 10, 10); // into A's own body (clientX must differ from the press position to cross DRAG_THRESHOLD_PX)

      const indicator = wrapper.querySelector('.cm-table-column-drop-indicator')!;
      expect(indicator.classList.contains('cm-table-handle-visible')).toBe(true);
      expect((indicator as HTMLElement).style.left).toBe('100px'); // column A's own right edge
    });

    it('acceptance 6: dragging column 3 into column 2\'s body shows the indicator after column 2', () => {
      const { wrapper, table } = setUp();
      beginColumnDrag(wrapper, table, 2); // dragging "C"

      pointer('pointermove', table.querySelectorAll('tbody tr')[0]!.children[1]!, 150, 10); // into B's own body

      const indicator = wrapper.querySelector('.cm-table-column-drop-indicator')!;
      expect(indicator.classList.contains('cm-table-handle-visible')).toBe(true);
      expect((indicator as HTMLElement).style.left).toBe('200px'); // column B's own right edge
    });

    it('acceptance 7: moving back and forth between column bodies updates the target immediately, each move independent', () => {
      const { wrapper, table } = setUp();
      beginColumnDrag(wrapper, table, 0);
      const cells = table.querySelectorAll('tbody tr')[0]!.children;

      pointer('pointermove', cells[1]!, 150, 10); // B
      expect((wrapper.querySelector('.cm-table-column-drop-indicator') as HTMLElement).style.left).toBe('200px');

      pointer('pointermove', cells[2]!, 250, 10); // C
      expect((wrapper.querySelector('.cm-table-column-drop-indicator') as HTMLElement).style.left).toBe('300px');

      pointer('pointermove', cells[1]!, 150, 10); // back to B
      expect((wrapper.querySelector('.cm-table-column-drop-indicator') as HTMLElement).style.left).toBe('200px');
    });

    it('acceptance 8: crossing only a divider never selects either adjacent column — the target stays whatever it already was', () => {
      const { view, wrapper, table } = setUp();
      beginColumnDrag(wrapper, table, 0); // dragging "A"
      pointer('pointermove', table.querySelectorAll('tbody tr')[0]!.children[1]!, 150, 10); // real target: B

      pointer('pointermove', buildResizeHitStrip(wrapper), 200, 10); // divider only — no body entered
      document.dispatchEvent(new MouseEvent('pointerup', { clientX: 200, clientY: 10, button: 0, bubbles: true, cancelable: true }));

      // Committed using the *last real target* (B), never a value implied by the divider itself.
      expect(view.state.doc.toString()).toBe('| B | A | C |\n| --- | --- | --- |\n| b | a | c |');
    });

    it('acceptance 9: uneven/persisted column widths — the indicator still lands on the target column\'s own real right edge', () => {
      const { view, controller } = mountRootViewWithTable(doc);
      const { wrapper, table } = buildTable(1, 3);
      mockWrapperRect(wrapper, { top: 0, left: 0, width: 900, height: 100 }); // wrapper far wider than the table itself
      mockHeaderCellRects(table, [50, 300, 20]); // deliberately uneven, table only 370px wide total
      attachTableHandleOverlay(wrapper, 3, view, controller, TEST_TABLE_FROM, null, null, () => undefined);

      hoverBodyCell(wrapper, table, 0, 0);
      const columnHit = table.querySelectorAll('thead th')[0]!.querySelector('.cm-table-column-handle-hit')!;
      pointer('pointerdown', columnHit, 25, 10);
      pointer('pointermove', table.querySelectorAll('tbody tr')[0]!.children[1]!, 200, 10); // into column B's own (300px-wide) body

      const indicator = wrapper.querySelector('.cm-table-column-drop-indicator')!;
      expect(indicator.classList.contains('cm-table-handle-visible')).toBe(true);
      // Column B's own real right edge — 50 (A's width) + 300 (B's width) =
      // 350 — never something derived from the wrapper's own 900px width.
      expect((indicator as HTMLElement).style.left).toBe('350px');
    });

    it('acceptance 10: horizontally scrolled table — the indicator still lands on the target column\'s own real right edge, wrapper-relative', () => {
      const { wrapper, table } = setUp();
      // Simulate a horizontally-scrolled `.cm-table-scroll`: every column's
      // own rect shifts left by the scroll offset, exactly as real
      // `getBoundingClientRect()` would report under a real scroll.
      mockHeaderCellRects(table, [100, 100, 100], -150);
      beginColumnDrag(wrapper, table, 0);

      pointer('pointermove', table.querySelectorAll('tbody tr')[0]!.children[1]!, 0, 10); // column B's own (scrolled) body

      const indicator = wrapper.querySelector('.cm-table-column-drop-indicator')!;
      expect(indicator.classList.contains('cm-table-handle-visible')).toBe(true);
      // Column B's own real right edge, scrolled: -150 + 100 + 100 = 50,
      // minus wrapper's own left (0) = 50px — still derived from real
      // geometry, never a stale/unscrolled percentage.
      expect((indicator as HTMLElement).style.left).toBe('50px');
    });
  });

  /** Wraps every cell's own text in a `.cm-table-cell-wrapper`, matching `TableWidget.toDOM()`'s own real structure — needed only by the tests below that assert on ghost content and source-hiding, since `buildTable()` itself (used everywhere else in this file) leaves cells empty. */
  function addCellWrappers(table: HTMLTableElement): void {
    for (const row of Array.from(table.rows)) {
      for (const cell of Array.from(row.children)) {
        const w = document.createElement('div');
        w.className = 'cm-table-cell-wrapper';
        w.textContent = cell.textContent ?? '';
        cell.appendChild(w);
      }
    }
  }

  it('a column drag materializes a ghost carrying the selection-overlay border and a relocated column handle, and hides the source column\'s content', () => {
    const { view, controller } = mountRootViewWithTable(FOUR_ROWS);
    const { wrapper, table } = buildTable(3, 2);
    addCellWrappers(table);
    mockRowRects(table);
    mockWrapperRect(wrapper, { top: 0, left: 0, width: 200, height: 160 });
    attachTableHandleOverlay(wrapper, 2, view, controller, TEST_TABLE_FROM, null, null, () => undefined);

    hoverBodyCell(wrapper, table, 0, 0);
    const columnHit = table.querySelector('thead th:nth-child(1) .cm-table-column-handle-hit')!;
    pointer('pointerdown', columnHit, 50, 10);

    expect(wrapper.querySelector('.cm-table-drag-ghost')).toBeNull(); // not yet — threshold not crossed

    pointer('pointermove', document, 60, 10); // 10px of travel, past DRAG_THRESHOLD_PX (4)
    const ghost = wrapper.querySelector('.cm-table-drag-ghost')!;
    expect(ghost).not.toBeNull();
    expect(ghost.classList.contains('cm-table-drag-ghost--column')).toBe(true);
    expect(ghost.classList.contains('cm-table-selection-overlay')).toBe(true);
    expect(ghost.classList.contains('cm-table-selection-overlay-visible')).toBe(true);
    expect(ghost.querySelectorAll(':scope > .cm-table-column-handle')).toHaveLength(1);

    // The source column's own cell-wrapper content is hidden throughout.
    for (const row of Array.from(table.rows)) {
      const wrapperEl = row.children[0]!.querySelector('.cm-table-cell-wrapper')!;
      expect(wrapperEl.classList.contains('cm-table-drag-source-hidden')).toBe(true);
    }

    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 60, clientY: 10, button: 0, bubbles: true, cancelable: true }));

    expect(wrapper.querySelector('.cm-table-drag-ghost')).toBeNull();
  });

  it('a row drag materializes a ghost carrying the selection-overlay border and a relocated row handle, and hides the source row\'s content', () => {
    const { view, controller } = mountRootViewWithTable(FOUR_ROWS);
    const { wrapper, table } = buildTable(3, 2);
    addCellWrappers(table);
    mockRowRects(table);
    attachTableHandleOverlay(wrapper, 2, view, controller, TEST_TABLE_FROM, null, null, () => undefined);

    hoverBodyCell(wrapper, table, 0, 0);
    const row = table.querySelectorAll('tbody tr')[0]!;
    const rowHit = row.children[0]!.querySelector('.cm-table-row-handle-hit')!;
    pointer('pointerdown', rowHit, 10, 60);
    pointer('pointermove', document, 10, 140);

    const ghost = wrapper.querySelector('.cm-table-drag-ghost')!;
    expect(ghost.classList.contains('cm-table-drag-ghost--row')).toBe(true);
    expect(ghost.classList.contains('cm-table-selection-overlay')).toBe(true);
    expect(ghost.querySelectorAll(':scope > .cm-table-row-handle')).toHaveLength(1);

    for (const cell of Array.from(row.children)) {
      const wrapperEl = cell.querySelector('.cm-table-cell-wrapper')!;
      expect(wrapperEl.classList.contains('cm-table-drag-source-hidden')).toBe(true);
    }

    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 140, button: 0, bubbles: true, cancelable: true }));

    expect(wrapper.querySelector('.cm-table-drag-ghost')).toBeNull();
    for (const cell of Array.from(row.children)) {
      const wrapperEl = cell.querySelector('.cm-table-cell-wrapper')!;
      expect(wrapperEl.classList.contains('cm-table-drag-source-hidden')).toBe(false);
    }
  });

  it('while a drag is active, hovering a different column/row never shows its own handle — only the ghost\'s relocated handle is visible', () => {
    const { view, controller } = mountRootViewWithTable(FOUR_ROWS);
    const { wrapper, table } = buildTable(3, 2);
    addCellWrappers(table);
    mockRowRects(table);
    attachTableHandleOverlay(wrapper, 2, view, controller, TEST_TABLE_FROM, null, null, () => undefined);

    hoverBodyCell(wrapper, table, 0, 0); // rowIndex 1
    const draggedRow = table.querySelectorAll('tbody tr')[0]!;
    const rowHit = draggedRow.children[0]!.querySelector('.cm-table-row-handle-hit')!;
    pointer('pointerdown', rowHit, 10, 60);
    pointer('pointermove', document, 10, 140); // crosses threshold, drag active

    // Hover a completely different cell/row while the drag is in progress.
    hoverBodyCell(wrapper, table, 1, 1);

    // No real row handle anywhere is visible — only the ghost's own clone.
    expect(wrapper.querySelectorAll('.cm-table-row-handle.cm-table-handle-visible')).toHaveLength(1);
    expect(wrapper.querySelector('.cm-table-drag-ghost .cm-table-row-handle.cm-table-handle-visible')).not.toBeNull();
    expect(wrapper.querySelectorAll('.cm-table-column-handle.cm-table-handle-visible')).toHaveLength(0);

    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 140, button: 0, bubbles: true, cancelable: true }));
  });

  it('pointercancel restores the source column, removes the ghost, and never touches the document', () => {
    const { view, controller } = mountRootViewWithTable(FOUR_ROWS);
    const { wrapper, table } = buildTable(3, 2);
    addCellWrappers(table);
    mockRowRects(table);
    mockWrapperRect(wrapper, { top: 0, left: 0, width: 200, height: 160 });
    attachTableHandleOverlay(wrapper, 2, view, controller, TEST_TABLE_FROM, null, null, () => undefined);
    const docBefore = view.state.doc.toString();

    hoverBodyCell(wrapper, table, 0, 0);
    const columnHit = table.querySelector('thead th:nth-child(1) .cm-table-column-handle-hit')!;
    pointer('pointerdown', columnHit, 50, 10);
    pointer('pointermove', document, 70, 10);
    expect(wrapper.querySelector('.cm-table-drag-ghost')).not.toBeNull();

    document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, cancelable: true }));

    expect(wrapper.querySelector('.cm-table-drag-ghost')).toBeNull();
    for (const row of Array.from(table.rows)) {
      const wrapperEl = row.children[0]!.querySelector('.cm-table-cell-wrapper')!;
      expect(wrapperEl.classList.contains('cm-table-drag-source-hidden')).toBe(false);
    }
    expect(view.state.doc.toString()).toBe(docBefore);
  });

  it('after pointercancel, ordinary hover behavior works again', () => {
    const { view, controller } = mountRootViewWithTable(FOUR_ROWS);
    const { wrapper, table } = buildTable(3, 2);
    addCellWrappers(table);
    mockRowRects(table);
    attachTableHandleOverlay(wrapper, 2, view, controller, TEST_TABLE_FROM, null, null, () => undefined);

    hoverBodyCell(wrapper, table, 0, 0);
    const row = table.querySelectorAll('tbody tr')[0]!;
    const rowHit = row.children[0]!.querySelector('.cm-table-row-handle-hit')!;
    pointer('pointerdown', rowHit, 10, 60);
    pointer('pointermove', document, 10, 140);
    document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, cancelable: true }));

    hoverBodyCell(wrapper, table, 1, 1);

    expect(wrapper.querySelectorAll('.cm-table-column-handle.cm-table-handle-visible')).toHaveLength(1);
    expect(wrapper.querySelectorAll('.cm-table-row-handle.cm-table-handle-visible')).toHaveLength(1);
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
    const row = table.querySelectorAll('tbody tr')[0]!;
    const rowHit = row.children[0]!.querySelector('.cm-table-row-handle-hit')!;
    pointer('pointerdown', rowHit, 10, 60);
    pointer('pointermove', document, 10, 140); // crosses the threshold

    expect(controller.activeAnchor).toBeNull();
    expect(controller.nestedView!.dom.parentElement).toBeNull();

    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 140, button: 0, bubbles: true, cancelable: true }));
  });
});
