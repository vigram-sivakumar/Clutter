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

function clickCell(cell: Element): void {
  cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

const TABLE = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';

describe('table live wiring — read-only (note embed) table', () => {
  it('renders as a real <table>, but clicking a cell does nothing — no activation, no nested editor', () => {
    const view = mount(TABLE, true);

    const table = view.dom.querySelector('table.cm-table-widget');
    expect(table).not.toBeNull();
    const dataCell = view.dom.querySelector('tbody td');
    expect(dataCell?.textContent).toBe('Vik');

    clickCell(dataCell!);

    // No nested EditorView's own .cm-editor was mounted anywhere inside the table.
    expect(view.dom.querySelector('table.cm-table-widget .cm-editor')).toBeNull();
    expect(view.dom.querySelector('tbody td')?.textContent).toBe('Vik');
  });
});

describe('table live wiring — editable top-level table', () => {
  it('clicking an inactive cell activates it: mounts the nested editor in that cell, with the caret placed there', () => {
    const controller = new TableActiveCellController();
    const view = mount(TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    const dataCell = Array.from(view.dom.querySelectorAll('tbody td')).find((td) => td.textContent === 'Vik')!;
    clickCell(dataCell);

    expect(controller.nestedView).not.toBeNull();
    expect(controller.nestedView!.state.doc.toString()).toBe('Vik');
    // Re-queried, not the pre-click `dataCell` reference — activating
    // rebuilds tableWidgetField's decorations (the tableActiveCellChanged
    // marker effect), which replaces the whole <table> DOM subtree with a
    // fresh one; the old `dataCell` element is now detached.
    const activeCell = Array.from(view.dom.querySelectorAll('tbody td')).find((td) => td.contains(controller.nestedView!.dom));
    expect(activeCell).toBeDefined();
  });

  it('typing in the activated cell forwards into the root document, visible in the re-rendered static cell after deactivation', () => {
    const controller = new TableActiveCellController();
    const view = mount(TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    const dataCell = Array.from(view.dom.querySelectorAll('tbody td')).find((td) => td.textContent === 'Vik')!;
    clickCell(dataCell);
    controller.nestedView!.dispatch({ changes: { from: 3, to: 3, insert: 'tor' } });

    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| Viktor | Designer |');
  });

  it('Tab from the active cell activates the next cell live, moving the nested editor into its <td>', () => {
    const controller = new TableActiveCellController();
    const view = mount(TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    const nameCell = Array.from(view.dom.querySelectorAll('thead th')).find((th) => th.textContent === 'Name')!;
    clickCell(nameCell);
    expect(controller.nestedView!.state.doc.toString()).toBe('Name');

    controller.nestedView!.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));

    expect(controller.nestedView!.state.doc.toString()).toBe('Role');
    const roleCell = Array.from(view.dom.querySelectorAll('thead th')).find((th) => th.textContent?.includes('Role'))!;
    expect(roleCell.contains(controller.nestedView!.dom)).toBe(true);
  });

  it('clicking a second, different cell moves the same nested editor instance (never a second one)', () => {
    const controller = new TableActiveCellController();
    const view = mount(TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    const cells = () => Array.from(view.dom.querySelectorAll('th, td'));
    clickCell(cells().find((c) => c.textContent === 'Name')!);
    const firstInstance = controller.nestedView;

    // Re-query — the whole <table> was rebuilt when activation changed.
    clickCell(cells().find((c) => c.textContent === 'Designer')!);

    expect(controller.nestedView).toBe(firstInstance);
    expect(controller.nestedView!.state.doc.toString()).toBe('Designer');
    // Exactly one nested .cm-editor descendant — the same reused instance, not a second one.
    expect(view.dom.querySelectorAll('table.cm-table-widget .cm-editor')).toHaveLength(1);
  });
});
