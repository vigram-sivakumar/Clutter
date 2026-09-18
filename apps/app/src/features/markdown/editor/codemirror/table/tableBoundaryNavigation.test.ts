// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { TableActiveCellController } from './tableActiveCellController';
import { tableBoundaryNavigation } from './tableBoundaryNavigation';
import { tableCellNavigation } from './tableCellNavigation';
import { findEnclosingTable } from './tableGeometry';
import { tableWidgetDecoration } from './tableWidgetField';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

/**
 * A real root `EditorView` with the actual rendered table widget DOM
 * (`tableWidgetDecoration`) — required, not a shortcut: `tableBoundaryNavigation`'s
 * whole mechanism is locating a target cell's `.cm-table-cell-wrapper` out
 * of the *rendered* DOM (there is no click event to read it from), so a
 * test that never actually renders the widget could not exercise it.
 */
function mountRootView(doc: string, pos: number): { view: EditorView; controller: TableActiveCellController } {
  const controller = new TableActiveCellController();
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(pos),
      extensions: [markdownLanguageExtension(), tableWidgetDecoration(controller), tableBoundaryNavigation(controller)],
    }),
    parent,
  });
  controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);
  mountedViews.push(view);
  return { view, controller };
}

function dispatchKey(view: EditorView, key: string): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

const TABLE = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';

describe('tableBoundaryNavigation — ArrowDown enters the table from the line directly above it', () => {
  it('activates the header\'s first column, landing at its content start', () => {
    const doc = 'Above.\n' + TABLE;
    const { view, controller } = mountRootView(doc, 'Above.'.length);

    dispatchKey(view, 'ArrowDown');

    expect(controller.nestedView).not.toBeNull();
    expect(controller.nestedView!.state.doc.toString()).toBe('Name');
    expect(controller.nestedView!.state.selection.main.head).toBe(0);
  });

  it('does not intercept when a blank line separates the cursor from the table (not genuinely adjacent)', () => {
    const doc = 'Above.\n\n' + TABLE;
    const { view, controller } = mountRootView(doc, 'Above.'.length);

    dispatchKey(view, 'ArrowDown');

    expect(controller.nestedView).toBeNull();
  });

  it('does not intercept when the cursor is nowhere near a table', () => {
    const { view, controller } = mountRootView('Just a paragraph.\nAnother line.', 0);

    dispatchKey(view, 'ArrowDown');

    expect(controller.nestedView).toBeNull();
  });
});

describe('tableBoundaryNavigation — ArrowUp enters the table from the line directly below it', () => {
  // The "line directly below the table" fixture here is a blank line, not
  // bare prose — deliberately: GFM's own lazy-continuation rule absorbs a
  // non-blank, non-pipe line directly following a table (no blank line
  // between) *into* the table itself as a ragged one-cell row (confirmed
  // directly: `findEnclosingTable`'s own reported `.to` extended across
  // such a line entirely) — that "line" is not actually root-editor
  // territory at all, so a root cursor could never legitimately sit there
  // outside the widget to begin with. A blank line is what every real
  // activation already leaves below a table (prior task), so it's also
  // the realistic fixture here.
  it('activates the last row\'s first column, landing at its content start', () => {
    const doc = TABLE + '\n'; // exactly one blank line below — directly adjacent
    const { view, controller } = mountRootView(doc, doc.length);

    dispatchKey(view, 'ArrowUp');

    expect(controller.nestedView).not.toBeNull();
    expect(controller.nestedView!.state.doc.toString()).toBe('Vik');
    expect(controller.nestedView!.state.selection.main.head).toBe(0);
  });

  it('does not intercept when the cursor is not genuinely adjacent to the table (an extra blank line further down)', () => {
    const doc = TABLE + '\n\n'; // two blank lines — cursor lands one past "directly below"
    const { view, controller } = mountRootView(doc, doc.length);

    dispatchKey(view, 'ArrowUp');

    expect(controller.nestedView).toBeNull();
  });
});

describe('tableBoundaryNavigation — vertical movement continues through table rows via the existing nested-editor keymap', () => {
  it('ArrowDown from the entered header row moves to the same column in the next row (regression: entry composes with existing in-table movement)', () => {
    const doc = 'Above.\n' + TABLE;
    const { view, controller } = mountRootView(doc, 'Above.'.length);
    dispatchKey(view, 'ArrowDown'); // enters header, column 0 ("Name")
    expect(controller.nestedView!.state.doc.toString()).toBe('Name');

    dispatchKey(controller.nestedView!, 'ArrowDown');

    // Row 1 is the delimiter row — not navigable — so same-column ArrowDown
    // lands on row 2, the first real data row ("Vik").
    expect(controller.nestedView!.state.doc.toString()).toBe('Vik');
  });

  it('ArrowUp from the entered last row moves up through rows toward the header', () => {
    const doc = TABLE + '\n';
    const { view, controller } = mountRootView(doc, doc.length);
    dispatchKey(view, 'ArrowUp'); // enters last row, column 0 ("Vik")
    expect(controller.nestedView!.state.doc.toString()).toBe('Vik');

    dispatchKey(controller.nestedView!, 'ArrowUp');

    expect(controller.nestedView!.state.doc.toString()).toBe('Name');
  });
});

describe('tableBoundaryNavigation — invariant: the root selection never resolves inside the table\'s own range', () => {
  it('after ArrowDown-entry, the root view\'s own selection stays exactly where it was (outside the table) — activation moves focus, not root selection', () => {
    const doc = 'Above.\n' + TABLE;
    const aboveEnd = 'Above.'.length;
    const { view, controller } = mountRootView(doc, aboveEnd);

    dispatchKey(view, 'ArrowDown');

    expect(controller.nestedView).not.toBeNull();
    const table = findEnclosingTable(view.state, view.state.doc.length - 1)!;
    const head = view.state.selection.main.head;
    expect(head < table.from || head >= table.to).toBe(true);
    expect(view.state.selection.main.head).toBe(aboveEnd);
  });

  it('after ArrowUp-entry, the root view\'s own selection stays exactly where it was (outside the table)', () => {
    const doc = TABLE + '\n';
    const { view, controller } = mountRootView(doc, doc.length);

    dispatchKey(view, 'ArrowUp');

    expect(controller.nestedView).not.toBeNull();
    const table = findEnclosingTable(view.state, 0)!;
    const head = view.state.selection.main.head;
    expect(head < table.from || head >= table.to).toBe(true);
    expect(view.state.selection.main.head).toBe(doc.length);
  });

  it('the table\'s own Markdown source is completely unchanged by entering it', () => {
    const doc = 'Above.\n' + TABLE + '\nBelow.';
    const { view } = mountRootView(doc, 'Above.'.length);

    dispatchKey(view, 'ArrowDown');

    expect(view.state.doc.toString()).toBe(doc);
  });
});

describe('tableBoundaryNavigation + tableCellNavigation — exiting re-renders the table\'s rendered DOM immediately (no stale blank cell)', () => {
  // Regression for a real bug found via live-browser testing: the root
  // selection could land correctly on exit while the table's own rendered
  // widget DOM stayed stale — the just-vacated cell's wrapper (whose only
  // child, the nested editor's DOM, `controller.deactivate()` had just
  // removed) stayed visibly blank until some *unrelated* later edit
  // happened to force tableWidgetField's own decoration rebuild. These
  // checks read the actual rendered `.cm-table-widget` text immediately
  // after the exit dispatch, with no follow-up edit — exactly the
  // "cursor exits fine, but the header text disappears" symptom reported.
  it('ArrowUp-exit from the header leaves the header\'s own text correctly rendered, not blank', () => {
    const doc = 'Above.\n' + TABLE;
    const { view, controller } = mountRootView(doc, 'Above.'.length);
    dispatchKey(view, 'ArrowDown'); // enter the header's first cell ("Name")
    expect(controller.nestedView).not.toBeNull();

    dispatchKey(controller.nestedView!, 'ArrowUp'); // exit back above

    expect(controller.activeAnchor).toBeNull();
    const widgetText = view.dom.querySelector('.cm-table-widget')?.textContent;
    expect(widgetText).toContain('Name');
    expect(widgetText).toContain('Role');
  });

  it('ArrowDown-exit from the last row leaves that row\'s own text correctly rendered, not blank', () => {
    const doc = TABLE + '\n';
    const { view, controller } = mountRootView(doc, doc.length);
    dispatchKey(view, 'ArrowUp'); // enter the last row's first cell ("Vik")
    expect(controller.nestedView).not.toBeNull();

    dispatchKey(controller.nestedView!, 'ArrowDown'); // exit below

    expect(controller.activeAnchor).toBeNull();
    const widgetText = view.dom.querySelector('.cm-table-widget')?.textContent;
    expect(widgetText).toContain('Vik');
    expect(widgetText).toContain('Designer');
  });

  it('exiting returns keyboard focus to the root editor (not left on the now-detached nested editor)', () => {
    const doc = 'Above.\n' + TABLE;
    const { view, controller } = mountRootView(doc, 'Above.'.length);
    dispatchKey(view, 'ArrowDown');
    expect(controller.nestedView).not.toBeNull();

    dispatchKey(controller.nestedView!, 'ArrowUp');

    expect(view.hasFocus).toBe(true);
  });
});
