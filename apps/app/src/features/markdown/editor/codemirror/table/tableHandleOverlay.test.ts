// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownLanguageExtension } from '../markdownLanguage';
import { attachTableHandleOverlay, resolveHoveredCell } from './tableHandleOverlay';
import { tableCellEditor } from '../table-engine/tableCellEditor';
import { tableWidgetDecoration } from './tableWidgetField';

const mountedViews: EditorView[] = [];
const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  for (const view of mountedViews.splice(0)) view.destroy();
  document.body.innerHTML = '';
});
function mountRootViewWithTable(doc: string): EditorView {
  const view = new EditorView({ state: EditorState.create({ doc, extensions: [markdownLanguageExtension(), tableCellEditor, tableWidgetDecoration(true)] }), parent: document.body.appendChild(document.createElement('div')) });
  mountedViews.push(view);
  return view;
}
/** Geometry-only fixtures use a small selection stub; command fixtures
 * delegate edits to the real engine attached to a real root document. */
function attach(wrapper: HTMLElement, _columnCount: number, column: number | null = null, row: number | null = null, view?: EditorView): void {
  const controller = view?.plugin(tableCellEditor);
  disposers.push(attachTableHandleOverlay(wrapper, 0, () => undefined, {
    selected: axis => axis === 'row' ? row : column,
    select: (axis, index) => {
      row = axis === 'row' ? index : null; column = axis === 'column' ? index : null;
      return controller?.selectAxis(0, { row: row ?? 0, col: column ?? 0 }, axis) ?? true;
    },
    move: (axis, from, to) => controller?.axisCommand(axis === 'row' ? { kind: 'row', tableFrom: 0, rowIndex: from } : { kind: 'column', tableFrom: 0, columnIndex: from }, axis === 'row' ? { kind: 'moveRow', from, to } : { kind: 'moveColumn', from, to }) ?? false,
  }));
}

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
    const { wrapper, table } = buildTable(2, 3);

    attach(wrapper, 3, 1, null);

    const visible = visibleColumnHandles(wrapper);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.parentElement).toBe(table.querySelector('thead th:nth-child(2)'));
    expect(visibleRowHandles(wrapper)).toHaveLength(0);
  });

  it('a selected row shows its handle (in that row\'s own first cell) even with no hover at all', () => {
    const { wrapper, table } = buildTable(2, 3);

    // Native `rowIndex` convention (header = 0) — row 1 is the first body row.
    attach(wrapper, 3, null, 1);

    const visible = visibleRowHandles(wrapper);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.parentElement).toBe(table.querySelectorAll('tbody tr')[0]!.children[0]);
    expect(visibleColumnHandles(wrapper)).toHaveLength(0);
  });

  it('a selected header row (rowIndex 0) shows its handle even with no hover at all — the header is a selectable row like any other', () => {
    const { wrapper, table } = buildTable(2, 3);

    attach(wrapper, 3, null, 0);

    const visible = visibleRowHandles(wrapper);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.parentElement).toBe(table.querySelector('thead th'));
    expect(visibleColumnHandles(wrapper)).toHaveLength(0);
  });

  it('switching selection from a column to the header row shows the row handle at the header and hides the column handle (simulates the TableWidget rebuild a kind change triggers)', () => {
    const beforeTable = buildTable(2, 3);
    attach(beforeTable.wrapper, 3, 1, null);
    expect(visibleColumnHandles(beforeTable.wrapper)).toHaveLength(1);

    // A fresh `attachTableHandleOverlay` call against a fresh wrapper is
    // exactly what a `TableSelection` kind change produces in the real
    // app — a new `TableWidget.toDOM()` call — `selectedColumnIndex` now
    // `null`, `selectedRowIndex` now `0` (the header).
    const afterTable = buildTable(2, 3);
    attach(afterTable.wrapper, 3, null, 0);

    expect(visibleRowHandles(afterTable.wrapper)).toHaveLength(1);
    expect(visibleColumnHandles(afterTable.wrapper)).toHaveLength(0);
  });

  it('hovering a different column shows it; leaving hover falls back to the selected column\'s own header handle', () => {
    const { wrapper, table } = buildTable(2, 3);
    attach(wrapper, 3, 0, null);

    const otherCell = table.querySelectorAll('tbody td')[2]!; // column 2
    hoverCell(wrapper, otherCell);
    expect(visibleColumnHandles(wrapper)[0]!.parentElement).toBe(table.querySelector('thead th:nth-child(3)'));

    wrapper.dispatchEvent(new Event('pointerleave'));

    expect(visibleColumnHandles(wrapper)[0]!.parentElement).toBe(table.querySelector('thead th:nth-child(1)'));
  });

  it('moving the pointer away from the table entirely still leaves the selected row handle visible on its own first cell', () => {
    const { wrapper, table } = buildTable(2, 3);
    attach(wrapper, 3, null, 1);

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


describe('current engine handle drop geometry', () => {
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

  /** Mocks a real header-cell rect per column, `width` wide each, starting at `left` — needed by the tests below that verify the drop indicator's own real-geometry positioning (never a `columnCount`-based percentage) under uneven column widths. */
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

  /** A non-cell target in the wrapper, which is not a valid reorder destination. */
  function buildNonCellTarget(wrapper: HTMLElement): HTMLElement {
    const target = document.createElement('div');
    wrapper.appendChild(target);
    return target;
  }

  describe('column drag — target = the column body the pointer is inside, non-cell targets are neutral', () => {
    const doc = '| A | B | C |\n| --- | --- | --- |\n| a | b | c |';

    function setUp(): { view: EditorView; wrapper: HTMLElement; table: HTMLTableElement } {
      const view = mountRootViewWithTable(doc);
      const { wrapper, table } = buildTable(1, 3);
      mockWrapperRect(wrapper, { top: 0, left: 0, width: 300, height: 100 });
      mockHeaderCellRects(table, [100, 100, 100]);
      attach(wrapper, 3, null, null, view);
      return { view, wrapper, table };
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

    it('bounds the vertical indicator to the actual table, excluding handle and add-row space', () => {
      const { wrapper, table } = setUp();
      mockWrapperRect(wrapper, { top: 20, left: 0, width: 300, height: 94 });
      table.getBoundingClientRect = () =>
        ({ top: 28, bottom: 88, height: 60, left: 0, right: 300, width: 300, x: 0, y: 28, toJSON: () => ({}) }) as DOMRect;
      beginColumnDrag(wrapper, table, 0);
      pointer('pointermove', table.querySelectorAll('tbody tr')[0]!.children[1]!, 150, 40);
      const indicator = wrapper.querySelector<HTMLElement>('.cm-table-column-drop-indicator')!;
      expect(indicator.style.top).toBe('8px');
      expect(indicator.style.height).toBe('60px');
      expect(indicator.style.left).toBe('200px');
      expect(indicator.classList.contains('cm-table-handle-visible')).toBe(true);
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

    it('acceptance 3: moving onto a non-cell target hides the indicator', () => {
      const { wrapper, table } = setUp();
      beginColumnDrag(wrapper, table, 0);
      pointer('pointermove', table.querySelectorAll('tbody tr')[0]!.children[1]!, 150, 10); // inside B, indicator visible
      expect(wrapper.querySelector('.cm-table-column-drop-indicator')!.classList.contains('cm-table-handle-visible')).toBe(true);

      const divider = buildNonCellTarget(wrapper);
      pointer('pointermove', divider, 200, 10);

      expect(wrapper.querySelector('.cm-table-column-drop-indicator')!.classList.contains('cm-table-handle-visible')).toBe(false);
    });

    it('acceptance 4: entering column 3\'s own body after a non-cell target shows the indicator after column 3', () => {
      const { wrapper, table } = setUp();
      beginColumnDrag(wrapper, table, 0);
      pointer('pointermove', buildNonCellTarget(wrapper), 200, 10); // cross the divider first

      pointer('pointermove', table.querySelectorAll('tbody tr')[0]!.children[2]!, 250, 10); // into C's own body

      const indicator = wrapper.querySelector('.cm-table-column-drop-indicator')!;
      expect(indicator.classList.contains('cm-table-handle-visible')).toBe(true);
      expect((indicator as HTMLElement).style.left).toBe('300px'); // column C's own right edge: 200 + 100
    });

    it('acceptance 5: dragging column 2 into column 1\'s body shows the indicator before column 1 (column 1\'s own left edge) — the dragged column lands at column 1\'s own index, index 0 included', () => {
      const { wrapper, table } = setUp();
      beginColumnDrag(wrapper, table, 1); // dragging "B" — pointerdown is always at clientX 50

      pointer('pointermove', table.querySelectorAll('tbody tr')[0]!.children[0]!, 10, 10); // into A's own body (clientX must differ from the press position to cross DRAG_THRESHOLD_PX)

      const indicator = wrapper.querySelector('.cm-table-column-drop-indicator')!;
      expect(indicator.classList.contains('cm-table-handle-visible')).toBe(true);
      expect((indicator as HTMLElement).style.left).toBe('0px'); // column A's own left edge — the boundary before it, not after
    });

    it('acceptance 6: dragging column 3 into column 2\'s body shows the indicator before column 2 (column 2\'s own left edge)', () => {
      const { wrapper, table } = setUp();
      beginColumnDrag(wrapper, table, 2); // dragging "C"

      pointer('pointermove', table.querySelectorAll('tbody tr')[0]!.children[1]!, 150, 10); // into B's own body

      const indicator = wrapper.querySelector('.cm-table-column-drop-indicator')!;
      expect(indicator.classList.contains('cm-table-handle-visible')).toBe(true);
      expect((indicator as HTMLElement).style.left).toBe('100px'); // column B's own left edge
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

      pointer('pointermove', buildNonCellTarget(wrapper), 200, 10); // divider only — no body entered
      document.dispatchEvent(new MouseEvent('pointerup', { clientX: 200, clientY: 10, button: 0, bubbles: true, cancelable: true }));

      // Committed using the *last real target* (B), never a value implied by the divider itself.
      expect(view.state.doc.toString()).toBe('| B | A | C |\n| --- | --- | --- |\n| b | a | c |');
    });

    it('acceptance 9: uneven/persisted column widths — the indicator still lands on the target column\'s own real right edge', () => {
      const view = mountRootViewWithTable(doc);
      const { wrapper, table } = buildTable(1, 3);
      mockWrapperRect(wrapper, { top: 0, left: 0, width: 900, height: 100 }); // wrapper far wider than the table itself
      mockHeaderCellRects(table, [50, 300, 20]); // deliberately uneven, table only 370px wide total
      attach(wrapper, 3, null, null, view);

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

});
