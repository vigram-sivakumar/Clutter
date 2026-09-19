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

function clickCell(cell: Element): void {
  wrapperOf(cell).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
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
    // click — activating a cell never itself changes the root selection
    // (`TableActiveCellController.activate()`), so this is the realistic
    // way the root selection can still overlap the table while a cell is
    // active.
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
