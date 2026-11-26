// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownLanguageExtension } from '../markdownLanguage';
import { tableCellEditor } from '../table-engine/tableCellEditor';
import { tableWidgetDecoration } from './tableWidgetField';
import { resolveTableHandleMenuAnchor } from './tableHandleMenuSync';

const TABLE = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';
const mounted: EditorView[] = [];
afterEach(() => { for (const view of mounted.splice(0)) view.destroy(); });
function mount() {
  const view = new EditorView({ state: EditorState.create({ doc: TABLE, extensions: [markdownLanguageExtension(), tableCellEditor, tableWidgetDecoration(true)] }), parent: document.body.appendChild(document.createElement('div')) });
  mounted.push(view);
  return { view, engine: view.plugin(tableCellEditor)! };
}
describe('engine handle menu identity', () => {
  it('resolves row and column handles from the current axis', () => {
    const { view, engine } = mount();
    expect(engine.selectAxis(0, { row: 1, col: 0 }, 'row')).toBe(true);
    expect(resolveTableHandleMenuAnchor(view, engine.currentAxisSelection())).toBe(view.dom.querySelector('tbody .cm-table-row-handle'));
    expect(engine.selectAxis(0, { row: 0, col: 1 }, 'column')).toBe(true);
    expect(resolveTableHandleMenuAnchor(view, engine.currentAxisSelection())).toBe(view.dom.querySelector('thead th:nth-child(2) .cm-table-column-handle'));
  });
  it('does not resolve a stale axis', () => {
    const { view, engine } = mount();
    expect(engine.selectAxis(0, { row: 1, col: 0 }, 'row')).toBe(true);
    const row = engine.currentAxisSelection();
    expect(engine.selectAxis(0, { row: 0, col: 1 }, 'column')).toBe(true);
    expect(resolveTableHandleMenuAnchor(view, row)).toBeNull();
  });
  it('does not resolve a missing live handle', () => {
    const { view, engine } = mount();
    expect(engine.selectAxis(0, { row: 1, col: 0 }, 'row')).toBe(true);
    view.dom.querySelector('tbody .cm-table-row-handle')!.remove();
    expect(resolveTableHandleMenuAnchor(view, engine.currentAxisSelection())).toBeNull();
  });
  it('notifies open and close exactly once and does not close repeatedly', () => {
    const { engine } = mount();
    const notify = vi.fn();
    expect(engine.selectAxis(0, { row: 1, col: 0 }, 'row')).toBe(true);
    const selection = engine.currentAxisSelection()!;
    engine.openHandleMenu(selection, notify);
    engine.close();
    engine.close();
    expect(notify.mock.calls).toEqual([[{ selection }], [null]]);
  });
});
