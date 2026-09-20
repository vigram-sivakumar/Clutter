// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  attachTableSelectionOverlayResize,
  createTableSelectionOverlay,
  positionColumnSelectionOverlay,
  positionRangeSelectionOverlay,
  positionRowSelectionOverlay,
} from './tableSelectionOverlay';

/**
 * jsdom has no real layout engine — every `getBoundingClientRect()` call
 * returns an all-zero rect by default, so the geometry math this module
 * exists for can't be exercised against real rendering. Mocked per
 * element instead (a plain object satisfying the four fields this module
 * actually reads), the same "mock what real layout can't provide" pattern
 * already used elsewhere in this codebase's own table tests for the
 * identical reason.
 */
function mockRect(el: HTMLElement, rect: { left: number; top: number; right: number; bottom: number; width: number; height: number }): void {
  el.getBoundingClientRect = () => rect as DOMRect;
}

function buildTable(columns: number, rowCellCounts: readonly number[]): { scrollContainer: HTMLElement; table: HTMLTableElement } {
  const scrollContainer = document.createElement('div');
  const table = document.createElement('table');
  scrollContainer.appendChild(table);

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (let c = 0; c < columns; c++) {
    headerRow.appendChild(document.createElement('th'));
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const cellCount of rowCellCounts) {
    const tr = document.createElement('tr');
    for (let c = 0; c < cellCount; c++) {
      tr.appendChild(document.createElement('td'));
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  document.body.appendChild(scrollContainer);
  return { scrollContainer, table };
}

describe('createTableSelectionOverlay', () => {
  it('creates an element with the expected class, initially unpositioned', () => {
    const overlay = createTableSelectionOverlay();

    expect(overlay.className).toBe('cm-table-selection-overlay');
    expect(overlay.style.left).toBe('');
    expect(overlay.style.width).toBe('');
  });
});

describe('positionColumnSelectionOverlay — geometry', () => {
  it('derives left/top/width/height from the header cell and the last body cell in the column', () => {
    const { scrollContainer, table } = buildTable(3, [3, 3]);
    mockRect(scrollContainer, { left: 100, top: 50, right: 500, bottom: 300, width: 400, height: 250 });
    scrollContainer.scrollLeft = 0;
    scrollContainer.scrollTop = 0;
    const headerCell = table.tHead!.rows[0]!.cells[1]!;
    mockRect(headerCell, { left: 233, top: 60, right: 366, bottom: 90, width: 133, height: 30 });
    const lastRowCell = table.tBodies[0]!.rows[1]!.cells[1]!;
    mockRect(lastRowCell, { left: 233, top: 120, right: 366, bottom: 150, width: 133, height: 30 });
    const overlay = createTableSelectionOverlay();

    positionColumnSelectionOverlay(overlay, scrollContainer, table, 1);

    // Expanded 1px outward on every side (see this module's own doc
    // comment) so the 2px halo centers on the table's existing 1px
    // border/grid line instead of doubling up just inside it.
    expect(overlay.style.left).toBe(`${233 - 100 - 1}px`);
    expect(overlay.style.top).toBe(`${60 - 50 - 1}px`);
    expect(overlay.style.width).toBe(`${133 + 2}px`);
    expect(overlay.style.height).toBe(`${150 - 60 + 2}px`); // header top to last-row bottom
    expect(overlay.classList.contains('cm-table-selection-overlay-visible')).toBe(true);
  });

  it('adds the scroll container\'s current scrollLeft/scrollTop to produce a scroll-independent content offset', () => {
    const { scrollContainer, table } = buildTable(2, [1]);
    mockRect(scrollContainer, { left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200 });
    scrollContainer.scrollLeft = 50;
    scrollContainer.scrollTop = 10;
    const headerCell = table.tHead!.rows[0]!.cells[0]!;
    mockRect(headerCell, { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 });
    const bodyCell = table.tBodies[0]!.rows[0]!.cells[0]!;
    mockRect(bodyCell, { left: 0, top: 20, right: 100, bottom: 40, width: 100, height: 20 });
    const overlay = createTableSelectionOverlay();

    positionColumnSelectionOverlay(overlay, scrollContainer, table, 0);

    // Viewport-relative left/top are both 0 here, but the container is
    // scrolled by (50, 10) — the computed style must reflect the
    // scroll-independent content position, not the current viewport
    // reading, or the overlay would visually drift on the next scroll.
    // (Both also shifted -1px for the same 1px outward expansion as the
    // test above.)
    expect(overlay.style.left).toBe('49px');
    expect(overlay.style.top).toBe('9px');
  });

  it('leaves the overlay unpositioned and invisible when the header has no cell at the given column index', () => {
    const { scrollContainer, table } = buildTable(2, [2]);
    const overlay = createTableSelectionOverlay();

    positionColumnSelectionOverlay(overlay, scrollContainer, table, 5);

    expect(overlay.style.left).toBe('');
    expect(overlay.classList.contains('cm-table-selection-overlay-visible')).toBe(false);
  });

  it('a ragged last row (missing this column) falls back to the last row that actually has a cell there', () => {
    const { scrollContainer, table } = buildTable(3, [3, 1]); // second body row only has 1 cell
    mockRect(scrollContainer, { left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200 });
    const headerCell = table.tHead!.rows[0]!.cells[2]!;
    mockRect(headerCell, { left: 200, top: 0, right: 300, bottom: 20, width: 100, height: 20 });
    const firstRowCell = table.tBodies[0]!.rows[0]!.cells[2]!;
    mockRect(firstRowCell, { left: 200, top: 20, right: 300, bottom: 40, width: 100, height: 20 });
    // The ragged second row has no cells[2] at all — nothing to mock.
    const overlay = createTableSelectionOverlay();

    positionColumnSelectionOverlay(overlay, scrollContainer, table, 2);

    // Bottom comes from the first row's own cell (the last one that
    // actually has this column), not the (nonexistent) ragged row.
    expect(overlay.style.height).toBe('42px'); // 0 (header top) to 40 (first row bottom), +2 outward expansion
  });

  it('a table with no body rows at all still produces a valid (header-only) rectangle', () => {
    const { scrollContainer, table } = buildTable(2, []);
    mockRect(scrollContainer, { left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200 });
    const headerCell = table.tHead!.rows[0]!.cells[0]!;
    mockRect(headerCell, { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 });
    const overlay = createTableSelectionOverlay();

    positionColumnSelectionOverlay(overlay, scrollContainer, table, 0);

    expect(overlay.style.height).toBe('22px'); // 20 + 2 outward expansion
    expect(overlay.classList.contains('cm-table-selection-overlay-visible')).toBe(true);
  });
});

describe('positionRowSelectionOverlay — geometry', () => {
  it('derives left/top/width/height from the selected row\'s own first and last rendered cells', () => {
    const { scrollContainer, table } = buildTable(3, [3, 3]);
    mockRect(scrollContainer, { left: 100, top: 50, right: 500, bottom: 300, width: 400, height: 250 });
    scrollContainer.scrollLeft = 0;
    scrollContainer.scrollTop = 0;
    // selectedRowIndex 2 → getNavigableRows convention (header = 0) → the
    // second body row → table.tBodies[0].rows[1].
    const row = table.tBodies[0]!.rows[1]!;
    mockRect(row.cells[0]!, { left: 233, top: 120, right: 366, bottom: 150, width: 133, height: 30 });
    mockRect(row.cells[2]!, { left: 366, top: 120, right: 499, bottom: 150, width: 133, height: 30 });
    const overlay = createTableSelectionOverlay();

    positionRowSelectionOverlay(overlay, scrollContainer, table, 2);

    expect(overlay.style.left).toBe(`${233 - 100 - 1}px`);
    expect(overlay.style.top).toBe(`${120 - 50 - 1}px`);
    expect(overlay.style.width).toBe(`${499 - 233 + 2}px`); // first cell's left to last cell's right
    expect(overlay.style.height).toBe('32px');
    expect(overlay.classList.contains('cm-table-selection-overlay-visible')).toBe(true);
  });

  it('adds the scroll container\'s current scrollLeft/scrollTop to produce a scroll-independent content offset', () => {
    const { scrollContainer, table } = buildTable(2, [1]);
    mockRect(scrollContainer, { left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200 });
    scrollContainer.scrollLeft = 50;
    scrollContainer.scrollTop = 10;
    const row = table.tBodies[0]!.rows[0]!;
    mockRect(row.cells[0]!, { left: 0, top: 20, right: 100, bottom: 40, width: 100, height: 20 });
    const overlay = createTableSelectionOverlay();

    positionRowSelectionOverlay(overlay, scrollContainer, table, 1);

    expect(overlay.style.left).toBe('49px');
    expect(overlay.style.top).toBe('29px');
  });

  it('leaves the overlay unpositioned and invisible when selectedRowIndex has no rendered <tr> at all (out of range)', () => {
    const { scrollContainer, table } = buildTable(2, [2]);
    const overlay = createTableSelectionOverlay();

    // Neither the header (index 0, one row) nor the single body row
    // (index 1) — genuinely past the end of `getNavigableRows`.
    positionRowSelectionOverlay(overlay, scrollContainer, table, 5);

    expect(overlay.style.left).toBe('');
    expect(overlay.classList.contains('cm-table-selection-overlay-visible')).toBe(false);
  });

  it('selectedRowIndex 0 (the header) is a valid target and positions the overlay over the header row', () => {
    const { scrollContainer, table } = buildTable(3, [3, 3]);
    mockRect(scrollContainer, { left: 100, top: 50, right: 500, bottom: 300, width: 400, height: 250 });
    const headerRow = table.tHead!.rows[0]!;
    mockRect(headerRow.cells[0]!, { left: 233, top: 60, right: 366, bottom: 90, width: 133, height: 30 });
    mockRect(headerRow.cells[2]!, { left: 366, top: 60, right: 499, bottom: 90, width: 133, height: 30 });
    const overlay = createTableSelectionOverlay();

    positionRowSelectionOverlay(overlay, scrollContainer, table, 0);

    expect(overlay.style.left).toBe(`${233 - 100 - 1}px`);
    expect(overlay.style.top).toBe(`${60 - 50 - 1}px`);
    expect(overlay.style.width).toBe(`${499 - 233 + 2}px`);
    expect(overlay.style.height).toBe('32px');
    expect(overlay.classList.contains('cm-table-selection-overlay-visible')).toBe(true);
  });

  it('a ragged row (fewer cells than the header) is outlined only across its own actually-rendered cells', () => {
    const { scrollContainer, table } = buildTable(3, [1]); // one body row, ragged: only 1 of 3 columns
    mockRect(scrollContainer, { left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200 });
    const row = table.tBodies[0]!.rows[0]!;
    mockRect(row.cells[0]!, { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 });
    const overlay = createTableSelectionOverlay();

    positionRowSelectionOverlay(overlay, scrollContainer, table, 1);

    // Both "first" and "last" resolve to the row's own single cell — no
    // attempt to stretch the outline out to the header's full 3-column
    // width.
    expect(overlay.style.width).toBe('102px'); // 100 + 2 outward expansion
  });

  it('a single-cell row still produces a valid rectangle (first and last cell are the same element)', () => {
    const { scrollContainer, table } = buildTable(1, [1]);
    mockRect(scrollContainer, { left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200 });
    const row = table.tBodies[0]!.rows[0]!;
    mockRect(row.cells[0]!, { left: 10, top: 5, right: 110, bottom: 25, width: 100, height: 20 });
    const overlay = createTableSelectionOverlay();

    positionRowSelectionOverlay(overlay, scrollContainer, table, 1);

    expect(overlay.style.left).toBe('9px');
    expect(overlay.style.width).toBe('102px');
    expect(overlay.style.height).toBe('22px');
  });
});

describe('positionRangeSelectionOverlay — geometry', () => {
  it('derives left/top/width/height from the header (horizontal) and the min/max row (vertical) for a multi-row x multi-column range', () => {
    const { scrollContainer, table } = buildTable(3, [3, 3, 3]);
    mockRect(scrollContainer, { left: 100, top: 50, right: 500, bottom: 300, width: 400, height: 250 });
    const headerRow = table.tHead!.rows[0]!;
    mockRect(headerRow.cells[0]!, { left: 100, top: 60, right: 200, bottom: 90, width: 100, height: 30 });
    mockRect(headerRow.cells[1]!, { left: 200, top: 60, right: 300, bottom: 90, width: 100, height: 30 });
    // minRow=1 (first body row), maxRow=2 (second body row), minCol=0, maxCol=1.
    const topRow = table.tBodies[0]!.rows[0]!;
    mockRect(topRow.cells[0]!, { left: 100, top: 90, right: 200, bottom: 120, width: 100, height: 30 });
    const bottomRow = table.tBodies[0]!.rows[1]!;
    mockRect(bottomRow.cells[0]!, { left: 100, top: 120, right: 200, bottom: 150, width: 100, height: 30 });
    const overlay = createTableSelectionOverlay();

    positionRangeSelectionOverlay(overlay, scrollContainer, table, 1, 2, 0, 1);

    expect(overlay.style.left).toBe(`${100 - 100 - 1}px`);
    expect(overlay.style.top).toBe(`${90 - 50 - 1}px`); // topRow's own top
    expect(overlay.style.width).toBe(`${300 - 100 + 2}px`); // header col0 left to col1 right
    expect(overlay.style.height).toBe(`${150 - 90 + 2}px`); // topRow top to bottomRow bottom
    expect(overlay.classList.contains('cm-table-selection-overlay-visible')).toBe(true);
  });

  it('a single-cell range (minRow=maxRow, minCol=maxCol) produces a valid rectangle', () => {
    const { scrollContainer, table } = buildTable(2, [2]);
    mockRect(scrollContainer, { left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200 });
    const headerRow = table.tHead!.rows[0]!;
    mockRect(headerRow.cells[1]!, { left: 100, top: 0, right: 200, bottom: 20, width: 100, height: 20 });
    const row = table.tBodies[0]!.rows[0]!;
    // Vertical extent always comes from the row's own first cell
    // (`cells[0]`), per `positionRangeSelectionOverlay`'s own doc comment
    // — not the selected column's own cell.
    mockRect(row.cells[0]!, { left: 0, top: 20, right: 100, bottom: 40, width: 100, height: 20 });
    const overlay = createTableSelectionOverlay();

    positionRangeSelectionOverlay(overlay, scrollContainer, table, 1, 1, 1, 1);

    expect(overlay.style.left).toBe('99px');
    expect(overlay.style.top).toBe('19px');
    expect(overlay.style.width).toBe('102px');
    expect(overlay.style.height).toBe('22px');
  });

  it('a single-row range (minRow=maxRow, different columns) spans only that row', () => {
    const { scrollContainer, table } = buildTable(3, [3]);
    mockRect(scrollContainer, { left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200 });
    const headerRow = table.tHead!.rows[0]!;
    mockRect(headerRow.cells[0]!, { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 });
    mockRect(headerRow.cells[2]!, { left: 200, top: 0, right: 300, bottom: 20, width: 100, height: 20 });
    const row = table.tBodies[0]!.rows[0]!;
    mockRect(row.cells[0]!, { left: 0, top: 20, right: 100, bottom: 40, width: 100, height: 20 });
    const overlay = createTableSelectionOverlay();

    positionRangeSelectionOverlay(overlay, scrollContainer, table, 1, 1, 0, 2);

    expect(overlay.style.top).toBe('19px');
    expect(overlay.style.width).toBe('302px'); // col0 left to col2 right, +2 outward expansion
    expect(overlay.style.height).toBe('22px'); // one row only, +2 outward expansion
  });

  it('a single-column range (minCol=maxCol, different rows) spans only that column', () => {
    const { scrollContainer, table } = buildTable(2, [2, 2]);
    mockRect(scrollContainer, { left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200 });
    const headerRow = table.tHead!.rows[0]!;
    mockRect(headerRow.cells[0]!, { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 });
    const topRow = table.tBodies[0]!.rows[0]!;
    mockRect(topRow.cells[0]!, { left: 0, top: 20, right: 100, bottom: 40, width: 100, height: 20 });
    const bottomRow = table.tBodies[0]!.rows[1]!;
    mockRect(bottomRow.cells[0]!, { left: 0, top: 40, right: 100, bottom: 60, width: 100, height: 20 });
    const overlay = createTableSelectionOverlay();

    positionRangeSelectionOverlay(overlay, scrollContainer, table, 1, 2, 0, 0);

    expect(overlay.style.width).toBe('102px'); // one column only, +2 outward expansion
    expect(overlay.style.top).toBe('19px');
    expect(overlay.style.height).toBe('42px'); // topRow top to bottomRow bottom, +2 outward expansion
  });

  it('a range whose top or bottom boundary row is ragged still measures correctly from that row\'s own first rendered cell', () => {
    const { scrollContainer, table } = buildTable(3, [1, 3]); // first body row ragged: only 1 of 3 columns
    mockRect(scrollContainer, { left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200 });
    const headerRow = table.tHead!.rows[0]!;
    mockRect(headerRow.cells[0]!, { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 });
    mockRect(headerRow.cells[1]!, { left: 100, top: 0, right: 200, bottom: 20, width: 100, height: 20 });
    const raggedRow = table.tBodies[0]!.rows[0]!; // only cells[0]
    mockRect(raggedRow.cells[0]!, { left: 0, top: 20, right: 100, bottom: 40, width: 100, height: 20 });
    const fullRow = table.tBodies[0]!.rows[1]!;
    mockRect(fullRow.cells[0]!, { left: 0, top: 40, right: 100, bottom: 60, width: 100, height: 20 });
    const overlay = createTableSelectionOverlay();

    // Range spans both body rows across columns 0-1 — the ragged row (row
    // index 1) is the range's own top boundary, and it has no cells[1] at
    // all, but the geometry function only ever needs that row's own first
    // cell (cells[0]) for its vertical extent — the horizontal extent
    // always comes from the header, which always has every column.
    positionRangeSelectionOverlay(overlay, scrollContainer, table, 1, 2, 0, 1);

    expect(overlay.style.top).toBe('19px'); // ragged row's own top, -1 outward expansion
    expect(overlay.style.height).toBe('42px'); // ragged row top to full row bottom, +2 outward expansion
    expect(overlay.style.width).toBe('202px'); // header col0 left to col1 right, +2 outward expansion
    expect(overlay.classList.contains('cm-table-selection-overlay-visible')).toBe(true);
  });

  it('leaves the overlay unpositioned and invisible when the header has no cell at minCol/maxCol', () => {
    const { scrollContainer, table } = buildTable(2, [2]);
    const overlay = createTableSelectionOverlay();

    positionRangeSelectionOverlay(overlay, scrollContainer, table, 1, 1, 0, 5);

    expect(overlay.style.left).toBe('');
    expect(overlay.classList.contains('cm-table-selection-overlay-visible')).toBe(false);
  });
});

/**
 * jsdom does not implement `ResizeObserver` at all (confirmed directly:
 * `typeof ResizeObserver === 'undefined'` in this test environment) —
 * per `vitest.setup.ts`'s own documented convention, a stub for it is
 * deliberately *local* to whichever test file needs per-test control
 * over exactly when its callback fires (this one does: these tests
 * trigger it manually to simulate a resize), not a global polyfill.
 * Records every constructed instance and what it observed, and exposes
 * `trigger()` to invoke the stored callback on demand — a real
 * `ResizeObserver`'s callback fires asynchronously, on layout, which
 * these tests need to control precisely rather than wait for.
 */
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  readonly observed: Element[] = [];
  disconnected = false;
  constructor(private readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }
  observe(el: Element): void {
    this.observed.push(el);
  }
  unobserve(el: Element): void {
    this.observed.splice(this.observed.indexOf(el), 1);
  }
  disconnect(): void {
    this.disconnected = true;
  }
  trigger(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

describe('attachTableSelectionOverlayResize', () => {
  let originalResizeObserver: typeof ResizeObserver | undefined;

  beforeEach(() => {
    originalResizeObserver = globalThis.ResizeObserver;
    MockResizeObserver.instances = [];
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver as typeof ResizeObserver;
  });

  it('observes the given table element', () => {
    const { table } = buildTable(2, [2]);

    attachTableSelectionOverlayResize(table, () => {});

    expect(MockResizeObserver.instances).toHaveLength(1);
    expect(MockResizeObserver.instances[0]!.observed).toContain(table);
  });

  it('calls the measure callback whenever the observer fires', () => {
    const { table } = buildTable(2, [2]);
    const measure = vi.fn();

    attachTableSelectionOverlayResize(table, measure);
    MockResizeObserver.instances[0]!.trigger();
    MockResizeObserver.instances[0]!.trigger();

    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('the returned observer\'s disconnect() actually disconnects the underlying observer', () => {
    const { table } = buildTable(2, [2]);

    const observer = attachTableSelectionOverlayResize(table, () => {});
    observer!.disconnect();

    expect(MockResizeObserver.instances[0]!.disconnected).toBe(true);
  });

  it('returns null and does nothing when ResizeObserver is unavailable, rather than throwing', () => {
    globalThis.ResizeObserver = undefined as unknown as typeof ResizeObserver;
    const { table } = buildTable(2, [2]);

    const result = attachTableSelectionOverlayResize(table, () => {});

    expect(result).toBeNull();
  });
});
