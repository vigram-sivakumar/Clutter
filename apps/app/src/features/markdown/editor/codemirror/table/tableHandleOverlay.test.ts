// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { attachTableHandleOverlay, resolveHoveredCell } from './tableHandleOverlay';

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
    attachTableHandleOverlay(wrapper, 2);

    expect(wrapper.querySelectorAll('.cm-table-column-handle')).toHaveLength(1);
    expect(wrapper.querySelectorAll('.cm-table-column-handle-hit')).toHaveLength(1);
    expect(wrapper.querySelectorAll('.cm-table-row-handle')).toHaveLength(1);
    expect(wrapper.querySelectorAll('.cm-table-row-handle-hit')).toHaveLength(1);
    expect(wrapper.querySelector('.cm-table-column-handle')?.classList.contains('cm-table-handle-visible')).toBe(false);
    expect(wrapper.querySelector('.cm-table-row-handle')?.classList.contains('cm-table-handle-visible')).toBe(false);
  });

  it('hovering a body cell shows both the column and row handle', () => {
    const { wrapper, table } = buildTable(2, 2);
    attachTableHandleOverlay(wrapper, 2);

    const bodyCell = table.querySelectorAll('tbody td')[1]!;
    const event = new Event('pointermove', { bubbles: true });
    Object.defineProperty(event, 'target', { value: bodyCell });
    wrapper.dispatchEvent(event);

    expect(wrapper.querySelector('.cm-table-column-handle')?.classList.contains('cm-table-handle-visible')).toBe(true);
    expect(wrapper.querySelector('.cm-table-row-handle')?.classList.contains('cm-table-handle-visible')).toBe(true);
  });

  it('hovering a header cell shows the column handle but not the row handle', () => {
    const { wrapper, table } = buildTable(2, 2);
    attachTableHandleOverlay(wrapper, 2);

    const headerCell = table.querySelector('thead th')!;
    const event = new Event('pointermove', { bubbles: true });
    Object.defineProperty(event, 'target', { value: headerCell });
    wrapper.dispatchEvent(event);

    expect(wrapper.querySelector('.cm-table-column-handle')?.classList.contains('cm-table-handle-visible')).toBe(true);
    expect(wrapper.querySelector('.cm-table-row-handle')?.classList.contains('cm-table-handle-visible')).toBe(false);
  });

  it('moving outside the table (pointerleave) hides both handles', () => {
    const { wrapper, table } = buildTable(2, 2);
    attachTableHandleOverlay(wrapper, 2);

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
    attachTableHandleOverlay(wrapper, 2);

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
    attachTableHandleOverlay(wrapper, 2);

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
    attachTableHandleOverlay(wrapper, 2);

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
