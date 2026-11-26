// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { history, undo, redo, undoDepth, redoDepth, historyKeymap } from '@codemirror/commands';
import { tableCellEditor } from '../table-engine/tableCellEditor';
import { resolveTableHandleMenuAnchor, type OnTableHandleMenuChange } from './tableHandleMenuSync';
import type { TableCommand } from '../table-engine/tableCommands';
import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView, drawSelection, keymap } from '@codemirror/view';

import { buildEditorExtensions, type BuildEditorExtensionsOptions } from '../buildEditorExtensions';
import { TableActiveCellController } from './tableActiveCellController';
import { tableCellNavigation } from './tableCellNavigation';
import { duplicateSelectedColumn } from './tableColumnInsertion';
import { findAllTables, getNavigableRows, getRowCellBounds } from './tableGeometry';
import { duplicateSelectedRow } from './tableRowInsertion';
import { tableSelectionChanged, tableSelectionField } from './tableSelection';

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

function mount(doc: string, readOnly: boolean, controller?: TableActiveCellController, engine = false, onMenu?: OnTableHandleMenuChange): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: buildEditorExtensions({
        ...REQUIRED,
        readOnly,
        tableEngineCells: engine,
        onOpenTableHandleMenu: () => onMenu,
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

/**
 * A plain click, end to end. Activation itself happens synchronously on
 * `mousedown` (cell-first — `beginCellDragTracking`, `tableCellRangeSelection.ts`,
 * never defers it), so `mousedown` alone would already be enough for these
 * tests' own assertions; `mouseup` is still dispatched to match a real
 * click's own two events and to let `beginCellDragTracking`'s own
 * per-gesture listeners clean themselves up, rather than leaking across
 * tests. Dispatched on `document` — that's where its listeners live, not
 * the cell itself, matching how a real click's two events already bubble
 * there regardless of origin.
 */
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

const TABLE = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';

describe('table live wiring — DOM structure', () => {
  it('the widget is a div.cm-table-widget[contenteditable=false] wrapping a div.cm-table-wrapper wrapping a div.cm-table-scroll wrapping a div.cm-table-layout wrapping a div.cm-table-inner wrapping the real <table>', () => {
    const view = mount(TABLE, true);

    const widget = view.dom.querySelector(':scope .cm-table-widget');
    expect(widget?.tagName).toBe('DIV');
    expect((widget as HTMLElement)?.contentEditable).toBe('false');

    const wrapper = widget?.querySelector(':scope > .cm-table-wrapper');
    expect(wrapper?.tagName).toBe('DIV');

    // .cm-table-scroll (not table directly) is .cm-table-wrapper's own
    // child — split out so the column/row handle overlay
    // (tableHandleOverlay.ts), anchored on .cm-table-wrapper itself, is
    // never clipped, and to give the selection overlay
    // (tableSelectionOverlay.ts) its own scroll-following coordinate
    // space. See tableWidget.css's own comment on
    // .cm-table-wrapper/.cm-table-scroll.
    const scroll = wrapper?.querySelector(':scope > .cm-table-scroll');
    expect(scroll?.tagName).toBe('DIV');

    // Quick-add controls have their own layout track; the table and its row
    // control remain inside the intrinsic-width inner track.
    const layout = scroll?.querySelector(':scope > .cm-table-layout');
    expect(layout?.tagName).toBe('DIV');
    const inner = layout?.querySelector(':scope > .cm-table-inner');
    expect(inner?.tagName).toBe('DIV');

    const table = inner?.querySelector(':scope > table');
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

describe('engine staged keyboard interaction (M5 candidate)', () => {
  const doc = 'Before\n\n' + TABLE + '\n\nAfter';
  const host = (view: EditorView, row: number, col: number) =>
    view.dom.querySelector<HTMLElement>(`[data-table-engine-cells="true"] [data-cell="${row},${col}"]`)!;
  const key = (target: Element, name: string, shiftKey = false, ctrlKey = false) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, ctrlKey, bubbles: true, cancelable: true }));
  const selected = (view: EditorView) => Array.from(view.dom.querySelectorAll('.cm-table-engine-selected [data-cell]'))
    .map(cell => (cell as HTMLElement).dataset.cell);

  it('Tab exits editing into a caret-free cell, Shift-Tab wraps, Enter reuses the nested editor', () => {
    const view = mount(doc, false, undefined, true);
    clickCell(findCell(view, 'Role'));
    const nested = view.plugin(tableCellEditor)!.nested!;
    key(nested.contentDOM, 'Tab');
    expect(selected(view)).toEqual(['1,0']);
    expect(nested.dom.isConnected).toBe(false);
    expect(document.activeElement).toBe(host(view, 1, 0));
    key(host(view, 1, 0), 'Tab', true);
    expect(selected(view)).toEqual(['0,1']);
    key(host(view, 0, 1), 'Enter');
    expect(view.plugin(tableCellEditor)!.nested).toBe(nested);
    expect(nested.state.doc.toString()).toBe('Role');
    expect(selected(view)).toEqual([]);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('Escape selects the active cell, Shift+arrows extend a reverse range, arrows collapse from head', () => {
    const view = mount(doc, false, undefined, true);
    clickCell(findCell(view, 'Designer'));
    const nested = view.plugin(tableCellEditor)!.nested!;
    key(nested.contentDOM, 'Escape');
    expect(selected(view)).toEqual(['1,1']);
    key(host(view, 1, 1), 'ArrowLeft', true);
    key(host(view, 1, 0), 'ArrowUp', true);
    expect(selected(view)).toEqual(['0,0','0,1','1,0','1,1']);
    key(host(view, 0, 0), 'ArrowRight');
    expect(selected(view)).toEqual(['0,1']);
    key(host(view, 0, 1), 'Escape');
    expect(selected(view)).toEqual([]);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('Shift+click extends from the active cell and outside click clears', () => {
    const view = mount(doc, false, undefined, true);
    clickCell(findCell(view, 'Designer'));
    host(view, 0, 0).dispatchEvent(new MouseEvent('mousedown', { shiftKey: true, bubbles: true, cancelable: true }));
    expect(selected(view)).toEqual(['0,0','0,1','1,0','1,1']);
    expect(view.plugin(tableCellEditor)!.nested!.dom.isConnected).toBe(false);
    key(host(view, 0, 0), 'x');
    expect(view.state.doc.toString()).toBe(doc);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(selected(view)).toEqual([]);
  });

  it('Tab at the last cell transfers focus to surrounding root Markdown', () => {
    const view = mount(doc, false, undefined, true);
    clickCell(findCell(view, 'Designer'));
    key(view.plugin(tableCellEditor)!.nested!.contentDOM, 'Tab');
    expect(selected(view)).toEqual([]);
    expect(view.hasFocus).toBe(true);
    expect(view.state.selection.main.head).toBeGreaterThan(doc.indexOf('Designer'));
  });

  it('selected-cell typing replaces that cell, Delete clears a range without shifting neighbours', () => {
    const view = mount(doc, false, undefined, true);
    clickCell(findCell(view, 'Vik'));
    const nested = view.plugin(tableCellEditor)!.nested!;
    key(nested.contentDOM, 'Escape');
    key(host(view, 1, 0), 'x');
    expect(nested.state.doc.toString()).toBe('x');
    expect(view.state.doc.toString()).toBe(doc.replace('Vik', 'x'));
    key(nested.contentDOM, 'Escape');
    key(host(view, 1, 0), 'ArrowRight', true);
    key(host(view, 1, 1), 'Delete');
    expect(selected(view)).toEqual(['1,0','1,1']);
    expect(view.state.doc.toString()).toContain('|  |  |');
    expect(view.state.doc.toString()).toContain('| Name | Role |');
  });
});

describe('engine staged pointer selection (M6 candidate)', () => {
  const doc = 'Before\n\n' + TABLE + '\n\nAfter';
  const host = (view: EditorView, row: number, col: number) =>
    view.dom.querySelector<HTMLElement>(`[data-table-engine-cells="true"] [data-cell="${row},${col}"]`)!;
  const selected = (view: EditorView) => Array.from(view.dom.querySelectorAll('.cm-table-engine-selected [data-cell]'))
    .map(cell => (cell as HTMLElement).dataset.cell);
  const pointer = (target: EventTarget, type: string, buttons = 1, id = 1) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, buttons, clientX: 40, clientY: 20 });
    Object.defineProperties(event, { pointerId: { value: id }, isPrimary: { value: true }, pointerType: { value: 'mouse' } });
    target.dispatchEvent(event);
    return event;
  };
  function hitTest(initial: Element) {
    const original = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    const hit = vi.fn(() => initial);
    Object.defineProperty(document, 'elementFromPoint', { value: hit, configurable: true });
    return { hit, restore: () => {
      if (original) Object.defineProperty(document, 'elementFromPoint', original);
      else Reflect.deleteProperty(document, 'elementFromPoint');
    } };
  }

  it('keeps native text editing within the anchor and hands off on crossing to a reverse rectangular range', () => {
    const view = mount(doc, false, undefined, true);
    const anchor = host(view, 1, 1);
    const controller = view.plugin(tableCellEditor)!;
    const h = hitTest(anchor);
    try {
      pointer(anchor, 'pointerdown');
      clickCell(anchor.parentElement!);
      const nested = controller.nested!;
      const within = pointer(document, 'pointermove');
      expect(within.defaultPrevented).toBe(false);
      expect(nested.dom.isConnected).toBe(true);
      h.hit.mockReturnValue(host(view, 0, 0));
      const crossing = pointer(document, 'pointermove');
      expect(crossing.defaultPrevented).toBe(true);
      expect(selected(view)).toEqual(['0,0', '0,1', '1,0', '1,1']);
      expect(nested.dom.isConnected).toBe(false);
      expect(document.activeElement).toBe(host(view, 0, 0));
      h.hit.mockReturnValue(anchor);
      pointer(document, 'pointermove');
      expect(selected(view)).toEqual(['1,1']);
      pointer(document, 'pointerup', 0);
      h.hit.mockReturnValue(host(view, 0, 0));
      pointer(document, 'pointermove');
      expect(selected(view)).toEqual(['1,1']);
      expect(view.state.doc.toString()).toBe(doc);
    } finally { controller.cancelDrag(); h.restore(); }
  });

  it('starts from an already active editor and ends the gesture on pointer cancellation', () => {
    const view = mount(doc, false, undefined, true);
    clickCell(findCell(view, 'Vik'));
    const controller = view.plugin(tableCellEditor)!;
    const nested = controller.nested!;
    const h = hitTest(host(view, 1, 1));
    try {
      pointer(nested.contentDOM, 'pointerdown');
      pointer(document, 'pointermove', 1, 2);
      expect(nested.dom.isConnected).toBe(true);
      pointer(document, 'pointermove');
      expect(selected(view)).toEqual(['1,0', '1,1']);
      pointer(document, 'pointercancel', 0);
      h.hit.mockReturnValue(host(view, 0, 0));
      pointer(document, 'pointermove');
      expect(selected(view)).toEqual(['1,0', '1,1']);
      expect(view.state.doc.toString()).toBe(doc);
    } finally { controller.cancelDrag(); h.restore(); }
  });

  it('does not transfer a drag to another table and cancels on external document edits', () => {
    const source = doc + '\n\n' + TABLE;
    const view = mount(source, false, undefined, true);
    const second = view.dom.querySelectorAll<HTMLElement>('[data-table-engine-cells="true"]')[1]!;
    const anchor = host(view, 1, 0);
    const controller = view.plugin(tableCellEditor)!;
    const h = hitTest(second.querySelector<HTMLElement>('[data-cell="0,0"]')!);
    try {
      pointer(anchor, 'pointerdown');
      clickCell(anchor.parentElement!);
      pointer(document, 'pointermove');
      expect(selected(view)).toEqual([]);
      expect(controller.nested!.dom.isConnected).toBe(true);
      h.hit.mockReturnValue(host(view, 1, 1));
      pointer(document, 'pointermove');
      expect(selected(view)).toEqual(['1,0', '1,1']);
      view.dispatch({ changes: { from: 0, insert: 'Prefix\n\n' } });
      pointer(document, 'pointermove');
      expect(selected(view)).toEqual([]);
      expect(view.state.doc.toString()).toBe('Prefix\n\n' + source);
    } finally { controller.cancelDrag(); h.restore(); }
  });
});

describe('engine staged clipboard and root history (M7 candidate)', () => {
  const doc = 'Before\n\n' + TABLE + '\n\nAfter';
  const host = (view: EditorView, row: number, col: number) =>
    view.dom.querySelector<HTMLElement>(`[data-table-engine-cells="true"] [data-cell="${row},${col}"]`)!;
  const selected = (view: EditorView) => Array.from(view.dom.querySelectorAll('.cm-table-engine-selected [data-cell]'))
    .map(cell => (cell as HTMLElement).dataset.cell);
  const key = (target: Element, name: string, shiftKey = false) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true }));
  const fire = (target: Element, type: string, values: Record<string, string> = {}) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const data = { getData: (mime: string) => values[mime] ?? '', setData: (mime: string, value: string) => { values[mime] = value; }, files: [], types: Object.keys(values) };
    Object.defineProperty(event, 'clipboardData', { value: data });
    target.dispatchEvent(event);
    return { event, values };
  };
  const selectRange = (view: EditorView) => {
    clickCell(host(view, 1, 1).parentElement!);
    key(view.plugin(tableCellEditor)!.nested!.contentDOM, 'Escape');
    key(host(view, 1, 1), 'ArrowLeft', true);
  };
  it('copies Markdown in three formats, cuts once and restores the reverse selection on undo/redo', () => {
    const source = doc.replace('Vik', '**Vik**');
    const view = mount(source, false, undefined, true);
    view.dispatch({ effects: StateEffect.appendConfig.of(history()) });
    selectRange(view);
    const { event, values } = fire(host(view, 1, 0), 'copy');
    expect(event.defaultPrevented).toBe(true);
    expect(values['text/plain']).toBe('**Vik**\tDesigner');
    expect(values['text/html']).toContain('<strong>');
    expect(JSON.parse(values['application/x-clutter-table']!)).toEqual({ kind: 'clutter-table-range', rows: [['**Vik**', 'Designer']] });
    expect(view.state.doc.toString()).toBe(source);
    fire(host(view, 1, 0), 'cut');
    const cleared = view.state.doc.toString();
    expect(cleared).toContain('|  |  |');
    expect(selected(view)).toEqual(['1,0','1,1']);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    expect(selected(view)).toEqual(['1,0','1,1']);
    expect(document.activeElement).toBe(host(view, 1, 0));
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(cleared);
    expect(selected(view)).toEqual(['1,0','1,1']);
  });
  it('pastes an expanding TSV grid from the geometric top-left of a reverse range, retaining selection', () => {
    const view = mount(doc, false, undefined, true);
    view.dispatch({ effects: StateEffect.appendConfig.of(history()) });
    selectRange(view);
    const paste = fire(host(view, 1, 0), 'paste', { 'text/plain': 'A\tB\tC\nD\tE\tF' });
    expect(paste.event.defaultPrevented).toBe(true);
    const expanded = view.state.doc.toString();
    expect(expanded).toContain('| A | B | C |\n| D | E | F |');
    expect(selected(view)).toEqual(['1,0','1,1']);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
    expect(selected(view)).toEqual(['1,0','1,1']);
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(expanded);
  });
  it('pastes plain text at the editing caret and escapes raw pipes without changing neighbours', () => {
    const view = mount(doc, false, undefined, true);
    clickCell(host(view, 1, 0).parentElement!);
    const nested = view.plugin(tableCellEditor)!.nested!;
    nested.dispatch({ selection: { anchor: 1 } });
    fire(nested.contentDOM, 'paste', { 'text/plain': 'a|b' });
    expect(nested.state.doc.toString()).toBe('Va\\|bik');
    expect(view.state.doc.toString()).toBe(doc.replace('Vik','Va\\|bik'));
    expect(nested.dom.isConnected).toBe(true);
  });
  it('inserts a copied single cell into the active caret, preserving surrounding text and Markdown', () => {
    const source = doc.replace('Designer', '**Designer**');
    const view = mount(source, false, undefined, true);
    view.dispatch({ effects: StateEffect.appendConfig.of(history()) });
    clickCell(host(view, 1, 1).parentElement!);
    key(view.plugin(tableCellEditor)!.nested!.contentDOM, 'Escape');
    const { values } = fire(host(view, 1, 1), 'copy');
    clickCell(host(view, 1, 0).parentElement!);
    const nested = view.plugin(tableCellEditor)!.nested!;
    nested.dispatch({ selection: { anchor: 1 } });
    fire(nested.contentDOM, 'paste', values);
    expect(nested.state.doc.toString()).toBe('V**Designer**ik');
    expect(view.state.doc.toString()).toBe(source.replace('Vik', 'V**Designer**ik'));
    expect(nested.dom.isConnected).toBe(true);
    expect(nested.state.selection.main.head).toBe('V**Designer**'.length);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
  });
  it('inserts single-cell HTML and replaces only highlighted text in an active editor', () => {
    const view = mount(doc, false, undefined, true);
    clickCell(host(view, 1, 0).parentElement!);
    const nested = view.plugin(tableCellEditor)!.nested!;
    nested.dispatch({ selection: { anchor: 1, head: 2 } });
    fire(nested.contentDOM, 'paste', { 'text/html': '<table><tr><td>X</td></tr></table>', 'text/plain': 'X' });
    expect(nested.state.doc.toString()).toBe('VXk');
    expect(view.state.doc.toString()).toBe(doc.replace('Vik', 'VXk'));
    expect(nested.dom.isConnected).toBe(true);
  });
  it('still replaces a caret-free selected cell with a scalar clipboard payload', () => {
    const view = mount(doc, false, undefined, true);
    clickCell(host(view, 1, 0).parentElement!);
    key(view.plugin(tableCellEditor)!.nested!.contentDOM, 'Escape');
    fire(host(view, 1, 0), 'paste', { 'text/plain': 'New' });
    expect(view.state.doc.toString()).toBe(doc.replace('Vik', 'New'));
    expect(selected(view)).toEqual(['1,0']);
  });
  it('still fills multiple cells when pasting a grid into an active editor', () => {
    const view = mount(doc, false, undefined, true);
    clickCell(host(view, 1, 0).parentElement!);
    const nested = view.plugin(tableCellEditor)!.nested!;
    nested.dispatch({ selection: { anchor: 1 } });
    fire(nested.contentDOM, 'paste', { 'text/plain': 'One\tTwo' });
    expect(view.state.doc.toString()).toBe(doc.replace('Vik', 'One').replace('Designer', 'Two'));
    expect(nested.dom.isConnected).toBe(false);
    expect(selected(view)).toEqual(['1,0']);
  });
  it('rejects malformed internal data and preserves the selected host and source', () => {
    const view = mount(doc, false, undefined, true);
    selectRange(view);
    const { event } = fire(host(view, 1, 0), 'paste', { 'application/x-clutter-table': '{broken', 'text/plain': 'bad' });
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
    expect(selected(view)).toEqual(['1,0','1,1']);
  });
  it('creates a second table through root paste routing and restores its selection on redo', () => {
    const view = mount(doc, false, undefined, true);
    view.dispatch({ effects: StateEffect.appendConfig.of(history()) });
    view.dispatch({ selection: { anchor: doc.length } });
    const paste = fire(view.contentDOM, 'paste', { 'text/plain': 'A\tB\nx\ty' });
    expect(paste.event.defaultPrevented).toBe(true);
    const created = view.state.doc.toString();
    expect(created).toBe(doc + '\n\n| A | B |\n| --- | --- |\n| x | y |');
    expect(view.dom.querySelectorAll('[data-table-engine-cells="true"]')).toHaveLength(2);
    expect(selected(view)).toEqual(['0,0']);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
    expect(selected(view)).toEqual([]);
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(created);
    expect(selected(view)).toEqual(['0,0']);
  });
});

describe('engine staged structural commands (M8 candidate)', () => {
  const doc = 'Before\n\n' + TABLE + '\n\nAfter';
  const mountHistory = (source = doc) => {
    const view = mount(source, false, undefined, true);
    view.dispatch({ effects: StateEffect.appendConfig.of(history()) });
    return view;
  };
  const widget = (view: EditorView) => view.dom.querySelector<HTMLElement>('[data-table-engine-cells="true"]')!;
  const host = (view: EditorView, row: number, col: number) =>
    widget(view).querySelector<HTMLElement>(`[data-cell="${row},${col}"]`)!;
  const action = (view: EditorView, row: number, col: number, label: string) => {
    const controller = view.plugin(tableCellEditor)!;
    const axis = label.toLowerCase().includes('row') ? 'row' : 'column';
    const index = axis === 'row' ? row : col;
    const selection = axis === 'row' ? { kind: 'row' as const, tableFrom: 8, rowIndex: index } :
      { kind: 'column' as const, tableFrom: 8, columnIndex: index };
    const commands: Record<string, TableCommand> = {
      'Insert row above': { kind: 'insertRow', index },
      'Insert row below': { kind: 'insertRow', index: index + 1 },
      'Duplicate row': { kind: 'duplicateRow', index },
      'Delete row': { kind: 'deleteRow', index },
      'Insert column left': { kind: 'insertColumn', index },
      'Insert column right': { kind: 'insertColumn', index: index + 1 },
      'Duplicate column': { kind: 'duplicateColumn', index },
      'Delete column': { kind: 'deleteColumn', index },
    };
    expect(controller.selectAxis(8, { row, col }, axis)).toBe(true);
    expect(controller.axisCommand(selection, commands[label]!)).toBe(true);
  };
  const select = (view: EditorView) => Array.from(widget(view).querySelectorAll('.cm-table-engine-selected [data-cell]')).map(h => (h as HTMLElement).dataset.cell);
  it('quick-adds rows and columns with one history entry each and retains the widget', () => {
    const view = mountHistory();
    const root = widget(view);
    root.querySelector<HTMLButtonElement>('[aria-label="Add row"]')!.click();
    expect(widget(view)).toBe(root);
    expect(root.querySelectorAll('tr')).toHaveLength(3);
    const rows = view.state.doc.toString();
    root.querySelector<HTMLButtonElement>('[aria-label="Add column"]')!.click();
    expect(root.querySelectorAll('th')).toHaveLength(3);
    const cols = view.state.doc.toString();
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(rows);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
    expect(redo(view)).toBe(true);
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(cols);
  });
  it('undoes and redoes mixed cell and structural history using consecutive keyboard events', () => {
    const view = mountHistory();
    // jsdom does not reliably report the host OS to CodeMirror. Its default
    // redo binding is Mod-y outside macOS/Linux, whereas this scenario
    // deliberately sends Ctrl-Shift-Z from both the table and the root.
    // Bind that exact synthetic chord in the harness, not the application.
    view.dispatch({ effects: StateEffect.appendConfig.of(keymap.of([
      { key: 'Ctrl-z', run: undo, preventDefault: true },
      { key: 'Ctrl-Shift-z', run: redo, preventDefault: true },
      ...historyKeymap,
    ])) });
    clickCell(findCell(view, 'Vik'));
    const nested = view.plugin(tableCellEditor)!.nested!;
    nested.dispatch({ changes: { from: 3, insert: '!' }, userEvent: 'input.type' });
    const edited = view.state.doc.toString();
    widget(view).querySelector<HTMLButtonElement>('[aria-label="Add row"]')!.click();
    const row = view.state.doc.toString();
    widget(view).querySelector<HTMLButtonElement>('[aria-label="Add column"]')!.click();
    const col = view.state.doc.toString();
    clickCell(findCell(view, 'Designer'));
    expect(undoDepth(view.state)).toBe(3);
    const press = (shiftKey = false) => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', {
        // CM6 resolves a modified uppercase character to its unshifted
        // binding via base[event.keyCode]. A real Z key supplies 90;
        // a synthetic event with only code: 'KeyZ' defaults to zero.
        key: shiftKey ? 'Z' : 'z', code: 'KeyZ', keyCode: 90,
        ctrlKey: true, shiftKey, bubbles: true, cancelable: true,
      }));
    };
    press(); expect(view.state.doc.toString()).toBe(row);
    press(); expect(view.state.doc.toString()).toBe(edited);
    expect(select(view)).toEqual(['1,0']);
    expect(document.activeElement).toBe(host(view, 1, 0));
    press(); expect(view.state.doc.toString()).toBe(doc);
    expect(undoDepth(view.state)).toBe(0);
    expect(redoDepth(view.state)).toBe(3);
    press(true); expect(view.state.doc.toString()).toBe(edited);
    press(true); expect(view.state.doc.toString()).toBe(row);
    expect(redoDepth(view.state)).toBe(1);
    expect(document.activeElement).toBe(view.contentDOM);
    press(true); expect(view.state.doc.toString()).toBe(col);
    expect(redoDepth(view.state)).toBe(0);
  });
  it('continues history after restored cell focus loss without intercepting unrelated input shortcuts', async () => {
    const view = mountHistory();
    clickCell(findCell(view, 'Vik'));
    view.plugin(tableCellEditor)!.nested!.dispatch({ changes: { from: 3, insert: '!' }, userEvent: 'input.type' });
    const edited = view.state.doc.toString();
    widget(view).querySelector<HTMLButtonElement>('[aria-label="Add row"]')!.click();
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(edited);
    const cell = host(view, 1, 0);
    expect(document.activeElement).toBe(cell);
    cell.blur();
    expect(document.activeElement).toBe(document.body);
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const press = (target: Element) => target.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'z', code: 'KeyZ', metaKey: true, bubbles: true, cancelable: true,
    }));
    try {
      expect(press(input)).toBe(true);
      expect(view.state.doc.toString()).toBe(edited);
      await Promise.resolve();
      expect(document.activeElement).toBe(input);
      input.blur();
      expect(press(document.body)).toBe(false);
      expect(view.state.doc.toString()).toBe(doc);
    } finally { input.remove(); }
  });
  it('inserts above the header, promotes a blank header and restores row selection on undo', () => {
    const view = mountHistory();
    action(view, 0, 0, 'Insert row above');
    expect(view.state.doc.toString()).toBe(doc.replace('| Name | Role |\n| --- | --- |', '|  |  |\n| --- | --- |\n| Name | Role |'));
    expect(select(view)).toEqual(['0,0','0,1']);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
    expect(select(view)).toEqual(['0,0','0,1']);
  });
  it('inserts, duplicates and deletes body rows, restoring the exact document by undo', () => {
    const view = mountHistory();
    action(view, 1, 0, 'Duplicate row');
    expect(view.state.doc.toString()).toContain('| Vik | Designer |\n| Vik | Designer |');
    expect(select(view)).toEqual(['2,0','2,1']);
    action(view, 1, 0, 'Insert row below');
    expect(select(view)).toEqual(['2,0','2,1']);
    action(view, 2, 0, 'Delete row');
    expect(view.state.doc.toString()).toContain('| Vik | Designer |\n| Vik | Designer |');
    expect(undo(view)).toBe(true);
    expect(undo(view)).toBe(true);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
  });
  it('duplicates and deletes a column with its alignment and explicit width', () => {
    const source = doc.replace('| --- | --- |', '| --- | :---: |').replace('\n\nAfter', '\n{table-col-widths="120,300"}\n\nAfter');
    const view = mountHistory(source);
    action(view, 1, 1, 'Duplicate column');
    const duplicated = view.state.doc.toString();
    expect(duplicated).toContain('| Name | Role | Role |');
    expect(duplicated).toContain('| --- | :---: | :---: |');
    expect(duplicated).toContain('{table-col-widths="120,300,300"}');
    expect(select(view)).toEqual(['0,2','1,2']);
    action(view, 0, 2, 'Delete column');
    expect(view.state.doc.toString()).toBe(source);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(duplicated);
  });
  it('inserts columns left and right without disturbing the other cells', () => {
    const view = mountHistory();
    action(view, 0, 0, 'Insert column left');
    expect(view.state.doc.toString()).toContain('|  | Name | Role |');
    action(view, 0, 2, 'Insert column right');
    expect(view.state.doc.toString()).toContain('|  | Name | Role |  |');
    expect(select(view)).toEqual(['0,3','1,3']);
    expect(undo(view)).toBe(true);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
  });
  it('promotes the body row when deleting the header and removes the table on the final row', () => {
    const view = mountHistory();
    action(view, 0, 0, 'Delete row');
    expect(view.state.doc.toString()).toBe(doc.replace(TABLE, '| Vik | Designer |\n| --- | --- |'));
    action(view, 0, 0, 'Delete row');
    expect(view.state.doc.toString()).toBe('Before\n\n\n\nAfter');
    expect(view.dom.querySelector('[data-table-engine-cells="true"]')).toBeNull();
    expect(undo(view)).toBe(true);
    expect(select(view)).toEqual(['0,0','0,1']);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
  });
});

describe('engine staged column resizing (M9a candidate)', () => {
  const pointer = (type: string, target: EventTarget, x: number) =>
    target.dispatchEvent(new MouseEvent(type, { clientX: x, button: 0, bubbles: true, cancelable: true }));
  const mountHistory = (source: string) => {
    const view = mount(source, false, undefined, true);
    view.dispatch({ effects: StateEffect.appendConfig.of(history()) });
    return view;
  };
  const hits = (view: EditorView) => view.dom.querySelectorAll<HTMLElement>('.cm-table-column-resize-hit');
  it('commits the measured first resize as width metadata only and reverses it through root history', () => {
    const source = 'Before\n\n|A|B|\n|---|---|\n|one|two|\n\nAfter';
    const view = mountHistory(source);
    const widget = view.dom.querySelector('[data-table-engine-cells="true"]');
    const headers = widget!.querySelectorAll('th');
    const measure = (width: number) => ({ width } as DOMRect);
    vi.spyOn(headers[0]!, 'getBoundingClientRect').mockReturnValue(measure(120));
    vi.spyOn(headers[1]!, 'getBoundingClientRect').mockReturnValue(measure(260));
    expect(hits(view)).toHaveLength(2);
    pointer('pointerdown', hits(view)[0]!, 100);
    pointer('pointermove', document, 150);
    expect(widget!.querySelector<HTMLElement>('col')!.style.width).toBe('170px');
    expect(view.state.doc.toString()).toBe(source);
    expect(undoDepth(view.state)).toBe(0);
    pointer('pointerup', document, 150);
    const sized = source.replace('\n\nAfter', '\n{table-col-widths="170,260"}\n\nAfter');
    expect(view.state.doc.toString()).toBe(sized);
    expect(view.dom.querySelector('[data-table-engine-cells="true"]')).toBe(widget);
    expect(hits(view)).toHaveLength(2);
    expect(undoDepth(view.state)).toBe(1);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(sized);
    expect(hits(view)).toHaveLength(2);
  });
  it('supports successive resizes and cancellation without committing preview widths', () => {
    const source = TABLE + '\n{table-col-widths="120,260"}';
    const view = mountHistory(source);
    pointer('pointerdown', hits(view)[1]!, 100);
    pointer('pointermove', document, 20);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(view.state.doc.toString()).toBe(source);
    expect(view.dom.querySelectorAll<HTMLTableColElement>('col')[1]!.style.width).toBe('260px');
    expect(undoDepth(view.state)).toBe(0);
    pointer('pointerdown', hits(view)[1]!, 100);
    pointer('pointerup', document, 150);
    expect(view.state.doc.toString()).toBe(source.replace('120,260', '120,310'));
    pointer('pointerdown', hits(view)[0]!, 100);
    pointer('pointerup', document, -100);
    expect(view.state.doc.toString()).toBe(source.replace('120,260', '60,310'));
    expect(undoDepth(view.state)).toBe(2);
    expect(undo(view)).toBe(true);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
  });
  it('reconciles resize hit targets after adding and undoing a column; read-only tables have none', () => {
    const view = mountHistory(TABLE);
    view.dom.querySelector<HTMLButtonElement>('[aria-label="Add column"]')!.click();
    expect(hits(view)).toHaveLength(3);
    expect(undo(view)).toBe(true);
    expect(hits(view)).toHaveLength(2);
    expect(hits(mount(TABLE, true))).toHaveLength(0);
  });
});

describe('engine original table handles (M9b candidate)', () => {
  const pointer = (type: string, target: EventTarget, x = 10, y = 10) =>
    target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
  const mountHistory = (source = TABLE, notify?: OnTableHandleMenuChange) => {
    const view = mount(source, false, undefined, true, notify);
    view.dispatch({ effects: StateEffect.appendConfig.of(history()) });
    return view;
  };
  it('opens the original logical menu on handle release and resolves its live anchor without legacy selection', () => {
    const notify = vi.fn<OnTableHandleMenuChange>();
    const view = mountHistory(TABLE, notify);
    const hit = view.dom.querySelector<HTMLElement>('th .cm-table-column-handle-hit')!;
    expect(hit).not.toBeNull();
    pointer('pointerdown', hit);
    expect(notify).not.toHaveBeenCalled();
    pointer('pointerup', document);
    const selection = { kind: 'column' as const, tableFrom: 0, columnIndex: 0 };
    expect(notify).toHaveBeenCalledWith({ selection, engine: true });
    expect(resolveTableHandleMenuAnchor(view, selection)).toBe(view.dom.querySelector('th .cm-table-column-handle'));
    expect(view.state.field(tableSelectionField, false) ?? null).toBeNull();
    expect(view.dom.querySelectorAll('.cm-table-engine-selected')).toHaveLength(2);
    const c = view.plugin(tableCellEditor)!;
    expect(c.axisCommand(selection, { kind: 'setAlignment', col: 0, alignment: 'center' })).toBe(true);
    expect(view.state.doc.toString()).toBe(TABLE.replace('| --- | --- |', '| :---: | --- |'));
    expect(notify).toHaveBeenCalledWith(null);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(TABLE);
  });
  it('reorders columns by their original handle and carries alignment and width metadata together', () => {
    const source = TABLE.replace('| --- | --- |', '| --- | :---: |') + '\n{table-col-widths="120,260"}';
    const view = mountHistory(source);
    const hits = view.dom.querySelectorAll<HTMLElement>('.cm-table-column-handle-hit');
    pointer('pointerdown', hits[0]!, 10, 10);
    pointer('pointermove', view.dom.querySelectorAll('th')[1]!, 100, 10);
    expect(view.state.doc.toString()).toBe(source);
    pointer('pointerup', document, 100, 10);
    expect(view.state.doc.toString()).toBe('| Role | Name |\n| :---: | --- |\n| Designer | Vik |\n{table-col-widths="260,120"}');
    expect(view.plugin(tableCellEditor)!.currentAxisSelection()).toEqual({kind: 'column', tableFrom: 0, columnIndex: 1});
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toContain('{table-col-widths="260,120"}');
  });
  it('reorders the header by row drag, cancels a second drag, and reconciles handle count', () => {
    const view = mountHistory();
    pointer('pointerdown', view.dom.querySelector('.cm-table-row-handle-hit')!, 10, 10);
    pointer('pointermove', view.dom.querySelector('tbody td')!, 10, 100);
    pointer('pointerup', document, 10, 100);
    const moved = '| Vik | Designer |\n| --- | --- |\n| Name | Role |';
    expect(view.state.doc.toString()).toBe(moved);
    pointer('pointerdown', view.dom.querySelector('.cm-table-row-handle-hit')!, 10, 10);
    pointer('pointermove', view.dom.querySelector('tbody td')!, 10, 100);
    pointer('pointercancel', document);
    expect(view.state.doc.toString()).toBe(moved);
    expect(undoDepth(view.state)).toBe(1);
    view.dom.querySelector<HTMLButtonElement>('[aria-label="Add row"]')!.click();
    expect(view.dom.querySelectorAll('.cm-table-row-handle-hit')).toHaveLength(3);
    expect(view.dom.querySelectorAll('.cm-table-column-handle-hit')).toHaveLength(2);
    expect(mount(TABLE, true).dom.querySelectorAll('.cm-table-row-handle-hit, .cm-table-column-handle-hit')).toHaveLength(0);
  });
  it('clears and formats through engine commands and refuses a stale axis identity', () => {
    const source = '|A|B|\n|---|---|\n|one|two|';
    const view = mountHistory(source);
    const c = view.plugin(tableCellEditor)!;
    const row = { kind: 'row' as const, tableFrom: 0, rowIndex: 1 };
    expect(c.selectAxis(0, {row: 1, col: 0}, 'row')).toBe(true);
    expect(c.axisCommand(row, {kind: 'format'})).toBe(true);
    expect(view.state.doc.toString()).toBe('| A | B |\n| --- | --- |\n| one | two |');
    expect(c.axisCommand({...row, rowIndex: 0}, 'clear')).toBe(false);
    expect(c.axisCommand(row, 'clear')).toBe(true);
    expect(view.state.doc.toString()).toBe('| A | B |\n| --- | --- |\n|  |  |');
    expect(undo(view)).toBe(true);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
  });
});

describe('engine editable cell projection', () => {
  it('owns a drawn caret and selection layer while the root native caret is suppressed', () => {
    const view = mount(TABLE, false, undefined, true);
    // The real createEditorView foundation supplies drawSelection to the root.
    view.dispatch({ effects: StateEffect.appendConfig.of(drawSelection()) });
    clickCell(findCell(view, 'Vik'));
    const nested = view.plugin(tableCellEditor)!.nested!;
    expect(document.activeElement).toBe(nested.contentDOM);
    expect(nested.hasFocus).toBe(true);
    expect(view.hasFocus).toBe(false);
    expect(nested.dom.classList.contains('cm-focused')).toBe(true);
    expect(nested.scrollDOM.querySelector(':scope > .cm-cursorLayer')).not.toBeNull();
    expect(nested.scrollDOM.querySelector(':scope > .cm-selectionLayer')).not.toBeNull();
    view.dom.classList.add('cm-table-selection-active');
    // Root-only suppression must never target this nested layer.
    expect(nested.scrollDOM.querySelector('.cm-cursorLayer')!.matches(
      '.cm-editor.cm-focused.cm-table-selection-active > .cm-scroller > .cm-cursorLayer')).toBe(false);
    nested.dispatch({ selection: { anchor: 1 }, changes: { from: 1, insert: 'x' } });
    expect(nested.state.selection.main.head).toBe(1);
    expect(document.activeElement).toBe(nested.contentDOM);
    expect(nested.scrollDOM.querySelector(':scope > .cm-cursorLayer')).not.toBeNull();
    clickCell(findCell(view, 'Designer'));
    expect(view.plugin(tableCellEditor)!.nested).toBe(nested);
    expect(document.activeElement).toBe(nested.contentDOM);
    expect(nested.scrollDOM.querySelector(':scope > .cm-cursorLayer')).not.toBeNull();
  });

  it('reuses one nested editor across imported cells and preserves exact root history', () => {
    const doc = 'Before\n\n|A|B|\n|---|---|\n|one|two|\n\nAfter';
    const view = mount(doc, false, undefined, true);
    view.dispatch({ effects: StateEffect.appendConfig.of(history()) });
    clickCell(findCell(view, 'one'));
    const controller = view.plugin(tableCellEditor)!;
    const nested = controller.nested!;
    nested.dispatch({ changes: { from: 3, insert: '!' } });
    expect(view.state.doc.toString()).toBe(doc.replace('one', 'one!'));
    clickCell(findCell(view, 'two'));
    expect(controller.nested).toBe(nested);
    controller.close();
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(doc.replace('one', 'one!'));
  });

  it('materialises a missing cell, edits it, and closes on an external replacement', () => {
    const view = mount('| A | B |\n| --- | --- |\n| one |', false, undefined, true);
    const host = view.dom.querySelector<HTMLElement>('tbody tr td:last-child .cm-table-cell-wrapper')!;
    host.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    const nested = view.plugin(tableCellEditor)!.nested!;
    nested.dispatch({ changes: { from: 0, insert: 'new' } });
    expect(view.state.doc.toString()).toContain('| one | new |');
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'External' } });
    expect(nested.dom.isConnected).toBe(false);
    expect(view.state.doc.toString()).toBe('External');
  });

  it('maps an active imported cell across an external prefix edit and retains typed spaces', () => {
    const doc = 'Before\n\n|A|B|\n|---|---|\n|one|two|\n';
    const view = mount(doc, false, undefined, true);
    clickCell(findCell(view, 'one'));
    const nested = view.plugin(tableCellEditor)!.nested!;
    view.dispatch({ changes: { from: 0, insert: 'Prefix\n\n' } });
    nested.dispatch({ changes: { from: 3, insert: ' ' } });
    nested.dispatch({ changes: { from: 4, insert: 'more' } });
    expect(nested.state.doc.toString()).toBe('one more');
    expect(view.state.doc.toString()).toBe('Prefix\n\n' + doc.replace('one', 'one more'));
  });

  it('retains both documents when a production root filter refuses typing', () => {
    const view = mount(TABLE, false, undefined, true);
    clickCell(findCell(view, 'Vik'));
    const nested = view.plugin(tableCellEditor)!.nested!;
    view.dispatch({ effects: StateEffect.appendConfig.of(EditorState.transactionFilter.of(tr => tr.docChanged ? [] : tr)) });
    nested.dispatch({ changes: { from: 3, insert: '!' } });
    expect(nested.state.doc.toString()).toBe('Vik');
    expect(view.state.doc.toString()).toBe(TABLE);
  });

  it('refuses a structural cell edit before changing either view', () => {
    const view = mount(TABLE, false, undefined, true);
    clickCell(findCell(view, 'Vik'));
    const nested = view.plugin(tableCellEditor)!.nested!;
    nested.dispatch({ changes: { from: 0, insert: 'bad|cell' } });
    expect(nested.state.doc.toString()).toBe('Vik');
    expect(view.state.doc.toString()).toBe(TABLE);
  });
});

describe('table live wiring — read-only (note embed) table', () => {
  it('refreshes a read-only projection in place and preserves the exact width attribute and ragged source', () => {
    const doc = 'Intro\n\n| Name | Role |\n| --- | ---: |\n| **Vik** |\n{table-col-widths=" 130, 280 "}';
    const view = mount(doc, true);
    const scroll = view.dom.querySelector<HTMLElement>('.cm-table-scroll')!;
    const table = scroll.querySelector('table')!;
    const cell = table.tBodies[0]!.rows[0]!.cells[0]!;
    expect(cell.textContent).toBe('Vik');
    expect(cell.querySelector('.cm-table-cell-wrapper')!.children.length).toBeGreaterThan(0);
    expect(table.rows[1]!.cells[1]!.textContent).toBe('');
    expect(table.rows[1]!.cells[1]!.className).toContain('align-right');
    expect(table.querySelectorAll('col')[1]!.style.width).toBe('280px');
    expect(view.state.doc.toString()).toBe(doc);
    scroll.scrollLeft = 37;
    const pos = doc.indexOf('Vik');
    view.dispatch({ changes: { from: pos, to: pos + 3, insert: 'Mira' } });
    expect(view.dom.querySelector('.cm-table-scroll')).toBe(scroll);
    expect(scroll.scrollLeft).toBe(37);
    expect(table.rows[1]!.cells[0]).toBe(cell);
    expect(cell.textContent).toBe('Mira');
    expect(view.state.doc.toString()).toBe(doc.replace('Vik', 'Mira'));
  });

  it('keeps overflow cells visible when an imported table needs the compatibility renderer', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| A | B | C |';
    const view = mount(doc, true);
    expect(view.dom.querySelector('tbody tr')?.children).toHaveLength(3);
    expect(view.state.doc.toString()).toBe(doc);
  });

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
  it('arms and removes an explicitly sized table from the blank line below its width metadata', () => {
    const doc = TABLE + '\n{table-col-widths="100,180"}\n';
    const view = mount(doc, false, new TableActiveCellController());
    view.dispatch({ selection: { anchor: doc.length } });
    const press = (key: string) => view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    press('Backspace');
    expect(view.dom.querySelector('.cm-table-wrapper-selected')).not.toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
    press('Delete');
    expect(view.state.doc.toString()).toBe('\n');
    expect(view.dom.querySelector('.cm-table-widget')).toBeNull();
  });

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
    // widget's own documented structure: widget > .cm-table-wrapper >
    // .cm-table-scroll > .cm-table-inner > table > td > .cm-table-cell-wrapper
    // > .cm-editor. A descendant combinator for the final `table` hop, not
    // `>` — see tableHandleOverlay.ts's own resolveTableElement doc comment
    // for why .cm-table-inner sitting in between doesn't need its own
    // explicit segment here.
    expect(controller.nestedView!.dom.parentElement).toBe(activeWrapper);
    expect(activeWrapper!.parentElement?.tagName).toBe('TD');
    expect(activeWrapper!.closest('.cm-table-widget > .cm-table-wrapper > .cm-table-scroll table')).not.toBeNull();
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
    // TABLE has no trailing newline, so it's a terminal table from the
    // start — tableActivationNormalization()'s own "general terminal-table
    // guarantee" (tableActivationNormalization.ts) appends one the moment
    // any edit touches it, same as it would for a real keystroke.
    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| Viktor | Designer |\n');
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
    // forwardToRoot never incrementally patches around inside the cell's
    // raw gap — it rebuilds the *whole* gap from the nested editor's
    // current content via padCellContent (see that function's own doc
    // comment), which always reconstructs at least one leading and one
    // trailing space around real content, regardless of where the empty
    // cell's own trimmed anchor had collapsed to. For minGapWidth 2
    // ("  ", the empty cell's original 2-space gap) and content "x",
    // padCellContent's targetWidth is max(2, 1+2) = 3 — " x " (1 leading +
    // "x" + 1 trailing). EMPTY_CELL_TABLE has no trailing newline either —
    // same terminal-table guarantee as the multi-keystroke test above
    // appends one here too.
    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| Vik | x |\n');
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
    // EMPTY_CELL_TABLE has no surrounding text — the whole document is the
    // table, so `table.from` (position 0) is itself a position
    // `tableRootSelectionSnap.ts` deliberately treats as "inside" the
    // table (see that file's own doc comment) and immediately snaps away
    // from; asserting the root selection stays at 0 would actually be
    // asserting that filter's own snap target, not "untouched". The one
    // genuinely valid non-table position this document has is its own
    // end (`table.to === doc.length` is the filter's documented "left
    // alone" case) — used here instead so this test verifies what it
    // says: a cell click doesn't move root's own selection at all.
    const untouchedPos = view.state.doc.length;
    view.dispatch({ selection: { anchor: untouchedPos } });

    clickCell(emptyDataCell(view));

    // The click activates a cell (a root-level position tracked by the
    // controller), not the root EditorView's own text selection — that
    // stays wherever it was before the click.
    expect(view.state.selection.main.from).toBe(untouchedPos);
  });
});

describe('table live wiring — trailing-whitespace active-cell mismatch (rawFrom/rawTo containment fix)', () => {
  const EMPTY_CELL_TABLE = '| Name | Role |\n| --- | --- |\n|  |  |';

  function emptyDataCell(view: EditorView): Element {
    const td = view.dom.querySelectorAll('tbody td')[0];
    if (!td) {
      throw new Error('no first data cell found');
    }
    return td;
  }

  it('stays active after typing a trailing space — the cell still hosts the nested editor, not static text', () => {
    const controller = new TableActiveCellController();
    const view = mount(EMPTY_CELL_TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    clickCell(emptyDataCell(view));
    const nested = controller.nestedView!;
    nested.dispatch({ changes: { from: 0, to: 0, insert: 'Hello' } });
    nested.dispatch({ changes: { from: 5, to: 5, insert: ' ' } });

    // Before the fix: the controller's own anchor grows to include the
    // trailing space (via plain ChangeSet.mapPos), but rowCells()'s trim
    // immediately excludes that same trailing space from the cell's own
    // freshly-recomputed `to` — an exact-equality match between the two
    // then fails, and the widget renders this cell as if nothing were
    // active, orphaning the nested editor's DOM.
    const activeWrapper = Array.from(view.dom.querySelectorAll('.cm-table-cell-wrapper')).find((w) => w.contains(nested.dom));
    expect(activeWrapper).toBeDefined();
    expect(controller.nestedView).toBe(nested);
  });

  it('a second cell (already containing trailing whitespace) is never mistaken for the active one', () => {
    // Regression guard for the fix's own containment check: two cells
    // both starting at a `rawFrom` that could coincidentally satisfy a
    // looser check must not both appear "active" — only the one actually
    // tracked by the controller's anchor should.
    const controller = new TableActiveCellController();
    const view = mount(EMPTY_CELL_TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    clickCell(emptyDataCell(view));
    const nested = controller.nestedView!;
    nested.dispatch({ changes: { from: 0, to: 0, insert: 'x ' } });

    const wrappers = Array.from(view.dom.querySelectorAll('.cm-table-cell-wrapper'));
    const wrappersHostingNested = wrappers.filter((w) => w.contains(nested.dom));
    expect(wrappersHostingNested).toHaveLength(1);
  });

  it('typing a long, multi-word sentence (many trailing-whitespace moments) keeps the same cell active throughout, never creating extra rows', () => {
    const controller = new TableActiveCellController();
    const view = mount(EMPTY_CELL_TABLE, false, controller);
    controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);

    clickCell(emptyDataCell(view));
    const nested = controller.nestedView!;
    const sentence = 'Hello world this is a test';
    for (let i = 0; i < sentence.length; i++) {
      nested.dispatch({ changes: { from: i, to: i, insert: sentence[i]! } });
    }

    expect(controller.nestedView).toBe(nested);
    expect(nested.state.doc.toString()).toBe(sentence);
    expect(view.dom.querySelectorAll('tbody tr')).toHaveLength(1);
    const activeWrapper = Array.from(view.dom.querySelectorAll('.cm-table-cell-wrapper')).find((w) => w.contains(nested.dom));
    expect(activeWrapper).toBeDefined();
  });
});

describe('table live wiring — root selection is never left inside a pasted table (transactionFilter ordering regression)', () => {
  const RAGGED_PASTE = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | Delhi |\n| Alex | Engineer |';

  it('pasting a table whose last row is ragged into an empty document never leaves the root caret inside the widget', () => {
    const view = mount('', false, new TableActiveCellController());

    // A real paste always places the resulting selection at the *end* of
    // the pasted text (CM6's own paste handling does this explicitly) —
    // set here to actually replicate that, not left to default to
    // "map the old selection forward," which a bare `changes`-only
    // dispatch would otherwise do and which doesn't represent a real paste.
    view.dispatch({ changes: { from: 0, to: 0, insert: RAGGED_PASTE }, selection: { anchor: RAGGED_PASTE.length } });

    const table = findAllTables(view.state)[0]!;
    const head = view.state.selection.main.head;
    // `tableRootSelectionSnap.ts`'s own invariant: root selection may be
    // before a table or after one, never `>= table.from && < table.to`.
    expect(head < table.from || head >= table.to).toBe(true);
  });

  it('the root caret lands on a real, editable line immediately after the normalized (padded) table, not mid-widget', () => {
    const view = mount('', false, new TableActiveCellController());

    view.dispatch({ changes: { from: 0, to: 0, insert: RAGGED_PASTE }, selection: { anchor: RAGGED_PASTE.length } });

    const table = findAllTables(view.state)[0]!;
    const head = view.state.selection.main.head;
    // A genuine, addressable line exists at the caret, strictly after the
    // table — not the giant, widget-spanning caret a position inside
    // `[table.from, table.to)` would otherwise produce.
    expect(head).toBeGreaterThan(table.to);
    expect(view.state.doc.lineAt(head).text).toBe('');
  });

  it('the same regression, with a doc that already has content before the pasted table', () => {
    const view = mount('Some notes above.\n\n', false, new TableActiveCellController());
    const insertAt = view.state.doc.length;

    view.dispatch({
      changes: { from: insertAt, to: insertAt, insert: RAGGED_PASTE },
      selection: { anchor: insertAt + RAGGED_PASTE.length },
    });

    const table = findAllTables(view.state)[0]!;
    const head = view.state.selection.main.head;
    expect(head < table.from || head >= table.to).toBe(true);
  });
});

describe('table live wiring — Duplicate row/column, against the full production filter chain', () => {
  const TABLE = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | Delhi |\n| Alex | Engineer | Pune |';

  it('duplicating a row keeps the whole table rectangular (tableRectangularNormalization still applies)', () => {
    const view = mount(TABLE, false, new TableActiveCellController());
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: [tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 1 })] });

    duplicateSelectedRow(view, view.state.field(tableSelectionField)!);

    const freshTable = findAllTables(view.state)[0]!;
    const rows = getNavigableRows(freshTable.node);
    const headerCount = getRowCellBounds(rows[0]!).length;
    for (const row of rows) {
      expect(getRowCellBounds(row).length).toBe(headerCount);
    }
  });

  it('duplicating a column keeps the whole table rectangular', () => {
    const view = mount(TABLE, false, new TableActiveCellController());
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: [tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 1 })] });

    duplicateSelectedColumn(view, view.state.field(tableSelectionField)!);

    const freshTable = findAllTables(view.state)[0]!;
    const rows = getNavigableRows(freshTable.node);
    const headerCount = getRowCellBounds(rows[0]!).length;
    for (const row of rows) {
      expect(getRowCellBounds(row).length).toBe(headerCount);
    }
  });

  it('duplicating a row never leaves the root caret inside the table widget', () => {
    const view = mount(TABLE, false, new TableActiveCellController());
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: [tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 2 })] });

    duplicateSelectedRow(view, view.state.field(tableSelectionField)!);

    const freshTable = findAllTables(view.state)[0]!;
    const head = view.state.selection.main.head;
    expect(head < freshTable.from || head >= freshTable.to).toBe(true);
  });

  it('duplicating a column never leaves the root caret inside the table widget', () => {
    const view = mount(TABLE, false, new TableActiveCellController());
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: [tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 0 })] });

    duplicateSelectedColumn(view, view.state.field(tableSelectionField)!);

    const freshTable = findAllTables(view.state)[0]!;
    const head = view.state.selection.main.head;
    expect(head < freshTable.from || head >= freshTable.to).toBe(true);
  });

  it('duplicating a row does not leave a nested cell active', () => {
    const controller = new TableActiveCellController();
    const view = mount(TABLE, false, controller);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: [tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 1 })] });

    duplicateSelectedRow(view, view.state.field(tableSelectionField)!);

    expect(controller.activeAnchor).toBeNull();
  });

  it('duplicating a column does not leave a nested cell active', () => {
    const controller = new TableActiveCellController();
    const view = mount(TABLE, false, controller);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: [tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 0 })] });

    duplicateSelectedColumn(view, view.state.field(tableSelectionField)!);

    expect(controller.activeAnchor).toBeNull();
  });

  it('duplicating a row from a ragged source table does not create additional structural damage', () => {
    const ragged = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | Delhi |\n| Alex | Engineer |';
    const view = mount(ragged, false, new TableActiveCellController());
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: [tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 1 })] });

    duplicateSelectedRow(view, view.state.field(tableSelectionField)!);

    const freshTable = findAllTables(view.state)[0]!;
    const rows = getNavigableRows(freshTable.node);
    expect(rows).toHaveLength(4); // header + 3 body rows (Vik, its duplicate, Alex)
    // The pre-existing ragged "Alex" row is untouched by duplication itself
    // — rectangularizing it is `tableRectangularNormalization`'s own
    // separate, already-verified responsibility (`tableRectangularNormalization.test.ts`).
  });
});
