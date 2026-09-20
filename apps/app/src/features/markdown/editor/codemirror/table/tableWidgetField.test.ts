// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { TableActiveCellController } from './tableActiveCellController';
import { findAllTables } from './tableGeometry';
import { tableSelectionChanged, tableSelectionField } from './tableSelection';
import { tableWidgetDecoration } from './tableWidgetField';

function mountView(doc: string, controller?: TableActiveCellController): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), tableWidgetDecoration(controller)],
  });
  return new EditorView({ state, parent });
}

function mountViewWithSelectionField(doc: string, controller?: TableActiveCellController): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), tableWidgetDecoration(controller), tableSelectionField],
  });
  return new EditorView({ state, parent });
}

const BASIC_TABLE = '| a | b |\n| - | - |\n| 1 | 2 |';
// Three body rows, `getNavigableRows` indices 1/2/3 (header is 0) — used
// by the row-selection overlay tests below, which need more than
// `BASIC_TABLE`'s own single body row to exercise "select a different
// row" and "switch back and forth" scenarios.
const MULTI_ROW_TABLE = '| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |';
// Row index 2 (the second body row) is ragged — only one of the header's
// two columns — for the row-selection ragged-row test below.
const RAGGED_ROW_TABLE = '| a | b |\n| - | - |\n| 1 | 2 |\n| 3 |\n| 5 | 6 |';

describe('tableWidgetField — basic table', () => {
  it('renders a real <table> element, hiding every pipe delimiter', () => {
    const view = mountView(`${BASIC_TABLE}\n\nOther`);

    expect(view.dom.querySelectorAll('.cm-table-widget')).toHaveLength(1);
    expect(view.dom.textContent).not.toContain('|');
    for (const value of ['a', 'b', '1', '2']) {
      expect(view.dom.textContent).toContain(value);
    }
  });

  it('renders the header row inside <thead> and the data row inside <tbody>', () => {
    const view = mountView(BASIC_TABLE);

    expect(view.dom.querySelectorAll('thead tr')).toHaveLength(1);
    expect(view.dom.querySelectorAll('thead th')).toHaveLength(2);
    expect(view.dom.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(view.dom.querySelectorAll('tbody td')).toHaveLength(2);
  });
});

describe('tableWidgetField — multiple rows and columns', () => {
  it('decorates every row and every column across a larger table', () => {
    const text = '| a | b | c |\n| - | - | - |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n| 7 | 8 | 9 |\n\nOther';
    const view = mountView(text);

    expect(view.dom.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(view.dom.querySelectorAll('tbody td')).toHaveLength(9);
    expect(view.dom.textContent).not.toContain('|');
    for (const value of ['a', 'b', 'c', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(view.dom.textContent).toContain(value);
    }
  });
});

describe('tableWidgetField — column alignment', () => {
  it('applies left/center/right alignment classes to the correct columns', () => {
    const text = '| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |\n\nOther';
    const view = mountView(text);

    const headerCells = Array.from(view.dom.querySelectorAll('thead th'));
    expect(headerCells[0]?.classList.contains('cm-table-widget-align-left')).toBe(true);
    expect(headerCells[1]?.classList.contains('cm-table-widget-align-center')).toBe(true);
    expect(headerCells[2]?.classList.contains('cm-table-widget-align-right')).toBe(true);
  });

  it('an unaligned column (plain "---") gets no alignment class', () => {
    const text = '| a |\n| --- |\n| 1 |\n\nOther';
    const view = mountView(text);

    const cell = view.dom.querySelector('thead th');
    expect(cell?.classList.contains('cm-table-widget-align-left')).toBe(false);
    expect(cell?.classList.contains('cm-table-widget-align-center')).toBe(false);
    expect(cell?.classList.contains('cm-table-widget-align-right')).toBe(false);
  });

  it('alignment applies consistently to every row in the column, not just the header', () => {
    const text = '| a |\n| ---: |\n| 1 |\n| 2 |\n\nOther';
    const view = mountView(text);

    const cells = Array.from(view.dom.querySelectorAll('th, td'));
    expect(cells).toHaveLength(3); // header + 2 data rows
    expect(cells.every((c) => c.classList.contains('cm-table-widget-align-right'))).toBe(true);
  });
});

describe('tableWidgetField — the document is always authoritative', () => {
  it('the stored document text is unaffected by decoration', () => {
    const view = mountView(BASIC_TABLE);

    expect(view.state.doc.toString()).toBe(BASIC_TABLE);
  });

  it('editing a cell\'s text produces the expected new Markdown source, decorations aside', () => {
    const view = mountView('| a | b |\n| - | - |\n| 1 | 2 |');
    const cellStart = view.state.doc.toString().indexOf('1');

    view.dispatch({ changes: { from: cellStart, to: cellStart + 1, insert: '99' } });

    expect(view.state.doc.toString()).toBe('| a | b |\n| - | - |\n| 99 | 2 |');
    expect(view.dom.textContent).toContain('99');
  });
});

describe('tableWidgetField — inactive cells render formatted (not plain-text) Markdown', () => {
  it('bold text inside a cell renders as <strong>, with its ** markers hidden', () => {
    const view = mountView('| a |\n| - |\n| **bold** |\n\nOther');

    expect(view.dom.querySelector('tbody td strong')?.textContent).toBe('bold');
    expect(view.dom.textContent).not.toContain('**');
  });

  it('a WikiLink inside a cell renders via renderInlineMarkdown', () => {
    const view = mountView('| a |\n| - |\n| [[Page]] |\n\nOther');

    expect(view.dom.querySelector('tbody td .cm-table-cell-wikilink')?.textContent).toBe('Page');
  });
});

describe('tableWidgetField — Setext/Table precedence (no false-positive table decoration)', () => {
  it('an ordinary Setext heading gets no table decoration at all', () => {
    const text = 'Setext Heading\n---\n\nOther';
    const view = mountView(text);

    expect(view.dom.querySelectorAll('.cm-table-widget')).toHaveLength(0);
    expect(view.dom.textContent).toContain('Setext Heading');
  });

  it('a Setext heading whose text line contains a stray "|" still gets no table decoration', () => {
    const text = 'A | B\n---\n\nOther';
    const view = mountView(text);

    expect(view.dom.querySelectorAll('.cm-table-widget')).toHaveLength(0);
    expect(view.dom.textContent).toContain('|');
  });

  it('genuinely table-shaped two-line text (both lines are pipe-delimiter rows) IS decorated as a table', () => {
    const text = 'A|B\n-|-\n\nOther';
    const view = mountView(text);

    expect(view.dom.querySelectorAll('.cm-table-widget')).toHaveLength(1);
    expect(view.dom.textContent).not.toContain('|');
  });

  it('a row with no leading/trailing pipe still produces every cell (GFM: outer pipes are optional)', () => {
    const text = 'A|B\n-|-\n1|2\n\nOther';
    const view = mountView(text);

    const headerCells = view.dom.querySelectorAll('thead th');
    expect(headerCells).toHaveLength(2);
    expect(headerCells[0]?.textContent).toBe('A');
    expect(headerCells[1]?.textContent).toBe('B');
    const bodyCells = view.dom.querySelectorAll('tbody td');
    expect(bodyCells[0]?.textContent).toBe('1');
    expect(bodyCells[1]?.textContent).toBe('2');
  });
});

describe('tableWidgetField — nested/adjacent tables', () => {
  it('two tables separated by a blank line each decorate independently, with the correct row/cell counts', () => {
    const text = '| a |\n| - |\n| 1 |\n\n| x | y |\n| - | - |\n| 9 | 8 |\n\nOther';
    const view = mountView(text);

    const tables = view.dom.querySelectorAll('.cm-table-widget');
    expect(tables).toHaveLength(2);
    expect(tables[0]?.querySelectorAll('td')).toHaveLength(1);
    expect(tables[1]?.querySelectorAll('td')).toHaveLength(2);
    for (const value of ['a', '1', 'x', 'y', '9', '8']) {
      expect(view.dom.textContent).toContain(value);
    }
  });

  it('a non-pipe line directly after a table (no blank line) stays an ordinary paragraph, not a ragged TableRow', () => {
    // Fixed by tableLazyAbsorptionGuard.ts: @lezer/markdown's own Table
    // extension otherwise absorbs any following line — pipe or not — as
    // another TableRow, which diverges from real GFM/GitHub rendering.
    // See that file's doc comment for the full root-cause investigation.
    const text = '| a |\n| - |\n| 1 |\nplain paragraph\n\nOther';
    const view = mountView(text);

    expect(view.dom.querySelectorAll('.cm-table-widget')).toHaveLength(1);
    expect(view.dom.querySelectorAll('tbody tr')).toHaveLength(1); // "1" row only — "plain paragraph" is not part of the table
    expect(view.dom.textContent).toContain('plain paragraph');
  });

  it('a blank line genuinely ends the table — content after it is an ordinary undecorated paragraph', () => {
    const text = '| a |\n| - |\n| 1 |\n\nplain paragraph';
    const view = mountView(text);

    expect(view.dom.querySelectorAll('tbody tr')).toHaveLength(1); // "1" row only
    expect(view.dom.textContent).toContain('plain paragraph');
  });
});

describe('tableWidgetField — controller.remapActiveAnchor wiring (M2)', () => {
  it('calls controller.remapActiveAnchor synchronously on every doc-changing transaction, before this field rebuilds its own decorations', () => {
    const controller = new TableActiveCellController();
    const view = mountView(BASIC_TABLE, controller);
    controller.activate(view, document.createElement('div'), 2, 3, 2); // "a"

    // A whole extra line inserted before the table (not touching its own
    // header row), so table structure stays intact — the M3 structural-
    // loss path has its own dedicated tests below.
    view.dispatch({ changes: { from: 0, to: 0, insert: 'XX\n' } });

    // Anchor shifted by the 3-character insert at the very start — proof
    // remapActiveAnchor actually ran as part of this same transaction,
    // not merely that activate() itself still holds its original values.
    expect(controller.activeAnchor).toEqual({ from: 5, to: 6 });
  });

  it('never calls remapActiveAnchor for a selection-only transaction (no doc change to remap through)', () => {
    const controller = new TableActiveCellController();
    const view = mountView(BASIC_TABLE, controller);
    controller.activate(view, document.createElement('div'), 2, 3, 2);
    const before = controller.activeAnchor;

    view.dispatch({ selection: { anchor: 0 } });

    expect(controller.activeAnchor).toEqual(before);
  });

  it('rendering still works correctly with no controller supplied at all (backward-compatible default)', () => {
    const view = mountView(BASIC_TABLE);

    expect(view.dom.querySelectorAll('.cm-table-widget')).toHaveLength(1);
  });
});

describe('tableWidgetField — column-selection overlay (tableSelectionOverlay.ts)', () => {
  it('renders exactly one overlay element inside .cm-table-scroll (not .cm-table-wrapper) when a column is selected', () => {
    const view = mountViewWithSelectionField(BASIC_TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 0 }) });

    const overlays = view.dom.querySelectorAll('.cm-table-selection-overlay');
    expect(overlays).toHaveLength(1);
    const overlay = overlays[0]!;
    const scroll = view.dom.querySelector('.cm-table-scroll')!;
    expect(scroll.contains(overlay)).toBe(true);
    // Specifically not a direct child of .cm-table-wrapper — the whole
    // point of this milestone's own coordinate-space choice (see
    // tableSelectionOverlay.ts's own doc comment).
    const wrapper = view.dom.querySelector('.cm-table-wrapper')!;
    expect(Array.from(wrapper.children)).not.toContain(overlay);
  });

  it('renders no overlay when no column is selected', () => {
    const view = mountViewWithSelectionField(BASIC_TABLE);

    expect(view.dom.querySelectorAll('.cm-table-selection-overlay')).toHaveLength(0);
  });

  it('the overlay is removed again once the selection is cleared', () => {
    const view = mountViewWithSelectionField(BASIC_TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 0 }) });
    expect(view.dom.querySelectorAll('.cm-table-selection-overlay')).toHaveLength(1);

    view.dispatch({ effects: tableSelectionChanged.of(null) });

    expect(view.dom.querySelectorAll('.cm-table-selection-overlay')).toHaveLength(0);
  });

  // `pointer-events: none` itself lives in tableSelectionOverlay.css, not
  // set inline by tableSelectionOverlay.ts — jsdom's test environment
  // doesn't apply imported stylesheet CSS at all (confirmed directly:
  // this exact assertion read the initial/default computed value
  // regardless of the real rule), so this is verified by direct
  // inspection of that CSS file and by the manual live-browser
  // verification pass instead, not a DOM-level test here.

  it('a selection in a different table (multi-table document) does not render an overlay in an unrelated table', () => {
    const doc = `${BASIC_TABLE}\n\nBetween.\n\n${BASIC_TABLE}`;
    const view = mountViewWithSelectionField(doc);
    const secondTable = findAllTables(view.state)[1]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: secondTable.from, columnIndex: 0 }) });

    expect(view.dom.querySelectorAll('.cm-table-selection-overlay')).toHaveLength(1);
    const widgets = Array.from(view.dom.querySelectorAll('.cm-table-widget'));
    expect(widgets[0]!.querySelectorAll('.cm-table-selection-overlay')).toHaveLength(0);
    expect(widgets[1]!.querySelectorAll('.cm-table-selection-overlay')).toHaveLength(1);
  });
});

describe('tableWidgetField — row-selection overlay (tableSelectionOverlay.ts)', () => {
  it('renders exactly one overlay element inside .cm-table-scroll when a row is selected', () => {
    const view = mountViewWithSelectionField(MULTI_ROW_TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 2 }) });

    const overlays = view.dom.querySelectorAll('.cm-table-selection-overlay');
    expect(overlays).toHaveLength(1);
    const scroll = view.dom.querySelector('.cm-table-scroll')!;
    expect(scroll.contains(overlays[0]!)).toBe(true);
  });

  it('overlay geometry matches the selected row\'s own actual rendered cells (not the whole table)', async () => {
    const view = mountViewWithSelectionField(MULTI_ROW_TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 2 }) });

    // The widget's own DOM (table/rows/cells) is built synchronously
    // inside `dispatch()` above — only the overlay's *positioning* is
    // deferred to a microtask (`TableWidget.toDOM()`'s own
    // `queueMicrotask`) — so mocking geometry here, before awaiting,
    // lands before that deferred positioning pass actually reads it.
    const tableEl = view.dom.querySelector('table') as HTMLTableElement;
    const scrollEl = view.dom.querySelector('.cm-table-scroll') as HTMLElement;
    // rowIndex 2 → getNavigableRows convention (header = 0) → the second
    // body row → tBodies[0].rows[1] (the "3 | 4" row).
    const selectedRow = tableEl.tBodies[0]!.rows[1]!;
    const otherRow = tableEl.tBodies[0]!.rows[0]!;

    mockRect(scrollEl, { left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300 });
    mockRect(selectedRow.cells[0]!, { left: 0, top: 40, right: 100, bottom: 70, width: 100, height: 30 });
    mockRect(selectedRow.cells[1]!, { left: 100, top: 40, right: 200, bottom: 70, width: 100, height: 30 });
    mockRect(otherRow.cells[0]!, { left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 });

    await Promise.resolve();
    const overlay = view.dom.querySelector('.cm-table-selection-overlay') as HTMLElement;

    expect(overlay.style.left).toBe('-1px');
    expect(overlay.style.top).toBe('39px');
    expect(overlay.style.width).toBe('202px'); // spans both of the selected row's own cells, +2 outward expansion
    expect(overlay.style.height).toBe('32px'); // the selected row's own height, not otherRow's, +2 outward expansion
  });

  it('a ragged row (fewer cells than the header) is outlined only across its own rendered cells', async () => {
    const view = mountViewWithSelectionField(RAGGED_ROW_TABLE);
    const table = findAllTables(view.state)[0]!;
    // rowIndex 2 → the ragged "| 3 |" row → tBodies[0].rows[1], one cell.
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 2 }) });

    const tableEl = view.dom.querySelector('table') as HTMLTableElement;
    const raggedRow = tableEl.tBodies[0]!.rows[1]!;
    expect(raggedRow.cells).toHaveLength(1);

    const scrollEl = view.dom.querySelector('.cm-table-scroll') as HTMLElement;
    mockRect(scrollEl, { left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300 });
    mockRect(raggedRow.cells[0]!, { left: 0, top: 40, right: 100, bottom: 70, width: 100, height: 30 });

    await Promise.resolve();
    const overlay = view.dom.querySelector('.cm-table-selection-overlay') as HTMLElement;

    // Only as wide as the ragged row's own single rendered cell, never
    // stretched out to the header's full two-column width.
    expect(overlay.style.width).toBe('102px'); // 100 + 2 outward expansion
  });

  it('never renders both a column and a row overlay at once (mutually exclusive by TableSelection\'s own kind)', () => {
    const view = mountViewWithSelectionField(MULTI_ROW_TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 1 }) });

    expect(view.dom.querySelectorAll('.cm-table-selection-overlay')).toHaveLength(1);
  });

  it('the overlay is removed again once a row selection is cleared', () => {
    const view = mountViewWithSelectionField(MULTI_ROW_TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 1 }) });
    expect(view.dom.querySelectorAll('.cm-table-selection-overlay')).toHaveLength(1);

    view.dispatch({ effects: tableSelectionChanged.of(null) });

    expect(view.dom.querySelectorAll('.cm-table-selection-overlay')).toHaveLength(0);
  });
});

describe('tableWidgetField — column ↔ row overlay switching', () => {
  it('switching from a column selection to a row selection replaces the overlay with row geometry', () => {
    const view = mountViewWithSelectionField(MULTI_ROW_TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 0 }) });
    expect(view.dom.querySelectorAll('.cm-table-selection-overlay')).toHaveLength(1);

    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 1 }) });

    // Still exactly one overlay element — the column overlay was replaced
    // (a fresh `TableWidget` instance, per `eq()`'s own
    // `selectedColumnIndex`/`selectedRowIndex` comparison), not
    // accumulated alongside a second one.
    expect(view.dom.querySelectorAll('.cm-table-selection-overlay')).toHaveLength(1);
    const tr = view.dom.querySelector('tbody tr')!;
    expect(tr.classList.contains('cm-table-row-selected')).toBe(true);
  });

  it('switching from a row selection to a column selection replaces the overlay with column geometry', () => {
    const view = mountViewWithSelectionField(MULTI_ROW_TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 1 }) });
    expect(view.dom.querySelectorAll('.cm-table-selection-overlay')).toHaveLength(1);

    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 1 }) });

    expect(view.dom.querySelectorAll('.cm-table-selection-overlay')).toHaveLength(1);
    const headerCells = view.dom.querySelectorAll('thead th');
    expect(headerCells[1]!.classList.contains('cm-table-column-selected')).toBe(true);
    expect(headerCells[0]!.classList.contains('cm-table-column-selected')).toBe(false);
  });
});

/**
 * jsdom does not implement `ResizeObserver` — local mock per
 * `vitest.setup.ts`'s own documented convention (per-test control over
 * exactly when the callback fires, not a global polyfill). Exercises the
 * *real* `TableWidget`/`toDOM()` wiring end to end, not just
 * `tableSelectionOverlay.ts` in isolation — specifically to empirically
 * confirm CM6 actually calls `TableWidget.destroy()` (and therefore
 * disconnects the observer) on a genuine widget replacement, rather than
 * assuming it from reading CM6's own documented contract alone.
 *
 * **Not the only `ResizeObserver` constructed while this mock is
 * installed.** CM6's own `EditorView` constructor builds its own internal
 * `DOMObserver`, which itself constructs a `ResizeObserver` to watch the
 * editor's DOM — entirely unrelated to `tableSelectionOverlay.ts`, and
 * never disconnected by this codebase's own code (nor should it be: it's
 * CM6's own, not ours). Confirmed directly, instrumented: mounting a
 * single `EditorView` alone (no column selected, no resize wiring
 * involved at all) already produces one `MockResizeObserver` instance,
 * before any table-selection dispatch. Every assertion below therefore
 * identifies *our own* observer by what it observes (the real `<table>`
 * element), never by "the only/first/last instance" or "the only
 * non-disconnected instance" — either would wrongly conflate CM6's own,
 * permanently-connected internal observer with (or mistake it for) a
 * leak in this milestone's own resize wiring.
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

function mockRect(el: Element, rect: { left: number; top: number; right: number; bottom: number; width: number; height: number }): void {
  (el as HTMLElement).getBoundingClientRect = () => rect as DOMRect;
}

describe('tableWidgetField — column-selection overlay resize responsiveness', () => {
  let originalResizeObserver: typeof ResizeObserver | undefined;

  beforeEach(() => {
    originalResizeObserver = globalThis.ResizeObserver;
    MockResizeObserver.instances = [];
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver as typeof ResizeObserver;
  });

  /**
   * The observer created by `attachTableSelectionOverlayResize` for the
   * given `<table>` — identified by what it observes, not by position or
   * connectedness among `MockResizeObserver.instances` (see the class's
   * own doc comment above for why: CM6's own internal `DOMObserver`
   * constructs a `ResizeObserver` of its own, indistinguishable from ours
   * by either of those signals).
   */
  function ourObserver(table: Element): MockResizeObserver | undefined {
    return MockResizeObserver.instances.find((o) => o.observed.includes(table));
  }

  it('observes the real, currently-attached <table> element', async () => {
    const view = mountViewWithSelectionField(BASIC_TABLE);
    const table = findAllTables(view.state)[0]!;

    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 0 }) });
    await Promise.resolve(); // let the initial-position microtask run too

    const tableEl = view.dom.querySelector('table')!;
    expect(ourObserver(tableEl)).toBeDefined();
    expect(ourObserver(tableEl)!.observed).toContain(tableEl);
  });

  it('re-measures the overlay against the current cell geometry when the observer fires (simulated resize)', async () => {
    const view = mountViewWithSelectionField(BASIC_TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 0 }) });
    await Promise.resolve();

    const tableEl = view.dom.querySelector('table') as HTMLTableElement;
    const scrollEl = view.dom.querySelector('.cm-table-scroll')!;
    const overlay = view.dom.querySelector('.cm-table-selection-overlay') as HTMLElement;
    const headerCell = tableEl.tHead!.rows[0]!.cells[0]!;
    const bodyCell = tableEl.tBodies[0]!.rows[0]!.cells[0]!;

    // Simulates the layout a narrower window would produce — different
    // numbers than whatever jsdom's own always-zero rects gave the
    // initial (already-verified-elsewhere) positioning pass.
    mockRect(scrollEl, { left: 0, top: 0, right: 500, bottom: 300, width: 500, height: 300 });
    mockRect(headerCell, { left: 10, top: 5, right: 110, bottom: 25, width: 100, height: 20 });
    mockRect(bodyCell, { left: 10, top: 25, right: 110, bottom: 45, width: 100, height: 20 });

    ourObserver(tableEl)!.trigger();

    expect(overlay.style.left).toBe('9px');
    expect(overlay.style.top).toBe('4px');
    expect(overlay.style.width).toBe('102px');
    expect(overlay.style.height).toBe('42px'); // 45 (body bottom) - 5 (header top), +2 outward expansion
  });

  it('disconnects the old observer when selecting a different column replaces the widget', async () => {
    const view = mountViewWithSelectionField(BASIC_TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 0 }) });
    await Promise.resolve();
    const firstTableEl = view.dom.querySelector('table')!;
    const firstObserver = ourObserver(firstTableEl)!;

    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 1 }) });

    expect(firstObserver.disconnected).toBe(true);
    // A fresh, connected observer exists for the new widget instance's
    // own (newly rebuilt) `<table>` element — not zero (under-
    // disconnected) and not the same instance reused unexpectedly.
    const secondTableEl = view.dom.querySelector('table')!;
    const secondObserver = ourObserver(secondTableEl);
    expect(secondObserver).toBeDefined();
    expect(secondObserver!.disconnected).toBe(false);
  });

  it('disconnects the observer when the selection is cleared entirely', async () => {
    const view = mountViewWithSelectionField(BASIC_TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 0 }) });
    await Promise.resolve();
    const tableEl = view.dom.querySelector('table')!;
    const active = ourObserver(tableEl)!;

    view.dispatch({ effects: tableSelectionChanged.of(null) });

    expect(active.disconnected).toBe(true);
  });

  it('disconnects the observer when the root view itself is destroyed', async () => {
    const view = mountViewWithSelectionField(BASIC_TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 0 }) });
    await Promise.resolve();
    const tableEl = view.dom.querySelector('table')!;
    const active = ourObserver(tableEl)!;

    view.destroy();

    expect(active.disconnected).toBe(true);
  });

  it('existing scroll-tracking geometry is unaffected by the resize wiring (same coordinate-space formula)', async () => {
    const view = mountViewWithSelectionField(BASIC_TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 0 }) });
    await Promise.resolve();

    const tableEl = view.dom.querySelector('table') as HTMLTableElement;
    const scrollEl = view.dom.querySelector('.cm-table-scroll') as HTMLElement;
    const overlay = view.dom.querySelector('.cm-table-selection-overlay') as HTMLElement;
    const headerCell = tableEl.tHead!.rows[0]!.cells[0]!;
    const bodyCell = tableEl.tBodies[0]!.rows[0]!.cells[0]!;

    mockRect(scrollEl, { left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200 });
    mockRect(headerCell, { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 });
    mockRect(bodyCell, { left: 0, top: 20, right: 100, bottom: 40, width: 100, height: 20 });
    scrollEl.scrollLeft = 50;

    ourObserver(tableEl)!.trigger();

    // Same scroll-independent conversion the previous milestone's own
    // tests already verify for `positionColumnSelectionOverlay` directly
    // — this just confirms the resize path reuses it, not a second one.
    expect(overlay.style.left).toBe('49px');
  });
});

describe('tableWidgetField — row-selection overlay resize responsiveness', () => {
  let originalResizeObserver: typeof ResizeObserver | undefined;

  beforeEach(() => {
    originalResizeObserver = globalThis.ResizeObserver;
    MockResizeObserver.instances = [];
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver as typeof ResizeObserver;
  });

  // Same identification strategy as the column describe block's own
  // `ourObserver` above (CM6's own internal `DOMObserver` also constructs
  // a `MockResizeObserver` while this mock is installed — see that
  // block's own doc comment) — duplicated rather than shared across
  // `describe` blocks to keep each block's own setup self-contained,
  // matching this file's existing style.
  function ourObserver(table: Element): MockResizeObserver | undefined {
    return MockResizeObserver.instances.find((o) => o.observed.includes(table));
  }

  it('observes the real, currently-attached <table> element for a row selection', async () => {
    const view = mountViewWithSelectionField(MULTI_ROW_TABLE);
    const table = findAllTables(view.state)[0]!;

    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 1 }) });
    await Promise.resolve();

    const tableEl = view.dom.querySelector('table')!;
    expect(ourObserver(tableEl)).toBeDefined();
  });

  it('re-measures the row overlay against the current cell geometry when the observer fires (simulated resize/row-height change)', async () => {
    const view = mountViewWithSelectionField(MULTI_ROW_TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 2 }) });
    await Promise.resolve();

    const tableEl = view.dom.querySelector('table') as HTMLTableElement;
    const scrollEl = view.dom.querySelector('.cm-table-scroll')!;
    const overlay = view.dom.querySelector('.cm-table-selection-overlay') as HTMLElement;
    const selectedRow = tableEl.tBodies[0]!.rows[1]!; // rowIndex 2 → second body row

    // Simulates a row-height change (e.g. a cell's content wrapped to a
    // second line) — different numbers than jsdom's own default all-zero
    // rects the initial positioning pass used.
    mockRect(scrollEl, { left: 0, top: 0, right: 500, bottom: 300, width: 500, height: 300 });
    mockRect(selectedRow.cells[0]!, { left: 10, top: 45, right: 110, bottom: 85, width: 100, height: 40 });
    mockRect(selectedRow.cells[1]!, { left: 110, top: 45, right: 210, bottom: 85, width: 100, height: 40 });

    ourObserver(tableEl)!.trigger();

    expect(overlay.style.left).toBe('9px');
    expect(overlay.style.top).toBe('44px');
    expect(overlay.style.width).toBe('202px');
    expect(overlay.style.height).toBe('42px');
  });

  it('disconnects the old observer when selecting a different row replaces the widget', async () => {
    const view = mountViewWithSelectionField(MULTI_ROW_TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 1 }) });
    await Promise.resolve();
    const firstTableEl = view.dom.querySelector('table')!;
    const firstObserver = ourObserver(firstTableEl)!;

    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 2 }) });

    expect(firstObserver.disconnected).toBe(true);
    const secondTableEl = view.dom.querySelector('table')!;
    const secondObserver = ourObserver(secondTableEl);
    expect(secondObserver).toBeDefined();
    expect(secondObserver!.disconnected).toBe(false);
  });

  it('disconnects the observer when a row selection is cleared entirely', async () => {
    const view = mountViewWithSelectionField(MULTI_ROW_TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 1 }) });
    await Promise.resolve();
    const tableEl = view.dom.querySelector('table')!;
    const active = ourObserver(tableEl)!;

    view.dispatch({ effects: tableSelectionChanged.of(null) });

    expect(active.disconnected).toBe(true);
  });

  it('a row selection continues to track horizontal scroll (same coordinate-space formula as column selection)', async () => {
    const view = mountViewWithSelectionField(MULTI_ROW_TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 1 }) });
    await Promise.resolve();

    const tableEl = view.dom.querySelector('table') as HTMLTableElement;
    const scrollEl = view.dom.querySelector('.cm-table-scroll') as HTMLElement;
    const overlay = view.dom.querySelector('.cm-table-selection-overlay') as HTMLElement;
    const selectedRow = tableEl.tBodies[0]!.rows[0]!;

    mockRect(scrollEl, { left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200 });
    mockRect(selectedRow.cells[0]!, { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 });
    mockRect(selectedRow.cells[1]!, { left: 100, top: 0, right: 200, bottom: 20, width: 100, height: 20 });
    scrollEl.scrollLeft = 50;

    ourObserver(tableEl)!.trigger();

    expect(overlay.style.left).toBe('49px');
  });
});
