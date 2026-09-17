// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { buildEditorExtensions, type BuildEditorExtensionsOptions } from '../buildEditorExtensions';
import { TableActiveCellController } from './tableActiveCellController';
import { tableCellNavigation } from './tableCellNavigation';

/**
 * M5 (docs/table-implementation-plan.md) — verifies the actual production
 * wiring path: `buildEditorExtensions()` (not a hand-assembled extension
 * list), with a real `TableActiveCellController` for the editable case and
 * none for the read-only case (`NoteEmbedWidget.ts`'s own shape). Mounts a
 * plain `EditorView` directly rather than the full `MarkdownEditor.tsx`
 * React component — same "test the CM6 extension, not the component"
 * convention `NoteEmbedWidget`'s own tests already use.
 *
 * jsdom's focus model is a simplified approximation of a real browser's —
 * it tracks `document.activeElement` for explicit `.focus()` calls (so
 * `TableActiveCellController.activate()`'s own `nestedView.focus()`, Fix
 * 2, is verifiable here), but does not reliably reproduce the specific
 * failure this milestone's own live investigation found (moving a
 * focused, live DOM node into a still-detached subtree blurs it in a real
 * browser). Tests below cover everything jsdom's model can faithfully
 * assert; the rebuild-focus-restoration fix itself (Fix 3) is verified
 * live in a real browser instead — see this session's own manual
 * checklist.
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

function mount(doc: string, readOnly: boolean, controller?: TableActiveCellController): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: buildEditorExtensions({
        ...REQUIRED,
        readOnly,
        hostPageId: 'test-page',
        getTableActiveCellController: controller ? () => controller : undefined,
      }),
    }),
    parent,
  });
  mountedViews.push(view);
  return view;
}

/** The stable per-cell mount point (M5 DOM-structure fix) — this is where a real click actually lands (it visually fills the `<th>`/`<td>`), and where the cell's own `mousedown` listener is attached; dispatching on the `<th>`/`<td>` itself wouldn't bubble down to it. */
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

const TABLE = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';

describe('table live wiring — DOM structure', () => {
  it('the widget is a div.cm-table-widget[contenteditable=false] wrapping a div.cm-table-wrapper wrapping the real <table>', () => {
    const view = mount(TABLE, true);

    const widget = view.dom.querySelector(':scope .cm-table-widget');
    expect(widget?.tagName).toBe('DIV');
    expect((widget as HTMLElement)?.contentEditable).toBe('false');

    const wrapper = widget?.querySelector(':scope > .cm-table-wrapper');
    expect(wrapper?.tagName).toBe('DIV');

    const table = wrapper?.querySelector(':scope > table');
    expect(table).not.toBeNull();
    expect(table?.className).toBe(''); // the <table> itself carries no class — cm-table-widget is the outer div now
  });

  it('every header and data cell wraps its content in one .cm-table-cell-wrapper, both structural elements otherwise empty of content', () => {
    const view = mount(TABLE, true);

    const cells = view.dom.querySelectorAll('th, td');
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of Array.from(cells)) {
      expect(cell.children).toHaveLength(1);
      expect(cell.children[0]?.classList.contains('cm-table-cell-wrapper')).toBe(true);
    }
    expect(findCell(view, 'Vik').querySelector('.cm-table-cell-wrapper')?.textContent).toBe('Vik');
  });
});

describe('table live wiring — read-only (note embed) table', () => {
  it('renders as a real <table> with the same wrapper structure, but clicking a cell does nothing — no activation, no nested editor', () => {
    const view = mount(TABLE, true);

    const table = view.dom.querySelector('.cm-table-widget');
    expect(table).not.toBeNull();
    const dataCell = findCell(view, 'Vik');

    clickCell(dataCell);

    expect(view.dom.querySelector('.cm-table-widget .cm-editor')).toBeNull();
    expect(findCell(view, 'Vik').querySelector('.cm-table-cell-wrapper')?.textContent).toBe('Vik');
  });
});

describe('table live wiring — editable top-level table', () => {
  it('clicking an inactive cell activates it: mounts the nested editor inside that cell\'s own wrapper, with the caret placed there', () => {
    const controller = new TableActiveCellController();
    const view = mount(TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    clickCell(findCell(view, 'Vik'));

    expect(controller.nestedView).not.toBeNull();
    expect(controller.nestedView!.state.doc.toString()).toBe('Vik');
    // Re-queried, not a pre-click reference — activating rebuilds
    // tableWidgetField's decorations (the tableActiveCellChanged marker
    // effect), which replaces the whole <table> DOM subtree with a fresh
    // one; any element reference from before the click is now detached.
    const activeWrapper = Array.from(view.dom.querySelectorAll('.cm-table-cell-wrapper')).find((w) => w.contains(controller.nestedView!.dom));
    expect(activeWrapper).toBeDefined();
    // The nested editor's .cm-editor is a direct child of .cm-table-cell-wrapper
    // (never of <td> directly), and the full ancestor chain matches the
    // widget's own documented structure: widget > .cm-table-wrapper > table > td > .cm-table-cell-wrapper > .cm-editor.
    expect(controller.nestedView!.dom.parentElement).toBe(activeWrapper);
    expect(activeWrapper!.parentElement?.tagName).toBe('TD');
    expect(activeWrapper!.closest('.cm-table-widget > .cm-table-wrapper > table')).not.toBeNull();
  });

  it('clicking a cell focuses the nested editor, and the root editor does not retain focus', async () => {
    // Asserted via document.activeElement — jsdom faithfully reproduces
    // the real-browser behavior this milestone's own investigation found
    // (moving a focused node into a still-detached subtree blurs it), so
    // even this very first activation needs Fix 3's own microtask-deferred
    // restore to settle before focus reflects the final, correct state:
    // activate() itself synchronously triggers one rebuild (the
    // tableActiveCellChanged dispatch), which momentarily blurs the just-
    // mounted nested editor exactly like any later typing-triggered
    // rebuild would.
    const controller = new TableActiveCellController();
    const view = mount(TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);
    view.focus(); // establish a baseline: root genuinely focused first
    expect(document.activeElement).toBe(view.contentDOM);

    clickCell(findCell(view, 'Vik'));
    await Promise.resolve(); // flush the queueMicrotask-deferred focus restore

    expect(document.activeElement).toBe(controller.nestedView!.contentDOM);
    expect(document.activeElement).not.toBe(view.contentDOM);
  });

  it('focus is restored to the nested editor after the table-widget rebuild a cell edit itself triggers', async () => {
    const controller = new TableActiveCellController();
    const view = mount(TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    clickCell(findCell(view, 'Vik'));
    await Promise.resolve();
    const nested = controller.nestedView!;
    expect(document.activeElement).toBe(nested.contentDOM);

    // Typing forwards to root, which rebuilds tableWidgetField's
    // decorations and moves this same nested editor's DOM into a fresh
    // <table> — the exact rebuild that blurred it before Fix 3.
    nested.dispatch({ changes: { from: 3, to: 3, insert: 'tor' } });
    expect(document.activeElement).not.toBe(nested.contentDOM); // blurred mid-rebuild, before the microtask runs

    await Promise.resolve();

    expect(controller.nestedView).toBe(nested); // still the one reusable instance
    expect(document.activeElement).toBe(nested.contentDOM); // focus restored
  });

  it('editing outside the table (in the root document) never activates a cell or moves focus into the table', () => {
    const controller = new TableActiveCellController();
    const view = mount(`Some text.\n\n${TABLE}`, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    view.focus();
    view.dispatch({ changes: { from: 0, to: 0, insert: 'X' } });

    expect(controller.nestedView).toBeNull();
    expect(controller.activeAnchor).toBeNull();
    expect(document.activeElement).toBe(view.contentDOM);
    expect(document.activeElement?.closest('.cm-table-widget')).toBeNull();
  });

  it('multiple consecutive keystrokes all land in the same active cell, forwarded correctly into the root document', () => {
    const controller = new TableActiveCellController();
    const view = mount(TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    clickCell(findCell(view, 'Vik'));
    const nested = controller.nestedView!;
    nested.dispatch({ changes: { from: 3, to: 3, insert: 't' } });
    nested.dispatch({ changes: { from: 4, to: 4, insert: 'o' } });
    nested.dispatch({ changes: { from: 5, to: 5, insert: 'r' } });

    expect(controller.nestedView).toBe(nested); // same instance throughout
    expect(nested.state.doc.toString()).toBe('Viktor');
    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| Viktor | Designer |');
  });

  it('Tab from the active cell activates the next cell live, moving the nested editor into its own wrapper', () => {
    const controller = new TableActiveCellController();
    const view = mount(TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    clickCell(findCell(view, 'Name'));
    expect(controller.nestedView!.state.doc.toString()).toBe('Name');

    controller.nestedView!.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));

    expect(controller.nestedView!.state.doc.toString()).toBe('Role');
    const roleWrapper = Array.from(view.dom.querySelectorAll('.cm-table-cell-wrapper')).find((w) => w.contains(controller.nestedView!.dom));
    expect(roleWrapper).toBeDefined();
  });

  it('clicking a second, different cell moves the same nested editor instance into the new cell\'s wrapper (never a second instance)', () => {
    const controller = new TableActiveCellController();
    const view = mount(TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    clickCell(findCell(view, 'Name'));
    const firstInstance = controller.nestedView;

    clickCell(findCell(view, 'Designer'));

    expect(controller.nestedView).toBe(firstInstance);
    expect(controller.nestedView!.state.doc.toString()).toBe('Designer');
    // Exactly one nested .cm-editor descendant — the same reused instance, not a second one.
    expect(view.dom.querySelectorAll('.cm-table-widget .cm-editor')).toHaveLength(1);
    const activeWrapper = Array.from(view.dom.querySelectorAll('.cm-table-cell-wrapper')).find((w) => w.contains(controller.nestedView!.dom));
    expect(activeWrapper?.textContent).toContain('Designer');
  });
});

describe('table live wiring — empty-cell click/caret (rowCells() whitespace-only inversion fix)', () => {
  const EMPTY_CELL_TABLE = '| Name | Role |\n| --- | --- |\n| Vik |  |';

  function emptyDataCell(view: EditorView): Element {
    const td = view.dom.querySelectorAll('tbody td')[1];
    if (!td) {
      throw new Error('no second data cell found');
    }
    return td;
  }

  it('clicking an empty cell activates it — mounts the nested editor inside that cell\'s own wrapper', () => {
    const controller = new TableActiveCellController();
    const view = mount(EMPTY_CELL_TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    clickCell(emptyDataCell(view));

    expect(controller.nestedView).not.toBeNull();
    const activeWrapper = Array.from(view.dom.querySelectorAll('.cm-table-cell-wrapper')).find((w) => w.contains(controller.nestedView!.dom));
    expect(activeWrapper).toBeDefined();
    expect(activeWrapper!.parentElement?.tagName).toBe('TD');
  });

  it('the nested editor\'s content is empty for an empty cell', () => {
    const controller = new TableActiveCellController();
    const view = mount(EMPTY_CELL_TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    clickCell(emptyDataCell(view));

    expect(controller.nestedView!.state.doc.toString()).toBe('');
  });

  it('the nested selection starts at 0 (a genuine {from: 0, to: 0}, not an inverted range)', () => {
    const controller = new TableActiveCellController();
    const view = mount(EMPTY_CELL_TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    clickCell(emptyDataCell(view));

    const selection = controller.nestedView!.state.selection.main;
    expect(selection.from).toBe(0);
    expect(selection.to).toBe(0);
    expect(selection.head).toBe(0);
    // The root-document anchor itself must not be inverted either
    // (from <= to) — this is the actual stored bug: `rowCells()` used to
    // produce `{from: rawTo, to: rawFrom}` for a whitespace-only segment.
    expect(controller.activeAnchor).not.toBeNull();
    expect(controller.activeAnchor!.from).toBe(controller.activeAnchor!.to);
  });

  it('activation focuses the nested editor', async () => {
    // Awaits one microtask tick — the same queueMicrotask-deferred focus
    // restore from the earlier M5 rebuild-focus fix (tableWidget.ts's
    // toDOM()) applies here too: activate() itself triggers one
    // synchronous rebuild (its own tableActiveCellChanged dispatch),
    // which momentarily blurs the just-focused nested editor before the
    // microtask restores it.
    const controller = new TableActiveCellController();
    const view = mount(EMPTY_CELL_TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);
    view.focus();
    expect(document.activeElement).toBe(view.contentDOM);

    clickCell(emptyDataCell(view));
    await Promise.resolve();

    expect(document.activeElement).toBe(controller.nestedView!.contentDOM);
    expect(document.activeElement).not.toBe(view.contentDOM);
  });

  it('typing the first character inserts it into the empty cell, at the correct position in the root document', () => {
    const controller = new TableActiveCellController();
    const view = mount(EMPTY_CELL_TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    clickCell(emptyDataCell(view));
    controller.nestedView!.dispatch({ changes: { from: 0, to: 0, insert: 'x' } });

    expect(controller.nestedView!.state.doc.toString()).toBe('x');
    // The empty cell's own range collapses to its start (right after the
    // opening delimiter, before any of its own padding) — inserting there
    // lands immediately after "|", ahead of the original padding, not
    // "wrapped" by a space on each side. Still correctly recovered as
    // this cell's whole content once re-parsed (renderInlineMarkdown trims).
    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| Vik |x  |');
  });

  it('does not create a second EditorView — the same reusable instance activates the empty cell', () => {
    const controller = new TableActiveCellController();
    const view = mount(EMPTY_CELL_TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    clickCell(findCell(view, 'Vik'));
    const firstInstance = controller.nestedView;

    clickCell(emptyDataCell(view));

    expect(controller.nestedView).toBe(firstInstance);
    expect(view.dom.querySelectorAll('.cm-table-widget .cm-editor')).toHaveLength(1);
  });

  it('does not activate at the root editor\'s own position — root selection is untouched by clicking the empty cell', () => {
    const controller = new TableActiveCellController();
    const view = mount(EMPTY_CELL_TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);
    view.dispatch({ selection: { anchor: 0 } });

    clickCell(emptyDataCell(view));

    // The click activates a cell (a root-level position tracked by the
    // controller), not the root EditorView's own text selection — that
    // stays wherever it was before the click.
    expect(view.state.selection.main.from).toBe(0);
  });
});
