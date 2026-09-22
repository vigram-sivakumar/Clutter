// @vitest-environment jsdom
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
 * Table selection halo — `.cm-table-wrapper-selected` reflects exactly one
 * thing: this exact table is armed for whole-table Backspace/Delete
 * (`tableDeletionSelection.ts`). It is deliberately **not** derived from
 * the root `EditorState.selection` — see `tableWidgetField.ts`'s own
 * `buildTableWidgetRange` doc comment for why a prior milestone's
 * "root selection overlapping the table shows the halo too" behavior was
 * reversed: an ordinary document text selection (a drag, Shift+Arrow, or
 * `Ctrl+A`) that happens to span or overlap a table's source range is not
 * the user selecting the table, and showing the same visual for both made
 * them visually indistinguishable. Mounted via `buildEditorExtensions()`
 * (the real production wiring), same convention `tableLiveWiring.test.ts`
 * already establishes, so `tableRootSelectionSnap`, `tableWidgetField`,
 * and `tableDeletionSelection` are all exercised together exactly as they
 * run in the app.
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

describe('table selection halo — armed for whole-table deletion', () => {
  it('a table armed for whole-table deletion shows the halo', () => {
    // Exactly one trailing blank line — the one position
    // `tableDeletionSelectionField`'s own re-validation
    // (`isCaretJustBelowTable`) accepts as "adjacent," immediately below
    // the table.
    const doc = `${BASIC_TABLE}\n`;
    const view = mount(doc);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ selection: { anchor: doc.length }, effects: tableDeletionSelectionChanged.of(table.from) });

    expect(haloedTableFroms(view)).toEqual([table.from]);
  });
});

describe('table selection halo — ordinary root text selection never shows it', () => {
  it('table-only document: Ctrl+A does not halo the table', () => {
    const view = mount(BASIC_TABLE);

    selectAll(view);

    expect(haloedTableFroms(view)).toHaveLength(0);
  });

  it('table with content above and below: Ctrl+A does not halo the table', () => {
    const doc = `Above.\n${BASIC_TABLE}\n\nBelow.`;
    const view = mount(doc);

    selectAll(view);

    expect(haloedTableFroms(view)).toHaveLength(0);
  });

  it('multiple tables: Ctrl+A does not halo either table', () => {
    const doc = `${BASIC_TABLE}\n\nBetween.\n\n${BASIC_TABLE}`;
    const view = mount(doc);

    selectAll(view);

    expect(haloedTableFroms(view)).toHaveLength(0);
  });

  it('a selection dragged from above the table to below it does not halo the table', () => {
    const doc = `Above.\n${BASIC_TABLE}\n\nBelow.`;
    const view = mount(doc);
    const from = doc.indexOf('Above');
    const to = doc.indexOf('Below') + 'Below'.length;

    view.dispatch({ selection: { anchor: from, head: to } });

    expect(haloedTableFroms(view)).toHaveLength(0);
  });

  it('a selection covering only the first of two tables does not halo either table', () => {
    const doc = `${BASIC_TABLE}\n\nBetween.\n\n${BASIC_TABLE}`;
    const view = mount(doc);
    const to = doc.indexOf('Between.') + 'Between.'.length;

    view.dispatch({ selection: { anchor: 0, head: to } });

    expect(haloedTableFroms(view)).toHaveLength(0);
  });
});

describe('table selection halo — cell activation clears a stale root selection', () => {
  it('clicking a cell while a root selection spans the table collapses the root selection', () => {
    const controller = new TableActiveCellController();
    const doc = `Above.\n${BASIC_TABLE}\n\nBelow.`;
    const view = mount(doc, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    const from = doc.indexOf('Above');
    const to = doc.indexOf('Below') + 'Below'.length;
    view.dispatch({ selection: { anchor: from, head: to } });
    expect(view.state.selection.main.empty).toBe(false);

    clickCell(findCell(view, 'a'));

    expect(view.state.selection.main.empty).toBe(true);
    // The active cell itself did mount, confirming activation genuinely
    // happened rather than the selection merely collapsing for an
    // unrelated reason.
    expect(view.dom.querySelector('.cm-table-widget .cm-editor')).not.toBeNull();
  });

  it('clicking a cell while a root selection spans the table also clears any TableSelection', () => {
    const controller = new TableActiveCellController();
    const doc = `Above.\n${BASIC_TABLE}\n\nBelow.`;
    const view = mount(doc, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);
    const table = findAllTables(view.state)[0]!;

    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 0 }) });
    const from = doc.indexOf('Above');
    const to = doc.indexOf('Below') + 'Below'.length;
    view.dispatch({ selection: { anchor: from, head: to } });

    clickCell(findCell(view, 'a'));

    expect(view.state.field(tableSelectionField, false) ?? null).toBeNull();
    expect(view.state.selection.main.empty).toBe(true);
  });

  it('clicking a cell with an already-collapsed root selection leaves it collapsed at the same place it would otherwise be', () => {
    const controller = new TableActiveCellController();
    const view = mount(BASIC_TABLE, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    clickCell(findCell(view, 'a'));

    expect(view.state.selection.main.empty).toBe(true);
    expect(view.dom.querySelector('.cm-table-widget .cm-editor')).not.toBeNull();
  });
});
