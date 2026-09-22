// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { selectAll } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { buildEditorExtensions, type BuildEditorExtensionsOptions } from '../buildEditorExtensions';
import { TableActiveCellController } from './tableActiveCellController';
import { tableCellNavigation } from './tableCellNavigation';
import { tableDeletionSelectionChanged } from './tableDeletionSelection';
import { findAllTables } from './tableGeometry';
import { tableSelectionChanged, tableSelectionField } from './tableSelection';

/**
 * Table selection halo milestone — verifies that the same
 * `.cm-table-wrapper-selected` visual `tableDeletionSelection.ts`'s
 * whole-table arm/delete state already uses is also shown whenever the
 * root `EditorState.selection` genuinely overlaps a table's own source
 * range (Ctrl+A, or an ordinary drag/shift-selection spanning across it),
 * and suppressed while a cell inside that table is actively being edited.
 * Mounted via `buildEditorExtensions()` (the real production wiring),
 * same convention `tableLiveWiring.test.ts` already establishes, so
 * `tableRootSelectionSnap`, `tableWidgetField`, and `tableDeletionSelection`
 * are all exercised together exactly as they run in the app.
 */

const REQUIRED: Omit<BuildEditorExtensionsOptions, 'readOnly' | 'hostPageId' | 'getTableActiveCellController'> = {
  resolveWikiLink: () => undefined,
  resolveEmbedImage: () => undefined,
  resolveEmbedPdf: () => undefined,
  onImageClick: () => undefined,
  onOpenImageMenu: () => undefined,
  onPdfEmbedClick: () => undefined,
  onOpenPdfMenu: () => undefined,
  resolveImageSrc: () => undefined,
  resolveTag: () => undefined,
  resolveDate: () => undefined,
};

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

function mount(doc: string, controller?: TableActiveCellController): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: buildEditorExtensions({
        ...REQUIRED,
        readOnly: false,
        hostPageId: 'test-page',
        getTableActiveCellController: controller ? () => controller : undefined,
      }),
    }),
    parent,
  });
  mountedViews.push(view);
  return view;
}

function wrapperOf(cell: Element): Element {
  const wrapper = cell.querySelector(':scope > .cm-table-cell-wrapper');
  if (!wrapper) {
    throw new Error('cell has no .cm-table-cell-wrapper: ' + cell.outerHTML);
  }
  return wrapper;
}

/** A plain click, end to end — see `tableLiveWiring.test.ts`'s own `clickCell` doc comment: activation happens synchronously on `mousedown`; `mouseup` just lets `beginCellDragTracking`'s own per-gesture listeners clean themselves up. */
function clickCell(cell: Element): void {
  wrapperOf(cell).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
}

function findCell(view: EditorView, text: string): Element {
  const cell = Array.from(view.dom.querySelectorAll('th, td')).find((el) => el.textContent === text);
  if (!cell) {
    throw new Error(`no cell with text "${text}"`);
  }
  return cell;
}

/**
 * Real end-to-end handle click (`tableHandleOverlay.ts`'s own `click`
 * binding, not a synthetic `tableSelectionChanged` dispatch) against the
 * header's first cell — `.cm-table-column-handle-hit`/`.cm-table-row-handle-hit`
 * are always present in the rendered widget (visibility is a separate
 * hover/selected CSS concern the click listener itself doesn't gate on),
 * but the click handler's own `currentColumnIndex`/`currentRowIndex`
 * *do* gate on having been hovered first (`tableHandleOverlay.ts`'s own
 * `pointermove` handler) — a bare click with no prior hover is silently a
 * no-op, exactly `tableHandleOverlay.test.ts`'s own `hoverBodyCell` +
 * `click` pairing already accounts for.
 */
function clickHandle(view: EditorView, axis: 'column' | 'row'): void {
  const wrapper = view.dom.querySelector('.cm-table-wrapper');
  const cell = view.dom.querySelector('th, td');
  if (!wrapper || !cell) {
    throw new Error('no rendered table to hover/click');
  }
  const hoverEvent = new Event('pointermove', { bubbles: true });
  Object.defineProperty(hoverEvent, 'target', { value: cell });
  wrapper.dispatchEvent(hoverEvent);

  const hitArea = view.dom.querySelector(`.cm-table-${axis}-handle-hit`);
  if (!hitArea) {
    throw new Error(`no .cm-table-${axis}-handle-hit in rendered widget`);
  }
  hitArea.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

/** Every currently-haloed table widget's own `.cm-table-widget[data-table-from]` value, as numbers, in DOM order. */
function haloedTableFroms(view: EditorView): number[] {
  return Array.from(view.dom.querySelectorAll('.cm-table-widget')).flatMap((widget) => {
    const haloed = widget.querySelector(':scope > .cm-table-wrapper.cm-table-wrapper-selected');
    if (!haloed) {
      return [];
    }
    const from = widget.getAttribute('data-table-from');
    return from === null ? [] : [Number(from)];
  });
}

const BASIC_TABLE = '| a | b |\n| - | - |\n| 1 | 2 |';

describe('table selection halo — Ctrl+A / Select All', () => {
  it('table-only document: the table shows the halo', () => {
    const view = mount(BASIC_TABLE);

    selectAll(view);

    expect(haloedTableFroms(view)).toHaveLength(1);
  });

  it('table with content above and below: the table shows the halo', () => {
    const doc = `Above.\n${BASIC_TABLE}\n\nBelow.`;
    const view = mount(doc);

    selectAll(view);

    expect(haloedTableFroms(view)).toHaveLength(1);
  });

  it('multiple tables: every table shows the halo', () => {
    const doc = `${BASIC_TABLE}\n\nBetween.\n\n${BASIC_TABLE}`;
    const view = mount(doc);

    selectAll(view);

    expect(haloedTableFroms(view)).toHaveLength(2);
  });
});

describe('table selection halo — ordinary text selection', () => {
  it('a selection dragged across a table shows its halo', () => {
    const doc = `Above.\n${BASIC_TABLE}\n\nBelow.`;
    const view = mount(doc);
    const from = doc.indexOf('Above');
    const to = doc.indexOf('Below') + 'Below'.length;

    view.dispatch({ selection: { anchor: from, head: to } });

    expect(haloedTableFroms(view)).toHaveLength(1);
  });

  it('a selection covering only the first of two tables leaves the second without a halo', () => {
    const doc = `${BASIC_TABLE}\n\nBetween.\n\n${BASIC_TABLE}`;
    const view = mount(doc);
    const firstTable = findAllTables(view.state)[0]!;
    const to = doc.indexOf('Between.') + 'Between.'.length;

    view.dispatch({ selection: { anchor: 0, head: to } });

    const haloed = haloedTableFroms(view);
    expect(haloed).toEqual([firstTable.from]);
  });

  it('collapsing the selection outside every table removes the halo', () => {
    const doc = `Above.\n${BASIC_TABLE}\n\nBelow.`;
    const view = mount(doc);
    const from = doc.indexOf('Above');
    const to = doc.indexOf('Below') + 'Below'.length;
    view.dispatch({ selection: { anchor: from, head: to } });
    expect(haloedTableFroms(view)).toHaveLength(1);

    view.dispatch({ selection: { anchor: doc.indexOf('Below.') } });

    expect(haloedTableFroms(view)).toHaveLength(0);
  });
});

describe('table selection halo — coexistence with whole-table deletion arming', () => {
  it('a table armed for whole-table deletion still shows the halo (no root selection overlap needed)', () => {
    // Exactly one trailing blank line — the one position
    // `tableDeletionSelectionField`'s own re-validation
    // (`isCaretJustBelowTable`) accepts as "adjacent," immediately below
    // the table.
    const doc = `${BASIC_TABLE}\n`;
    const view = mount(doc);
    const table = findAllTables(view.state)[0]!;
    // Collapsed caret on that blank line — never overlaps the table per
    // `tableIntersectsSelectionRange`'s own `!range.empty` guard —
    // confirming the halo here comes from the arm effect, not selection
    // overlap.
    view.dispatch({ selection: { anchor: doc.length }, effects: tableDeletionSelectionChanged.of(table.from) });

    expect(haloedTableFroms(view)).toEqual([table.from]);
  });
});

describe('table selection halo — suppressed during active-cell editing', () => {
  it('does not show the halo for a table whose cell is currently active, even if the root selection still technically overlaps it', () => {
    const controller = new TableActiveCellController();
    const view = mount(BASIC_TABLE, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    // Simulate a stale full-document selection left over from before the
    // click — this is the realistic way the root selection can still
    // overlap the table right up to the moment of the click.
    selectAll(view);
    expect(haloedTableFroms(view)).toHaveLength(1);

    clickCell(findCell(view, 'a'));

    expect(haloedTableFroms(view)).toHaveLength(0);
    // The active cell itself did mount, confirming activation genuinely
    // happened rather than the halo merely disappearing for an unrelated
    // reason.
    expect(view.dom.querySelector('.cm-table-widget .cm-editor')).not.toBeNull();
  });

});

describe('table selection halo — suppressed while a TableSelection exists', () => {
  it('does not show the halo for a table with a column TableSelection, even if the root selection still technically overlaps it', () => {
    const view = mount(BASIC_TABLE);
    const table = findAllTables(view.state)[0]!;

    // Same "stale full-document selection" setup as the active-cell
    // suppression test above — a `TableSelection` never itself moves the
    // root selection either (`tableHandleOverlay.ts`'s own click
    // dispatch), so this is the realistic way the two can coexist.
    selectAll(view);
    expect(haloedTableFroms(view)).toHaveLength(1);

    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 0 }) });

    expect(haloedTableFroms(view)).toHaveLength(0);
    // The minimal column-selected rendering did apply, confirming the halo
    // genuinely got suppressed by the selection rather than disappearing
    // for an unrelated reason.
    expect(view.dom.querySelector('.cm-table-column-selected')).not.toBeNull();
  });

  it('does not show the halo for a table with a row TableSelection', () => {
    const view = mount(BASIC_TABLE);
    const table = findAllTables(view.state)[0]!;

    selectAll(view);
    expect(haloedTableFroms(view)).toHaveLength(1);

    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 1 }) });

    expect(haloedTableFroms(view)).toHaveLength(0);
    expect(view.dom.querySelector('.cm-table-row-selected')).not.toBeNull();
  });

  it('clearing the TableSelection restores the halo if the root selection still overlaps the table', () => {
    const view = mount(BASIC_TABLE);
    const table = findAllTables(view.state)[0]!;
    selectAll(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 0 }) });
    expect(haloedTableFroms(view)).toHaveLength(0);

    view.dispatch({ effects: tableSelectionChanged.of(null) });

    expect(haloedTableFroms(view)).toHaveLength(1);
  });

  it('a real column-handle click while Ctrl+A is active replaces the whole-table halo with an explicit column TableSelection', () => {
    // A controller is required for `TableWidget` to render the handle
    // overlay at all (`tableWidget.ts`'s own `if (this.controller)` gate,
    // the same "omit the capability entirely" gate a read-only table's
    // widget uses) — not needed for this test's own assertions otherwise.
    const controller = new TableActiveCellController();
    const view = mount(BASIC_TABLE, controller);

    selectAll(view);
    expect(haloedTableFroms(view)).toHaveLength(1);

    clickHandle(view, 'column');

    expect(haloedTableFroms(view)).toHaveLength(0);
    expect(view.dom.querySelector('.cm-table-column-selected')).not.toBeNull();
    const selection = view.state.field(tableSelectionField, false) ?? null;
    expect(selection?.kind).toBe('column');
  });

  it('a real row-handle click while Ctrl+A is active replaces the whole-table halo with an explicit row TableSelection', () => {
    const controller = new TableActiveCellController();
    const view = mount(BASIC_TABLE, controller);

    selectAll(view);
    expect(haloedTableFroms(view)).toHaveLength(1);

    clickHandle(view, 'row');

    expect(haloedTableFroms(view)).toHaveLength(0);
    expect(view.dom.querySelector('.cm-table-row-selected')).not.toBeNull();
    const selection = view.state.field(tableSelectionField, false) ?? null;
    expect(selection?.kind).toBe('row');
  });
});

describe('table selection halo — a root selection spanning the table is a single whole-table visual, never per-cell', () => {
  it('shows exactly the one wrapper-level halo class and no row/column-selected class on any cell', () => {
    const doc = `Above.\n${BASIC_TABLE}\n\nBelow.`;
    const view = mount(doc);
    const from = doc.indexOf('Above');
    const to = doc.indexOf('Below') + 'Below'.length;

    view.dispatch({ selection: { anchor: from, head: to } });

    expect(haloedTableFroms(view)).toHaveLength(1);
    // The halo is the wrapper's own single background — no explicit
    // TableSelection exists here, so none of its per-cell rendering
    // (`selectedColumnIndex`/`selectedRowIndex`/`selectedRange`) should
    // ever be present alongside it.
    expect(view.dom.querySelector('.cm-table-row-selected')).toBeNull();
    expect(view.dom.querySelector('.cm-table-column-selected')).toBeNull();
    expect(view.dom.querySelector('.cm-table-selection-overlay-visible')).toBeNull();
  });

  it('does NOT touch the actual root CM6 selection — only how it paints inside the table widget', () => {
    // Regression guard for a prior wrong fix on this same feature: the
    // root selection must keep genuinely containing the table's own
    // source range whenever it does (Copy/Cut/undo/redo and every other
    // document-selection semantic depend on that staying true) — only the
    // *painting* of that selection inside the table widget changes
    // (`tableWidget.css`'s own `::selection` rule), never the selection
    // itself.
    const doc = `Above.\n${BASIC_TABLE}\n\nBelow.`;
    const view = mount(doc);
    const from = doc.indexOf('Above');
    const to = doc.indexOf('Below') + 'Below'.length;

    view.dispatch({ selection: { anchor: from, head: to } });

    expect(view.state.selection.main.from).toBe(from);
    expect(view.state.selection.main.to).toBe(to);
    expect(view.state.sliceDoc(from, to)).toBe(doc.slice(from, to));
  });
});

describe('tableWidget.css — native ::selection suppression', () => {
  const css = readFileSync(join(__dirname, 'tableWidget.css'), 'utf8');

  it('suppresses native ::selection painting inside .cm-table-widget', () => {
    const match = css.match(/\.cm-editor\s+\.cm-table-widget\s+::selection\s*\{([^}]*)\}/);

    expect(match, '.cm-editor .cm-table-widget ::selection rule not found').not.toBeNull();
    expect(match![1]).toMatch(/background\s*:\s*transparent\s*;/);
  });

  it('is NOT !important — required so CM6\'s own !important .cm-line rule (drawSelection()\'s hideNativeSelection) always wins inside the active cell\'s nested editor, which owns its own real .cm-line elements and its own selection rendering entirely', () => {
    const match = css.match(/\.cm-editor\s+\.cm-table-widget\s+::selection\s*\{([^}]*)\}/);

    expect(match, '.cm-editor .cm-table-widget ::selection rule not found').not.toBeNull();
    expect(match![1]).not.toMatch(/!important/);
  });
});
