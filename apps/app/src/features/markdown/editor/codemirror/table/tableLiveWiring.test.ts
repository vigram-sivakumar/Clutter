// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { history, undo, redo, undoDepth, redoDepth, historyKeymap } from '@codemirror/commands';
import { tableCellEditor } from '../table-engine/tableCellEditor';
import { buildTableShortcutMarkdown, insertTableOnShortcutSpace } from '../enter/tableCreateSpaceShortcut';
import { resolveTableHandleMenuAnchor, type OnTableHandleMenuChange } from './tableHandleMenuSync';
import type { TableCommand } from '../table-engine/tableCommands';
import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView, drawSelection, keymap } from '@codemirror/view';

import { buildEditorExtensions, type BuildEditorExtensionsOptions } from '../buildEditorExtensions';

/** Live editor integration using the production extension set. */
const REQUIRED: Omit<BuildEditorExtensionsOptions, 'readOnly' | 'hostPageId'> = {
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

function mount(doc: string, readOnly: boolean, onMenu?: OnTableHandleMenuChange): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: buildEditorExtensions({
        ...REQUIRED,
        readOnly,
        onOpenTableHandleMenu: () => onMenu,
        hostPageId: 'test-page',
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

  it('Tab exits editing into a caret-free cell, Shift-Tab wraps, F2 mounts a fresh editor', () => {
    const view = mount(doc, false);
    clickCell(findCell(view, 'Role'));
    const nested = view.plugin(tableCellEditor)!.nested!;
    key(nested.contentDOM, 'Tab');
    expect(selected(view)).toEqual(['1,0']);
    expect(nested.dom.isConnected).toBe(false);
    expect(document.activeElement).toBe(host(view, 1, 0));
    key(host(view, 1, 0), 'Tab', true);
    expect(selected(view)).toEqual(['0,1']);
    key(host(view, 0, 1), 'F2');
    expect(view.plugin(tableCellEditor)!.nested).not.toBe(nested);
    expect(view.plugin(tableCellEditor)!.nested!.state.doc.toString()).toBe('Role');
    expect(selected(view)).toEqual([]);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('Enter and Shift-Enter select vertically within the same column without changing source or history', () => {
    const source = doc.replace('| Vik | Designer |', '| Vik | Designer |\n| Sam | Writer |');
    const view = mount(source, false);
    const controller = view.plugin(tableCellEditor)!;
    const depth = undoDepth(view.state);
    const redo = redoDepth(view.state);
    clickCell(findCell(view, 'Role'));
    const nested = controller.nested!;
    key(nested.contentDOM, 'Enter');
    expect(nested.dom.isConnected).toBe(false);
    expect(controller.nested).toBeNull();
    expect(selected(view)).toEqual(['1,1']);
    expect(document.activeElement).toBe(host(view, 1, 1));
    key(host(view, 1, 1), 'Enter');
    expect(selected(view)).toEqual(['2,1']);
    expect(document.activeElement).toBe(host(view, 2, 1));
    expect(key(host(view, 2, 1), 'Enter')).toBe(false);
    expect(selected(view)).toEqual(['2,1']);
    expect(document.activeElement).toBe(host(view, 2, 1));
    key(host(view, 2, 1), 'Enter', true);
    expect(selected(view)).toEqual(['1,1']);
    key(host(view, 1, 1), 'Enter', true);
    expect(selected(view)).toEqual(['0,1']);
    expect(key(host(view, 0, 1), 'Enter', true)).toBe(false);
    expect(selected(view)).toEqual(['0,1']);
    expect(document.activeElement).toBe(host(view, 0, 1));
    expect(view.state.doc.toString()).toBe(source);
    expect(undoDepth(view.state)).toBe(depth);
    expect(redoDepth(view.state)).toBe(redo);
  });

  it.each([false, true])('preserves an editing cell, caret and source at a vertical boundary (backwards=%s)', backwards => {
    const view = mount(TABLE, false);
    clickCell(findCell(view, backwards ? 'Name' : 'Vik'));
    const controller = view.plugin(tableCellEditor)!;
    const nested = controller.nested!;
    nested.dispatch({ selection: { anchor: 1 } });
    const depth = undoDepth(view.state);
    expect(key(nested.contentDOM, 'Enter', backwards)).toBe(false);
    expect(controller.nested).toBe(nested);
    expect(nested.state.selection.main.head).toBe(1);
    expect(selected(view)).toEqual([]);
    expect(view.state.doc.toString()).toBe(TABLE);
    expect(undoDepth(view.state)).toBe(depth);
    key(nested.contentDOM, 'Enter', !backwards);
    expect(controller.nested).toBeNull();
    expect(selected(view)).toEqual([backwards ? '1,0' : '0,0']);
    expect(view.state.doc.toString()).toBe(TABLE);
    expect(undoDepth(view.state)).toBe(depth);
  });

  it.each(['|-|', '| - |'])('selects the entire table created by %s + Space, with one undo and redo', trigger => {
    const view = mount(trigger, false);
    view.dispatch({ effects: StateEffect.appendConfig.of(history()) });
    view.dispatch({ selection: { anchor: trigger.length } });
    const depth = undoDepth(view.state);
    expect(insertTableOnShortcutSpace(view)).toBe(true);
    const source = buildTableShortcutMarkdown();
    expect(view.state.doc.toString()).toBe(source);
    expect(selected(view)).toEqual(['0,0','0,1','0,2','1,0','1,1','1,2']);
    expect(view.plugin(tableCellEditor)!.nested).toBeNull();
    expect(document.activeElement).toBe(host(view, 0, 0));
    expect(undoDepth(view.state)).toBe(depth + 1);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(trigger);
    expect(selected(view)).toEqual([]);
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    expect(selected(view)).toEqual(['0,0','0,1','0,2','1,0','1,1','1,2']);
    clickCell(view.dom.querySelector('td')!);
    expect(view.plugin(tableCellEditor)!.nested).not.toBeNull();
    expect(selected(view)).toEqual([]);
    expect(view.state.doc.toString()).toBe(source);
  });

  it('selects a newly inserted Markdown table but not an existing table or external refresh', () => {
    const view = mount('', false);
    view.dispatch({ changes: { from: 0, insert: TABLE }, selection: { anchor: TABLE.length }, userEvent: 'input.type' });
    expect(selected(view)).toEqual(['0,0','0,1','1,0','1,1']);
    expect(document.activeElement).toBe(host(view, 0, 0));
    const existing = mount(TABLE, false);
    expect(selected(existing)).toEqual([]);
    const external = mount('', false);
    external.dispatch({ changes: { from: 0, insert: TABLE } });
    expect(selected(external)).toEqual([]);
  });

  it('Escape selects the active cell, Shift+arrows extend a reverse range, arrows collapse from head', () => {
    const view = mount(doc, false);
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
    const view = mount(doc, false);
    clickCell(findCell(view, 'Designer'));
    host(view, 0, 0).dispatchEvent(new MouseEvent('mousedown', { shiftKey: true, bubbles: true, cancelable: true }));
    expect(selected(view)).toEqual(['0,0','0,1','1,0','1,1']);
    expect(view.plugin(tableCellEditor)!.nested).toBeNull();
    key(host(view, 0, 0), 'x');
    expect(view.state.doc.toString()).toBe(doc);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(selected(view)).toEqual([]);
  });

  it('Tab at the last cell transfers focus to surrounding root Markdown', () => {
    const view = mount(doc, false);
    clickCell(findCell(view, 'Designer'));
    key(view.plugin(tableCellEditor)!.nested!.contentDOM, 'Tab');
    expect(selected(view)).toEqual([]);
    expect(view.hasFocus).toBe(true);
    expect(view.state.selection.main.head).toBeGreaterThan(doc.indexOf('Designer'));
  });

  it('selected-cell typing replaces that cell, Delete clears a range without shifting neighbours', () => {
    const view = mount(doc, false);
    clickCell(findCell(view, 'Vik'));
    const nested = view.plugin(tableCellEditor)!.nested!;
    key(nested.contentDOM, 'Escape');
    key(host(view, 1, 0), 'x');
    const replacement = view.plugin(tableCellEditor)!.nested!;
    expect(replacement).not.toBe(nested);
    expect(replacement.state.doc.toString()).toBe('x');
    expect(view.state.doc.toString()).toBe(doc.replace('Vik', 'x'));
    key(replacement.contentDOM, 'Escape');
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
    const view = mount(doc, false);
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
    const view = mount(doc, false);
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
    const view = mount(source, false);
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
    const view = mount(source, false);
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
    const view = mount(doc, false);
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
    const view = mount(doc, false);
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
    const view = mount(source, false);
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
    const view = mount(doc, false);
    clickCell(host(view, 1, 0).parentElement!);
    const nested = view.plugin(tableCellEditor)!.nested!;
    nested.dispatch({ selection: { anchor: 1, head: 2 } });
    fire(nested.contentDOM, 'paste', { 'text/html': '<table><tr><td>X</td></tr></table>', 'text/plain': 'X' });
    expect(nested.state.doc.toString()).toBe('VXk');
    expect(view.state.doc.toString()).toBe(doc.replace('Vik', 'VXk'));
    expect(nested.dom.isConnected).toBe(true);
  });
  it('still replaces a caret-free selected cell with a scalar clipboard payload', () => {
    const view = mount(doc, false);
    clickCell(host(view, 1, 0).parentElement!);
    key(view.plugin(tableCellEditor)!.nested!.contentDOM, 'Escape');
    fire(host(view, 1, 0), 'paste', { 'text/plain': 'New' });
    expect(view.state.doc.toString()).toBe(doc.replace('Vik', 'New'));
    expect(selected(view)).toEqual(['1,0']);
  });
  it('still fills multiple cells when pasting a grid into an active editor', () => {
    const view = mount(doc, false);
    clickCell(host(view, 1, 0).parentElement!);
    const nested = view.plugin(tableCellEditor)!.nested!;
    nested.dispatch({ selection: { anchor: 1 } });
    fire(nested.contentDOM, 'paste', { 'text/plain': 'One\tTwo' });
    expect(view.state.doc.toString()).toBe(doc.replace('Vik', 'One').replace('Designer', 'Two'));
    expect(nested.dom.isConnected).toBe(false);
    expect(selected(view)).toEqual(['1,0']);
  });
  it('rejects malformed internal data and preserves the selected host and source', () => {
    const view = mount(doc, false);
    selectRange(view);
    const { event } = fire(host(view, 1, 0), 'paste', { 'application/x-clutter-table': '{broken', 'text/plain': 'bad' });
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
    expect(selected(view)).toEqual(['1,0','1,1']);
  });
  it('creates a second table through root paste routing and restores its selection on redo', () => {
    const view = mount(doc, false);
    view.dispatch({ effects: StateEffect.appendConfig.of(history()) });
    view.dispatch({ selection: { anchor: doc.length } });
    const paste = fire(view.contentDOM, 'paste', { 'text/plain': 'A\tB\nx\ty' });
    expect(paste.event.defaultPrevented).toBe(true);
    const created = view.state.doc.toString();
    expect(created).toBe(doc + '\n\n| A | B |\n| --- | --- |\n| x | y |');
    expect(view.dom.querySelectorAll('[data-table-engine-cells="true"]')).toHaveLength(2);
    expect(selected(view)).toEqual(['0,0','0,1','1,0','1,1']);
    expect((document.activeElement as HTMLElement)?.dataset.cell).toBe('0,0');
    expect(view.plugin(tableCellEditor)!.nested).toBeNull();
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
    expect(selected(view)).toEqual([]);
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(created);
    expect(selected(view)).toEqual(['0,0','0,1','1,0','1,1']);
  });
});

describe('engine staged structural commands (M8 candidate)', () => {
  const doc = 'Before\n\n' + TABLE + '\n\nAfter';
  const mountHistory = (source = doc) => {
    const view = mount(source, false);
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
  it('exposes the supported table as an atomic range and restores exact source through multiple cell activations', () => {
    const view = mountHistory();
    const atomic = view.state.facet(EditorView.atomicRanges).flatMap(provider => {
      const result: Array<[number, number]> = [];
      provider(view).between(0, view.state.doc.length, (from, to) => { result.push([from, to]); });
      return result;
    });
    expect(atomic).toContainEqual([8, 8 + TABLE.length]);
    const revisions = [doc];
    let previous: EditorView | null = null;
    for (const name of ['Vik', 'Designer', 'Role']) {
      clickCell(findCell(view, name));
      const nested = view.plugin(tableCellEditor)!.nested!;
      expect(nested).not.toBe(previous);
      nested.dispatch({ changes: { from: name.length, insert: '!' }, userEvent: 'input.type' });
      revisions.push(view.state.doc.toString());
      previous = nested;
    }
    expect(undoDepth(view.state)).toBe(3);
    for (let i = 2; i >= 0; i--) {
      expect(undo(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(revisions[i]);
    }
    for (let i = 1; i <= 3; i++) {
      expect(redo(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(revisions[i]);
    }
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
  it('routes native history events from a Tab-selected cell through one root history', async () => {
    const source = 'Before\n\n| Name | Sex | Age |\n| --- | --- | --- |\n| Sow |  | 28 |\n| Vigram | Male | 32 |\n| Ram | Male | 31 |\n\nAfter';
    const view = mountHistory(source);
    const controller = view.plugin(tableCellEditor)!;
    expect(controller.selectAxis(8, { row: 0, col: 1 }, 'column')).toBe(true);
    expect(controller.axisCommand({ kind: 'column', tableFrom: 8, columnIndex: 1 }, { kind: 'moveColumn', from: 1, to: 2 })).toBe(true);
    const moved = view.state.doc.toString();
    expect(moved).not.toContain('table-col-widths');
    clickCell(findCell(view, 'Sow'));
    controller.nested!.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(select(view)).toEqual(['1,1']);
    const cell = host(view, 1, 1);
    expect(document.activeElement).toBe(cell);
    cell.blur();
    await Promise.resolve();
    expect(document.activeElement).toBe(cell);
    const native = (target: Element, inputType: string) => target.dispatchEvent(new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true }));
    expect(native(cell, 'historyUndo')).toBe(false);
    expect(view.state.doc.toString()).toBe(source);
    expect(undoDepth(view.state)).toBe(0);
    expect(redoDepth(view.state)).toBe(1);
    expect(select(view)).toEqual(['0,1','1,1','2,1','3,1']);
    expect(native(document.activeElement!, 'historyRedo')).toBe(false);
    expect(view.state.doc.toString()).toBe(moved);
    expect(undoDepth(view.state)).toBe(1);
    expect(redoDepth(view.state)).toBe(0);
    expect(view.dom.querySelectorAll('[data-table-engine-cells="true"]')).toHaveLength(1);
    expect(view.dom.querySelectorAll('tr')).toHaveLength(4);
  });

  it('keeps a Tab selection through an unrelated prefix edit', async () => {
    const source = 'Before\n\n' + TABLE + '\n\nAfter';
    const view = mountHistory(source);
    clickCell(findCell(view, 'Vik'));
    view.plugin(tableCellEditor)!.nested!.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(select(view)).toEqual(['1,1']);
    view.dispatch({ changes: { from: 0, insert: 'Prefix\n\n' } });
    await Promise.resolve();
    expect(select(view)).toEqual(['1,1']);
    expect(document.activeElement).toBe(host(view, 1, 1));
    expect(view.state.doc.toString()).toBe('Prefix\n\n' + source);
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
  it('duplicates and deletes a column with its alignment', () => {
    const source = doc.replace('| --- | --- |', '| --- | :---: |');
    const view = mountHistory(source);
    action(view, 1, 1, 'Duplicate column');
    const duplicated = view.state.doc.toString();
    expect(duplicated).toContain('| Name | Role | Role |');
    expect(duplicated).toContain('| --- | :---: | :---: |');
    expect(duplicated).not.toContain('table-col-widths');
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

describe('engine automatic column sizing (M11 simplification)', () => {
  const mountHistory = (source: string) => {
    const view = mount(source, false);
    view.dispatch({ effects: StateEffect.appendConfig.of(history()) });
    return view;
  };
  it('renders content-sized columns without resize handles or writing metadata', () => {
    const view = mountHistory(TABLE);
    expect(view.dom.querySelector('.cm-table-wrapper--auto-widths')).not.toBeNull();
    expect(view.dom.querySelector('.cm-table-column-resize-hit')).toBeNull();
    expect([...view.dom.querySelectorAll('col')].every(col => col.style.width === '')).toBe(true);
    expect(view.state.doc.toString()).toBe(TABLE);
    expect(undoDepth(view.state)).toBe(0);
  });
  it('edits automatically sized columns with exact reversible source', () => {
    const source = TABLE;
    const view = mountHistory(source);
    expect(view.dom.querySelector('.cm-table-wrapper--explicit-widths')).toBeNull();
    expect(view.dom.querySelector('.cm-table-column-resize-hit')).toBeNull();
    clickCell(findCell(view, 'Vik'));
    const nested = view.plugin(tableCellEditor)!.nested!;
    expect(view.state.doc.toString()).toBe(source);
    expect(undoDepth(view.state)).toBe(0);
    nested.dispatch({ changes: { from: 3, insert: '!' }, userEvent: 'input.type' });
    expect(view.state.doc.toString()).toBe(TABLE.replace('Vik', 'Vik!'));
    expect(nested.state.doc.toString()).toBe('Vik!');
    expect(undoDepth(view.state)).toBe(1);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(TABLE.replace('Vik', 'Vik!'));
  });
  it('preserves the scrollport and horizontal scroll position during engine cell activation and typing', () => {
    const view = mountHistory('| A | B | C | D |\n| --- | --- | --- | --- |\n| one | two | three | four |');
    const scroll = view.dom.querySelector<HTMLElement>('.cm-table-scroll')!;
    scroll.scrollLeft = 250;
    clickCell(findCell(view, 'three'));
    const nested = view.plugin(tableCellEditor)!.nested!;
    expect(view.dom.querySelector('.cm-table-scroll')).toBe(scroll);
    expect(scroll.scrollLeft).toBe(250);
    nested.dispatch({ changes: { from: nested.state.doc.length, insert: '!' }, userEvent: 'input.type' });
    expect(view.dom.querySelector('.cm-table-scroll')).toBe(scroll);
    expect(scroll.scrollLeft).toBe(250);
    expect(view.state.doc.toString()).toContain('| one | two | three! | four |');
    expect(undo(view)).toBe(true);
    expect(view.dom.querySelector('.cm-table-scroll')).toBe(scroll);
    expect(scroll.scrollLeft).toBe(250);
    expect(view.state.doc.toString()).toContain('| one | two | three | four |');
  });
  it('keeps resizing absent after adding and undoing columns and in read-only projection', () => {
    const view = mountHistory(TABLE);
    view.dom.querySelector<HTMLButtonElement>('[aria-label="Add column"]')!.click();
    expect(view.dom.querySelector('.cm-table-column-resize-hit')).toBeNull();
    expect(undo(view)).toBe(true);
    expect(view.dom.querySelector('.cm-table-column-resize-hit')).toBeNull();
    expect(mount(TABLE, true).dom.querySelector('.cm-table-column-resize-hit')).toBeNull();
  });
});

describe('engine original table handles (M9b candidate)', () => {
  const pointer = (type: string, target: EventTarget, x = 10, y = 10) =>
    target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
  const mountHistory = (source = TABLE, notify?: OnTableHandleMenuChange) => {
    const view = mount(source, false, notify);
    view.dispatch({ effects: StateEffect.appendConfig.of(history()) });
    return view;
  };
  it('opens the original logical menu on handle release and resolves its live anchor from engine selection', () => {
    const notify = vi.fn<OnTableHandleMenuChange>();
    const view = mountHistory(TABLE, notify);
    const hit = view.dom.querySelector<HTMLElement>('th .cm-table-column-handle-hit')!;
    expect(hit).not.toBeNull();
    pointer('pointerdown', hit);
    expect(notify).not.toHaveBeenCalled();
    pointer('pointerup', document);
    const selection = { kind: 'column' as const, tableFrom: 0, columnIndex: 0 };
    expect(notify).toHaveBeenCalledWith({ selection });
    expect(resolveTableHandleMenuAnchor(view, selection)).toBe(view.dom.querySelector('th .cm-table-column-handle'));
    expect(view.dom.querySelectorAll('.cm-table-engine-selected')).toHaveLength(2);
    const c = view.plugin(tableCellEditor)!;
    expect(c.axisCommand(selection, { kind: 'setAlignment', col: 0, alignment: 'center' })).toBe(true);
    expect(view.state.doc.toString()).toBe(TABLE.replace('| --- | --- |', '| :---: | --- |'));
    expect(notify).toHaveBeenCalledWith(null);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(TABLE);
  });
  it.each(['row', 'column'] as const)('dismisses the %s menu backdrop without clearing the selected axis', axis => {
    const notify = vi.fn<OnTableHandleMenuChange>();
    const view = mountHistory(TABLE, notify);
    const controller = view.plugin(tableCellEditor)!;
    pointer('pointerdown', view.dom.querySelector(`.cm-table-${axis}-handle-hit`)!);
    pointer('pointerup', document);
    const selection = controller.currentAxisSelection();
    expect(selection?.kind).toBe(axis);
    expect(notify).toHaveBeenCalledWith({ selection });

    // Match Overlay's real portal structure and event order: the backdrop
    // is a sibling of the surface, and click (not mousedown) dismisses it.
    const portal = document.createElement('div');
    portal.className = 'overlay';
    portal.innerHTML = '<div class="overlay__backdrop"></div><div class="overlay__surface"><div class="overlay__content cm-table-handle-menu"><button>Menu item</button></div></div>';
    document.body.append(portal);
    const backdrop = portal.querySelector<HTMLElement>('.overlay__backdrop')!;
    backdrop.addEventListener('click', () => { controller.dismissHandleMenu(); portal.remove(); });
    try {
      portal.querySelector('button')!.focus();
      backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      expect(controller.currentAxisSelection()).toEqual(selection);
      expect(notify).not.toHaveBeenCalledWith(null);
      backdrop.click();
      expect(portal.isConnected).toBe(false);
      expect(controller.currentAxisSelection()).toEqual(selection);
      expect(view.dom.querySelectorAll('.cm-table-engine-selected')).toHaveLength(2);
      expect(document.activeElement).toBe(view.dom.querySelector('[data-cell="0,0"]'));
      expect(view.state.doc.toString()).toBe(TABLE);
      expect(undoDepth(view.state)).toBe(0);
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      expect(controller.currentAxisSelection()).toBeNull();
      expect(view.dom.querySelectorAll('.cm-table-engine-selected')).toHaveLength(0);
    } finally { portal.remove(); }
  });
  it('reorders columns by their original handle and carries alignment', () => {
    const source = TABLE.replace('| --- | --- |', '| --- | :---: |');
    const view = mountHistory(source);
    const hits = view.dom.querySelectorAll<HTMLElement>('.cm-table-column-handle-hit');
    pointer('pointerdown', hits[0]!, 10, 10);
    pointer('pointermove', view.dom.querySelectorAll('th')[1]!, 100, 10);
    expect(view.state.doc.toString()).toBe(source);
    pointer('pointerup', document, 100, 10);
    expect(view.state.doc.toString()).toBe('| Role | Name |\n| :---: | --- |\n| Designer | Vik |');
    expect(view.plugin(tableCellEditor)!.currentAxisSelection()).toEqual({kind: 'column', tableFrom: 0, columnIndex: 1});
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).not.toContain('table-col-widths');
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
    expect(view.state.doc.toString()).toBe('| A   | B   |\n| --- | --- |\n| one | two |');
    expect(c.axisCommand({...row, rowIndex: 0}, 'clear')).toBe(false);
    expect(c.axisCommand(row, 'clear')).toBe(true);
    expect(view.state.doc.toString()).toBe('| A | B |\n| --- | --- |\n|  |  |');
    expect(undo(view)).toBe(true);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
  });
});

describe('engine visual and formatting parity (M10a candidate)', () => {
  it('uses one existing selection outline, updates its geometry, and hides it on deselection', () => {
    const view = mount(TABLE, false);
    const widget = view.dom.querySelector<HTMLElement>('[data-table-engine-cells="true"]')!;
    const scroll = widget.querySelector<HTMLElement>('.cm-table-scroll')!;
    const rect = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, right: left + width, bottom: top + height } as DOMRect);
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue(rect(20, 30, 400, 100));
    const cells = widget.querySelectorAll('th,td');
    for (let i = 0; i < cells.length; i++) vi.spyOn(cells[i]!, 'getBoundingClientRect')
      .mockReturnValue(rect(20 + (i % 2) * 100, 30 + Math.floor(i / 2) * 36, 100, 36));
    const overlay = scroll.querySelector<HTMLElement>('.cm-table-selection-overlay')!;
    expect(overlay).not.toBeNull();
    expect(overlay.classList.contains('cm-table-selection-overlay-visible')).toBe(false);
    const c = view.plugin(tableCellEditor)!;
    expect(c.selectAxis(0, { row: 1, col: 0 }, 'row')).toBe(true);
    expect(scroll.querySelectorAll('.cm-table-selection-overlay')).toHaveLength(1);
    expect(overlay.style.left).toBe('-1px');
    expect(overlay.style.top).toBe('35px');
    expect(overlay.style.width).toBe('202px');
    expect(overlay.style.height).toBe('38px');
    expect(overlay.classList.contains('cm-table-selection-overlay-visible')).toBe(true);
    expect(c.selectAxis(0, { row: 0, col: 1 }, 'column')).toBe(true);
    expect(overlay.style.left).toBe('99px');
    expect(overlay.style.height).toBe('74px');
    c.close();
    expect(overlay.classList.contains('cm-table-selection-overlay-visible')).toBe(false);
    expect(mount(TABLE, true).dom.querySelector('.cm-table-selection-overlay')).toBeNull();
  });
  it('activates a cell from its padded area, not only its text wrapper', () => {
    const view = mount(TABLE, false);
    const cell = findCell(view, 'Vik');
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    const nested = view.plugin(tableCellEditor)!.nested!;
    expect(nested.state.doc.toString()).toBe('Vik');
    expect(nested.dom.parentElement).toBe(wrapperOf(cell));
  });
  it('applies existing inline format shortcuts in the nested editor and commits to root history', () => {
    const view = mount(TABLE, false);
    view.dispatch({ effects: StateEffect.appendConfig.of(history()) });
    clickCell(findCell(view, 'Vik'));
    const nested = view.plugin(tableCellEditor)!.nested!;
    nested.dispatch({ selection: { anchor: 0, head: 3 } });
    const press = (key: string, keyCode: number, mac: boolean) => nested.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key, keyCode, metaKey: mac, ctrlKey: !mac, bubbles: true, cancelable: true }));
    const mac = /Mac/.test(navigator.platform);
    press('b', 66, mac);
    if (nested.state.doc.toString() === 'Vik') press('b', 66, !mac);
    expect(nested.state.doc.toString()).toBe('**Vik**');
    expect(view.state.doc.toString()).toBe(TABLE.replace('Vik', '**Vik**'));
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(TABLE);
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(TABLE.replace('Vik', '**Vik**'));
  });
});

describe('engine active-cell arrow and source padding regressions', () => {
  const press = (nested: EditorView, key: string) => nested.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  it('navigates active editing by arrows, remounting the nested view and retaining exact source', () => {
    const source = 'Before\n\n' + TABLE + '\n\nAfter';
    const view = mount(source, false);
    clickCell(findCell(view, 'Vik'));
    let nested = view.plugin(tableCellEditor)!.nested!;
    nested.dispatch({ selection: { anchor: 1 } });
    press(nested, 'ArrowRight');
    expect(nested.state.doc.toString()).toBe('Vik');
    nested.dispatch({ selection: { anchor: 3 } });
    press(nested, 'ArrowRight');
    expect(nested.dom.isConnected).toBe(false);
    nested = view.plugin(tableCellEditor)!.nested!;
    expect(nested.state.doc.toString()).toBe('Designer');
    expect(nested.state.selection.main.head).toBe(0);
    press(nested, 'ArrowLeft');
    expect(nested.dom.isConnected).toBe(false);
    nested = view.plugin(tableCellEditor)!.nested!;
    expect(nested.state.doc.toString()).toBe('Vik');
    expect(nested.state.selection.main.head).toBe(3);
    press(nested, 'ArrowUp');
    expect(nested.dom.isConnected).toBe(false);
    nested = view.plugin(tableCellEditor)!.nested!;
    expect(nested.state.doc.toString()).toBe('Name');
    expect(nested.state.selection.main.head).toBe(0);
    press(nested, 'ArrowDown');
    expect(nested.dom.isConnected).toBe(false);
    nested = view.plugin(tableCellEditor)!.nested!;
    expect(nested.state.doc.toString()).toBe('Vik');
    expect(nested.state.selection.main.head).toBe(0);
    expect(view.plugin(tableCellEditor)!.nested).toBe(nested);
    expect(document.activeElement).toBe(nested.contentDOM);
    expect(view.state.doc.toString()).toBe(source);
    press(nested, 'ArrowDown');
    expect(nested.dom.isConnected).toBe(false);
    expect(view.hasFocus).toBe(true);
    expect(view.state.selection.main.head).toBe(source.indexOf('\n\nAfter') + 1);
    expect(view.state.doc.toString()).toBe(source);
  });

  it('does not expose alignment padding on cell activation and preserves newly typed spaces while active', () => {
    const source = '| Name | Role     |\n| ---- | -------- |\n| Vik  | Designer |\n|      |          |';
    const view = mount(source, false);
    clickCell(findCell(view, 'Vik'));
    const nested = view.plugin(tableCellEditor)!.nested!;
    expect(nested.state.doc.toString()).toBe('Vik');
    nested.dispatch({ changes: { from: 3, insert: ' ' } });
    expect(nested.state.doc.toString()).toBe('Vik ');
    nested.dispatch({ changes: { from: 4, insert: 'more' } });
    expect(nested.state.doc.toString()).toBe('Vik more');
    expect(view.state.doc.toString()).toBe(source.replace('Vik  ', 'Vik more  '));
    const blank = view.dom.querySelector<HTMLElement>('[data-cell="2,0"]')!;
    blank.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    const empty = view.plugin(tableCellEditor)!.nested!;
    expect(empty).not.toBe(nested);
    expect(empty.state.doc.toString()).toBe('');
    expect(view.state.doc.toString()).toBe(source.replace('Vik  ', 'Vik more  '));
    empty.dispatch({ changes: { from: 0, insert: 'x' } });
    expect(empty.state.doc.toString()).toBe('x');
    expect(view.state.doc.toString()).toBe(source.replace('Vik  ', 'Vik more  ').replace('|      |', '| x     |'));
  });
});

describe('engine editable cell projection', () => {
  it('owns a drawn caret and selection layer while the root native caret is suppressed', () => {
    const view = mount(TABLE, false);
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
    const next = view.plugin(tableCellEditor)!.nested!;
    expect(next).not.toBe(nested);
    expect(nested.dom.isConnected).toBe(false);
    expect(document.activeElement).toBe(next.contentDOM);
    expect(next.scrollDOM.querySelector(':scope > .cm-cursorLayer')).not.toBeNull();
  });

  it('creates a fresh nested editor across imported cells and preserves exact root history', () => {
    const doc = 'Before\n\n|A|B|\n|---|---|\n|one|two|\n\nAfter';
    const view = mount(doc, false);
    view.dispatch({ effects: StateEffect.appendConfig.of(history()) });
    clickCell(findCell(view, 'one'));
    const controller = view.plugin(tableCellEditor)!;
    const nested = controller.nested!;
    nested.dispatch({ changes: { from: 3, insert: '!' } });
    expect(view.state.doc.toString()).toBe(doc.replace('one', 'one!'));
    clickCell(findCell(view, 'two'));
    expect(controller.nested).not.toBe(nested);
    expect(nested.dom.isConnected).toBe(false);
    controller.close();
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(doc.replace('one', 'one!'));
  });

  it('materialises a missing cell, edits it, and closes on an external replacement', () => {
    const view = mount('| A | B |\n| --- | --- |\n| one |', false);
    const host = view.dom.querySelector<HTMLElement>('tbody tr td:last-child .cm-table-cell-wrapper')!;
    host.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    const nested = view.plugin(tableCellEditor)!.nested!;
    expect(nested.state.doc.toString()).toBe('');
    expect(view.state.doc.toString()).toBe('| A | B |\n| --- | --- |\n| one |  |');
    nested.dispatch({ changes: { from: 0, insert: 'new' } });
    expect(nested.state.doc.toString()).toBe('new');
    expect(view.state.doc.toString()).toBe('| A | B |\n| --- | --- |\n| one | new |');
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'External' } });
    expect(nested.dom.isConnected).toBe(false);
    expect(view.state.doc.toString()).toBe('External');
  });

  it('maps an active imported cell across an external prefix edit and retains typed spaces', () => {
    const doc = 'Before\n\n|A|B|\n|---|---|\n|one|two|\n';
    const view = mount(doc, false);
    clickCell(findCell(view, 'one'));
    const nested = view.plugin(tableCellEditor)!.nested!;
    view.dispatch({ changes: { from: 0, insert: 'Prefix\n\n' } });
    nested.dispatch({ changes: { from: 3, insert: ' ' } });
    nested.dispatch({ changes: { from: 4, insert: 'more' } });
    expect(nested.state.doc.toString()).toBe('one more');
    expect(view.state.doc.toString()).toBe('Prefix\n\n' + doc.replace('one', 'one more'));
  });

  it('retains both documents when a production root filter refuses typing', () => {
    const view = mount(TABLE, false);
    clickCell(findCell(view, 'Vik'));
    const nested = view.plugin(tableCellEditor)!.nested!;
    view.dispatch({ effects: StateEffect.appendConfig.of(EditorState.transactionFilter.of(tr => tr.docChanged ? [] : tr)) });
    nested.dispatch({ changes: { from: 3, insert: '!' } });
    expect(nested.state.doc.toString()).toBe('Vik');
    expect(view.state.doc.toString()).toBe(TABLE);
  });

  it('refuses a structural cell edit before changing either view', () => {
    const view = mount(TABLE, false);
    clickCell(findCell(view, 'Vik'));
    const nested = view.plugin(tableCellEditor)!.nested!;
    nested.dispatch({ changes: { from: 0, insert: 'bad|cell' } });
    expect(nested.state.doc.toString()).toBe('Vik');
    expect(view.state.doc.toString()).toBe(TABLE);
  });
});

describe('table live wiring — read-only (note embed) table', () => {
  it('refreshes a read-only projection in place and preserves the exact ragged source', () => {
    const doc = 'Intro\n\n| Name | Role |\n| --- | ---: |\n| **Vik** |';
    const view = mount(doc, true);
    const scroll = view.dom.querySelector<HTMLElement>('.cm-table-scroll')!;
    const table = scroll.querySelector('table')!;
    const cell = table.tBodies[0]!.rows[0]!.cells[0]!;
    expect(cell.textContent).toBe('Vik');
    expect(cell.querySelector('.cm-table-cell-wrapper')!.children.length).toBeGreaterThan(0);
    expect(table.rows[1]!.cells[1]!.textContent).toBe('');
    expect(table.rows[1]!.cells[1]!.className).toContain('align-right');
    expect(table.querySelectorAll('col')[1]!.style.width).toBe('');
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

  it('projects overflow cells in the read-only engine without dropping source', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| A | B | C |';
    const view = mount(doc, true);
    expect(view.dom.querySelector('thead tr')?.children).toHaveLength(3);
    expect(view.dom.querySelector('tbody tr')?.children).toHaveLength(3);
    expect(view.dom.querySelector('[data-cell="1,2"]')?.textContent).toBe('C');
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
  it('arms and removes a table from the blank line below it', () => {
    const doc = TABLE + '\n';
    const view = mount(doc, false);
    view.dispatch({ selection: { anchor: doc.length } });
    const press = (key: string) => view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    press('Backspace');
    expect(view.dom.querySelector('.cm-table-wrapper-selected')).not.toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
    press('Delete');
    expect(view.state.doc.toString()).toBe('\n');
    expect(view.dom.querySelector('.cm-table-widget')).toBeNull();
  });

  it('keeps the live nested editor focused across consecutive root-backed edits', () => {
    const view = mount(TABLE, false);
    clickCell(findCell(view, 'Vik'));
    const editor = view.plugin(tableCellEditor)!;
    const nested = editor.nested!;
    expect(nested.hasFocus).toBe(true);
    for (const text of [' ', 'one', ' ', 'two']) {
      nested.dispatch({ changes: { from: nested.state.doc.length, insert: text }, userEvent: 'input.type' });
      expect(editor.nested).toBe(nested);
      expect(nested.dom.isConnected).toBe(true);
    }
    expect(nested.state.doc.toString()).toBe('Vik one two');
    expect(view.state.doc.toString()).toBe(TABLE.replace('Vik', 'Vik one two'));
  });

  it('activates an empty real cell without materialising source until typing', () => {
    const source = '| A | B |\n| --- | --- |\n| one |  |';
    const view = mount(source, false);
    const editor = view.plugin(tableCellEditor)!;
    expect(editor.enterCell(0, { row: 1, col: 1 }, 'start')).toBe(true);
    const nested = editor.nested!;
    expect(nested.state.doc.toString()).toBe('');
    expect(nested.state.selection.main.head).toBe(0);
    expect(view.state.doc.toString()).toBe(source);
    nested.dispatch({ changes: { from: 0, insert: 'x' }, userEvent: 'input.type' });
    expect(nested.state.doc.toString()).toBe('x');
    expect(view.state.doc.toString()).toContain('| one | x |');
  });

  it('root edits outside a table never activate a nested cell', () => {
    const view = mount('Before\n\n' + TABLE, false);
    view.dispatch({ changes: { from: 0, insert: 'New ' } });
    expect(view.plugin(tableCellEditor)!.nested).toBeNull();
    expect(view.state.doc.toString()).toBe('New Before\n\n' + TABLE);
  });
});
