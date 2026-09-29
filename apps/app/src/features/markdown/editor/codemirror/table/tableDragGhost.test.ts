// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { createColumnDragGhost, createRowDragGhost, hideColumnSourceContent, hideRowSourceContent } from './tableDragGhost';

/** Builds a `.cm-table-wrapper > .cm-table-scroll > table` with real `.cm-table-cell-wrapper` content per cell, and stubs `getBoundingClientRect()` on every relevant element with a deterministic, non-zero rect — jsdom's own default (all-zero) rects would make every geometry assertion trivially pass/fail alike. */
function buildTable(rows: number, columns: number, cellWidth = 100, cellHeight = 30): { wrapper: HTMLElement; table: HTMLTableElement } {
  const wrapper = document.createElement('div');
  wrapper.className = 'cm-table-wrapper';
  wrapper.getBoundingClientRect = () => ({ top: 0, left: 0, width: columns * cellWidth, height: rows * cellHeight, right: columns * cellWidth, bottom: rows * cellHeight, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  const scroll = document.createElement('div');
  scroll.className = 'cm-table-scroll';
  wrapper.appendChild(scroll);
  const table = document.createElement('table');
  scroll.appendChild(table);
  table.getBoundingClientRect = () => ({ top: 0, left: 0, width: columns * cellWidth, height: rows * cellHeight, right: columns * cellWidth, bottom: rows * cellHeight, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (let c = 0; c < columns; c++) {
    const th = document.createElement('th');
    const cellWrapper = document.createElement('div');
    cellWrapper.className = 'cm-table-cell-wrapper';
    cellWrapper.textContent = `H${c}`;
    th.appendChild(cellWrapper);
    th.getBoundingClientRect = () => ({ top: 0, left: c * cellWidth, width: cellWidth, height: cellHeight, right: (c + 1) * cellWidth, bottom: cellHeight, x: c * cellWidth, y: 0, toJSON: () => ({}) }) as DOMRect;
    headerRow.appendChild(th);
  }
  headerRow.getBoundingClientRect = () => ({ top: 0, left: 0, width: columns * cellWidth, height: cellHeight, right: columns * cellWidth, bottom: cellHeight, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let r = 1; r < rows; r++) {
    const tr = document.createElement('tr');
    const top = r * cellHeight;
    for (let c = 0; c < columns; c++) {
      const td = document.createElement('td');
      const cellWrapper = document.createElement('div');
      cellWrapper.className = 'cm-table-cell-wrapper';
      cellWrapper.textContent = `R${r}C${c}`;
      td.appendChild(cellWrapper);
      td.getBoundingClientRect = () => ({ top, left: c * cellWidth, width: cellWidth, height: cellHeight, right: (c + 1) * cellWidth, bottom: top + cellHeight, x: c * cellWidth, y: top, toJSON: () => ({}) }) as DOMRect;
      tr.appendChild(td);
    }
    tr.getBoundingClientRect = () => ({ top, left: 0, width: columns * cellWidth, height: cellHeight, right: columns * cellWidth, bottom: top + cellHeight, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  document.body.appendChild(wrapper);
  return { wrapper, table };
}

describe('hideColumnSourceContent / hideRowSourceContent', () => {
  it('hides every cell-wrapper in the given column, and only that column', () => {
    const { table } = buildTable(3, 2);
    const restore = hideColumnSourceContent(table, 0);

    for (let r = 0; r < table.rows.length; r++) {
      const col0 = table.rows[r]!.children[0]!.querySelector('.cm-table-cell-wrapper')!;
      const col1 = table.rows[r]!.children[1]!.querySelector('.cm-table-cell-wrapper')!;
      expect(col0.classList.contains('cm-table-drag-source-hidden')).toBe(true);
      expect(col1.classList.contains('cm-table-drag-source-hidden')).toBe(false);
    }

    restore();
    for (let r = 0; r < table.rows.length; r++) {
      const col0 = table.rows[r]!.children[0]!.querySelector('.cm-table-cell-wrapper')!;
      expect(col0.classList.contains('cm-table-drag-source-hidden')).toBe(false);
    }
  });

  it('never removes cells from the DOM, never touches column width (no style/attr on the cell itself)', () => {
    const { table } = buildTable(2, 2);
    const cellCountBefore = table.querySelectorAll('td, th').length;
    hideColumnSourceContent(table, 1);

    expect(table.querySelectorAll('td, th').length).toBe(cellCountBefore);
    const th = table.rows[0]!.children[1] as HTMLElement;
    expect(th.style.width).toBe('');
    expect(th.hasAttribute('style')).toBe(false);
  });

  it('hides every cell-wrapper in the given row, and only that row', () => {
    const { table } = buildTable(3, 2);
    const targetRow = table.rows[1]!;
    const restore = hideRowSourceContent(targetRow);

    expect(targetRow.children[0]!.querySelector('.cm-table-cell-wrapper')!.classList.contains('cm-table-drag-source-hidden')).toBe(true);
    expect(targetRow.children[1]!.querySelector('.cm-table-cell-wrapper')!.classList.contains('cm-table-drag-source-hidden')).toBe(true);
    expect(table.rows[0]!.children[0]!.querySelector('.cm-table-cell-wrapper')!.classList.contains('cm-table-drag-source-hidden')).toBe(false);
    expect(table.rows[2]!.children[0]!.querySelector('.cm-table-cell-wrapper')!.classList.contains('cm-table-drag-source-hidden')).toBe(false);

    restore();
    expect(targetRow.children[0]!.querySelector('.cm-table-cell-wrapper')!.classList.contains('cm-table-drag-source-hidden')).toBe(false);
  });
});

describe('createColumnDragGhost', () => {
  it('uses the header cell\'s own real rendered width and the table\'s own real rendered height — never an equal division', () => {
    const { wrapper, table } = buildTable(3, 2, 137, 42); // deliberately uneven, non-round dimensions
    const ghost = createColumnDragGhost(wrapper, table, 1, 200, 200);

    expect(ghost.element.style.width).toBe('137px');
    expect(ghost.element.style.height).toBe(`${3 * 42}px`);
  });

  it('mounts as a direct child of the wrapper, sibling of .cm-table-scroll — never inside it', () => {
    const { wrapper, table } = buildTable(2, 2);
    const ghost = createColumnDragGhost(wrapper, table, 0, 50, 50);

    expect(ghost.element.parentElement).toBe(wrapper);
    expect(wrapper.querySelector('.cm-table-scroll')!.contains(ghost.element)).toBe(false);
  });

  it('clones the column\'s own cell-wrapper content, one ghost cell per row, top-to-bottom, with no per-row handle duplication', () => {
    const { wrapper, table } = buildTable(3, 2);
    const ghost = createColumnDragGhost(wrapper, table, 0, 50, 50);

    const ghostCells = ghost.element.querySelectorAll('.cm-table-drag-ghost-cell');
    expect(ghostCells).toHaveLength(3);
    expect(ghostCells[0]!.textContent).toBe('H0');
    expect(ghostCells[1]!.textContent).toBe('R1C0');
    expect(ghostCells[2]!.textContent).toBe('R2C0');
    // Exactly one handle clone, on the ghost's own root — never one per
    // ghost cell/row (that would be the per-cell duplication this
    // milestone's own "no per-column-cell multiplication" precedent warns
    // against).
    expect(ghost.element.querySelectorAll(':scope > .cm-table-column-handle')).toHaveLength(1);
    ghostCells.forEach((cell) => {
      expect(cell.querySelector('.cm-table-column-handle')).toBeNull();
    });
    expect(ghostCells[0]!.classList.contains('cm-table-drag-ghost-cell--header')).toBe(true);
    expect(ghostCells[1]!.classList.contains('cm-table-drag-ghost-cell--header')).toBe(false);
  });

  it('carries the exact selection-overlay border classes, reused rather than duplicated', () => {
    const { wrapper, table } = buildTable(2, 2);
    const ghost = createColumnDragGhost(wrapper, table, 0, 50, 50);

    expect(ghost.element.classList.contains('cm-table-selection-overlay')).toBe(true);
    expect(ghost.element.classList.contains('cm-table-selection-overlay-visible')).toBe(true);
  });

  it('regression: the handle is a direct child of the ghost root, never inside the clipping content container — the root itself carries no overflow-hiding class of its own', () => {
    const { wrapper, table } = buildTable(2, 2);
    const ghost = createColumnDragGhost(wrapper, table, 0, 50, 50);

    const content = ghost.element.querySelector(':scope > .cm-table-drag-ghost-content')!;
    expect(content).not.toBeNull();
    // Every cell lives inside the clipping content container...
    expect(content.querySelectorAll(':scope > .cm-table-drag-ghost-cell')).toHaveLength(2);
    // ...but the handle is a sibling of that container, appended directly
    // to the root, and appended *after* it — so it paints on top of both
    // the content and the root's own selection-overlay border, and is
    // never subject to the content container's own `overflow: hidden`
    // (the exact bug this structure fixes: a handle that intentionally
    // pokes outside its own box must not share a clipping ancestor with
    // content that's supposed to clip at that same box).
    const handle = ghost.element.querySelector(':scope > .cm-table-column-handle')!;
    expect(handle).not.toBeNull();
    expect(content.contains(handle)).toBe(false);
    expect(Array.from(ghost.element.children).indexOf(handle)).toBe(Array.from(ghost.element.children).length - 1);
  });

  it('preserves the grab offset exactly, per the documented example: column at X=0 (width 100), grabbed at X=40, pointer moves to X=300 -> ghost left = 260', () => {
    const { wrapper, table } = buildTable(1, 3, 100, 30);
    const ghost = createColumnDragGhost(wrapper, table, 0, /* grabClientX */ 40, /* currentClientX */ 40);

    ghost.update(300, wrapper.getBoundingClientRect());

    expect(ghost.element.style.left).toBe('260px');
  });

  it('top is set once at creation and never changes when update() is called — never moves vertically', () => {
    const { wrapper, table } = buildTable(2, 2);
    const ghost = createColumnDragGhost(wrapper, table, 0, 50, 50);
    const topAfterCreate = ghost.element.style.top;

    ghost.update(999, wrapper.getBoundingClientRect());

    expect(ghost.element.style.top).toBe(topAfterCreate);
  });

  it('destroy() removes the element, and is safe to call again / on an already-detached element', () => {
    const { wrapper, table } = buildTable(1, 1);
    const ghost = createColumnDragGhost(wrapper, table, 0, 10, 10);
    expect(wrapper.contains(ghost.element)).toBe(true);

    ghost.destroy();
    expect(wrapper.contains(ghost.element)).toBe(false);
    expect(() => ghost.destroy()).not.toThrow();
  });
});

describe('createRowDragGhost', () => {
  it('uses the row\'s own real rendered height and the table\'s own real rendered width', () => {
    const { wrapper, table } = buildTable(3, 2, 90, 55);
    const ghost = createRowDragGhost(wrapper, table, 1, 200, 200);

    expect(ghost.element.style.height).toBe('55px');
    expect(ghost.element.style.width).toBe(`${2 * 90}px`);
  });

  it('clones the row\'s own cell-wrapper content, left-to-right, with exactly one row-handle clone on the ghost root', () => {
    const { wrapper, table } = buildTable(2, 3);
    const ghost = createRowDragGhost(wrapper, table, 1, 50, 50);

    const ghostCells = ghost.element.querySelectorAll('.cm-table-drag-ghost-cell');
    expect(ghostCells).toHaveLength(3);
    expect(ghostCells[0]!.textContent).toBe('R1C0');
    expect(ghostCells[1]!.textContent).toBe('R1C1');
    expect(ghostCells[2]!.textContent).toBe('R1C2');
    expect(ghost.element.querySelectorAll(':scope > .cm-table-row-handle')).toHaveLength(1);
    expect(ghost.element.classList.contains('cm-table-selection-overlay')).toBe(true);
    expect(ghost.element.classList.contains('cm-table-selection-overlay-visible')).toBe(true);
    // Regression: cells live inside the clipping content container, the
    // handle is a sibling of it (never inside) — see the column ghost's
    // own identical regression test for the full reasoning.
    const content = ghost.element.querySelector(':scope > .cm-table-drag-ghost-content')!;
    expect(content.querySelectorAll(':scope > .cm-table-drag-ghost-cell')).toHaveLength(3);
    expect(content.contains(ghost.element.querySelector(':scope > .cm-table-row-handle')!)).toBe(false);
  });

  it('the header row\'s own ghost cells all carry the header modifier class', () => {
    const { wrapper, table } = buildTable(1, 2);
    const ghost = createRowDragGhost(wrapper, table, 0, 50, 50);

    ghost.element.querySelectorAll('.cm-table-drag-ghost-cell').forEach((el) => {
      expect(el.classList.contains('cm-table-drag-ghost-cell--header')).toBe(true);
    });
  });

  it('preserves the grab offset on the Y axis, mirroring the column case', () => {
    const { wrapper, table } = buildTable(2, 1, 100, 40);
    const ghost = createRowDragGhost(wrapper, table, 1, /* grabClientY */ 60, /* currentClientY */ 60); // row 1 starts at y=40, grabbed 20px into it

    ghost.update(200, wrapper.getBoundingClientRect());

    expect(ghost.element.style.top).toBe('180px'); // grabOffset = 60 - 40 = 20; top = 200 - 20 - wrapperTop(0)
  });

  it('left is set once at creation and never changes when update() is called — never moves horizontally', () => {
    const { wrapper, table } = buildTable(2, 2);
    const ghost = createRowDragGhost(wrapper, table, 0, 50, 50);
    const leftAfterCreate = ghost.element.style.left;

    ghost.update(999, wrapper.getBoundingClientRect());

    expect(ghost.element.style.left).toBe(leftAfterCreate);
  });
});
