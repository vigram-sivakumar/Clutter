// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  attachTableSelectionOverlayResize,
  createTableSelectionOverlay,
  positionColumnSelectionOverlay,
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

    expect(overlay.style.left).toBe(`${233 - 100}px`);
    expect(overlay.style.top).toBe(`${60 - 50}px`);
    expect(overlay.style.width).toBe('133px');
    expect(overlay.style.height).toBe(`${150 - 60}px`); // header top to last-row bottom
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
    expect(overlay.style.left).toBe('50px');
    expect(overlay.style.top).toBe('10px');
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
    expect(overlay.style.height).toBe('40px'); // 0 (header top) to 40 (first row bottom)
  });

  it('a table with no body rows at all still produces a valid (header-only) rectangle', () => {
    const { scrollContainer, table } = buildTable(2, []);
    mockRect(scrollContainer, { left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200 });
    const headerCell = table.tHead!.rows[0]!.cells[0]!;
    mockRect(headerCell, { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 });
    const overlay = createTableSelectionOverlay();

    positionColumnSelectionOverlay(overlay, scrollContainer, table, 0);

    expect(overlay.style.height).toBe('20px');
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

    expect(overlay.style.left).toBe(`${233 - 100}px`);
    expect(overlay.style.top).toBe(`${120 - 50}px`);
    expect(overlay.style.width).toBe(`${499 - 233}px`); // first cell's left to last cell's right
    expect(overlay.style.height).toBe('30px');
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

    expect(overlay.style.left).toBe('50px');
    expect(overlay.style.top).toBe('30px');
  });

  it('leaves the overlay unpositioned and invisible when selectedRowIndex has no rendered <tr> (e.g. the header, or an out-of-range index)', () => {
    const { scrollContainer, table } = buildTable(2, [2]);
    const overlay = createTableSelectionOverlay();

    // 0 is the header's own index in `getNavigableRows` convention — never
    // a valid body-row selection, and `table.tBodies[0].rows[-1]` resolves
    // to `undefined`, exactly like a genuinely out-of-range index would.
    positionRowSelectionOverlay(overlay, scrollContainer, table, 0);

    expect(overlay.style.left).toBe('');
    expect(overlay.classList.contains('cm-table-selection-overlay-visible')).toBe(false);
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
    expect(overlay.style.width).toBe('100px');
  });

  it('a single-cell row still produces a valid rectangle (first and last cell are the same element)', () => {
    const { scrollContainer, table } = buildTable(1, [1]);
    mockRect(scrollContainer, { left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200 });
    const row = table.tBodies[0]!.rows[0]!;
    mockRect(row.cells[0]!, { left: 10, top: 5, right: 110, bottom: 25, width: 100, height: 20 });
    const overlay = createTableSelectionOverlay();

    positionRowSelectionOverlay(overlay, scrollContainer, table, 1);

    expect(overlay.style.left).toBe('10px');
    expect(overlay.style.width).toBe('100px');
    expect(overlay.style.height).toBe('20px');
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
