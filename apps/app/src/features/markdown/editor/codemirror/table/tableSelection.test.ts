// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import plusIcon from '@shared/icon/svg/plus.svg?raw';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undoDepth } from '@codemirror/commands';
import { markdownLanguageExtension } from '../markdownLanguage';
import { tableWidgetDecoration } from './tableWidgetField';
import { tableCellEditor } from '../table-engine/tableCellEditor';
import { attachTableOutsideClickHandling } from './tableOutsideClick';
import { tableDeletionSelectionChanged, tableDeletionSelectionField } from './tableDeletionSelection';
import { TABLE_HANDLE_MENU_CLASS } from './tableHandleMenuSync';

const source = '| A | B |\n| --- | --- |\n| a | b |\n\nAfter';
const cleanups: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanups.splice(0)) dispose(); vi.restoreAllMocks(); document.body.innerHTML = ''; });
function mount(doc = source) {
  const view = new EditorView({ state: EditorState.create({ doc, extensions: [markdownLanguageExtension(), tableCellEditor, tableWidgetDecoration(true), tableDeletionSelectionField, history()] }), parent: document.body.appendChild(document.createElement('div')) });
  const detach = attachTableOutsideClickHandling(view);
  cleanups.push(() => { detach(); view.destroy(); });
  return { view, engine: view.plugin(tableCellEditor)!, detach };
}
function down(target: EventTarget) {
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}
function selectAll(view: EditorView) {
  view.dispatch({ selection: { anchor: 0, head: source.length } });
}

describe('root outside-click selection collapse', () => {
  it('collapses a stale root selection at the resolved position without changing source or history', () => {
    const { view } = mount();
    selectAll(view);
    vi.spyOn(view, 'posAtCoords').mockReturnValue(source.length);
    down(document.body);
    expect(view.state.selection.main.head).toBe(source.length);
    expect(view.state.selection.main.empty).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    expect(undoDepth(view.state)).toBe(0);
  });
  it('does not decide again for a click within root content', () => {
    const { view } = mount();
    selectAll(view);
    const pos = vi.spyOn(view, 'posAtCoords').mockReturnValue(source.length);
    // Dispatch directly on contentDOM; native CM6 handling is independent
    // of the outside-click fallback. The fallback itself must decline.
    view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 2 }));
    expect(pos).not.toHaveBeenCalled();
  });
  it('does not resolve a coordinate for an already-collapsed selection', () => {
    const { view } = mount();
    const pos = vi.spyOn(view, 'posAtCoords');
    down(document.body);
    expect(pos).not.toHaveBeenCalled();
  });
  it('leaves selection unchanged if no editor position resolves', () => {
    const { view } = mount();
    selectAll(view);
    vi.spyOn(view, 'posAtCoords').mockReturnValue(null);
    down(document.body);
    expect(view.state.selection.main.empty).toBe(false);
  });
  it('detaches the root fallback independently of the engine', () => {
    const { view, detach } = mount();
    selectAll(view);
    const pos = vi.spyOn(view, 'posAtCoords').mockReturnValue(source.length);
    detach();
    down(document.body);
    expect(pos).not.toHaveBeenCalled();
    expect(view.state.selection.main.empty).toBe(false);
  });
});

describe('engine outside-click and portaled menu ownership', () => {
  it('closes active cell editing on an outside click without editing source', () => {
    const { view, engine } = mount();
    expect(engine.enterCell(0, { row: 1, col: 0 }, 'start')).toBe(true);
    down(document.body);
    expect(engine.nested).toBeNull();
    expect(view.state.doc.toString()).toBe(source);
  });
  it('clears an axis selection on an ordinary outside click', () => {
    const { engine } = mount();
    expect(engine.selectAxis(0, { row: 0, col: 1 }, 'column')).toBe(true);
    down(document.body);
    expect(engine.currentAxisSelection()).toBeNull();
  });
  it('does not clear the selected axis on a portaled menu mousedown', () => {
    const { engine } = mount();
    expect(engine.selectAxis(0, { row: 1, col: 0 }, 'row')).toBe(true);
    const menu = document.body.appendChild(document.createElement('div'));
    menu.className = TABLE_HANDLE_MENU_CLASS;
    down(menu);
    expect(engine.currentAxisSelection()).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 1 });
  });
});

describe('table surrounding whitespace', () => {
  it.each(['.cm-table-widget', '.cm-table-wrapper', '.cm-table-scroll', '.cm-table-layout', '.cm-table-inner'])(
    'collapses root selection without selecting the table on %s', selector => {
      const { view } = mount();
      selectAll(view);
      down(view.dom.querySelector(selector)!);
      expect(view.state.selection.main.empty).toBe(true);
      expect(view.state.selection.main.head).toBe(source.indexOf('\n\nAfter') + 1);
      expect(view.dom.querySelector('.cm-table-wrapper-selected')).toBeNull();
      expect(view.state.doc.toString()).toBe(source);
      expect(undoDepth(view.state)).toBe(0);
    });
  it('closes cell editing on wrapper whitespace', () => {
    const { view, engine } = mount();
    expect(engine.enterCell(0, { row: 1, col: 0 }, 'start')).toBe(true);
    down(view.dom.querySelector('.cm-table-scroll')!);
    expect(engine.nested).toBeNull();
    expect(view.state.selection.main.empty).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
  });
  it('clears axis selection and any deletion arm on whitespace', () => {
    const { view, engine } = mount();
    expect(engine.selectAxis(0, { row: 0, col: 1 }, 'column')).toBe(true);
    down(view.dom.querySelector('.cm-table-wrapper')!);
    expect(engine.currentAxisSelection()).toBeNull();
    view.dispatch({ effects: tableDeletionSelectionChanged.of(0) });
    expect(view.state.field(tableDeletionSelectionField)).toBe(0);
    down(view.dom.querySelector('.cm-table-scroll')!);
    expect(view.state.field(tableDeletionSelectionField)).toBeNull();
    expect(view.state.doc.toString()).toBe(source);
  });
  it('does not intercept an actual cell or quick-add control', () => {
    const { view, engine } = mount();
    down(view.dom.querySelector('[data-cell="1,0"]')!);
    expect(engine.nested).not.toBeNull();
    down(view.dom.querySelector('.cm-table-quick-add-row')!);
    expect(engine.nested).not.toBeNull();
    expect(view.state.doc.toString()).toBe(source);
  });
  it('does not insert a newline when clicking beside a terminal table', () => {
    const doc = source.split('\n\nAfter')[0]!;
    const { view } = mount(doc);
    down(view.dom.querySelector('.cm-table-wrapper')!);
    expect(view.state.selection.main.empty).toBe(true);
    expect(view.state.selection.main.head).toBe(doc.length);
    expect(view.state.doc.toString()).toBe(doc);
    expect(undoDepth(view.state)).toBe(0);
  });
});

describe('table fill sizing and quick-add icons', () => {
  it('uses the same SVG path and stroke attributes as the shared plus icon on both controls', () => {
    const { view } = mount();
    const reference = document.createElement('div');
    reference.innerHTML = plusIcon;
    const expected = reference.querySelector('svg')!;
    const icons = view.dom.querySelectorAll('.cm-table-quick-add svg');
    expect(icons).toHaveLength(2);
    for (const icon of icons) {
      expect(icon.getAttribute('viewBox')).toBe(expected.getAttribute('viewBox'));
      expect(icon.innerHTML).toBe(expected.innerHTML);
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('updates the fill-width column count after adding a column', () => {
    const { view } = mount();
    const wrapper = () => view.dom.querySelector<HTMLElement>('.cm-table-wrapper')!;
    expect(wrapper().style.getPropertyValue('--cm-table-column-count')).toBe('2');
    view.dom.querySelector<HTMLButtonElement>('.cm-table-quick-add-column')!.click();
    expect(wrapper().style.getPropertyValue('--cm-table-column-count')).toBe('3');
    expect(wrapper().querySelectorAll('colgroup col')).toHaveLength(3);
  });
});

describe('quick-add gap hit area', () => {
  it.each(['row', 'column'])('keeps the %s gap separate from its actionable button', axis => {
    const { view } = mount();
    const track = view.dom.querySelector<HTMLElement>('.cm-table-quick-add-track-' + axis)!;
    expect(track).not.toBeNull();
    expect(track.querySelector('button.cm-table-quick-add-' + axis)).not.toBeNull();
    expect(track.tagName).not.toBe('BUTTON');
    down(track);
    track.click();
    expect(view.state.doc.toString()).toBe(source);
    expect(view.state.selection.main.empty).toBe(true);
    expect(undoDepth(view.state)).toBe(0);
  });
});
