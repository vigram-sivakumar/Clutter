// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { tableSelectionCaretVisibility } from './tableSelectionCaretVisibility';

const ACTIVE_CLASS = 'cm-table-selection-active';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

function mountRootView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [markdownLanguageExtension(), tableSelectionField, tableSelectionCaretVisibility()],
    }),
    parent,
  });
  mountedViews.push(view);
  return view;
}

function selectTable(view: EditorView, selection: TableSelection | null): void {
  view.dispatch({ effects: tableSelectionChanged.of(selection) });
}

const TABLE = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';

describe('tableSelectionCaretVisibility', () => {
  it('the class is absent when no TableSelection is active', () => {
    const view = mountRootView(TABLE);

    expect(view.dom.classList.contains(ACTIVE_CLASS)).toBe(false);
  });

  it('a column selection adds the class', () => {
    const view = mountRootView(TABLE);

    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    expect(view.dom.classList.contains(ACTIVE_CLASS)).toBe(true);
  });

  it('a row selection adds the class', () => {
    const view = mountRootView(TABLE);

    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    expect(view.dom.classList.contains(ACTIVE_CLASS)).toBe(true);
  });

  it('a range selection adds the class', () => {
    const view = mountRootView(TABLE);

    selectTable(view, { kind: 'range', tableFrom: 0, anchor: { row: 1, col: 0 }, head: { row: 1, col: 0 } });

    expect(view.dom.classList.contains(ACTIVE_CLASS)).toBe(true);
  });

  it('clearing the selection (back to null) removes the class', () => {
    const view = mountRootView(TABLE);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });
    expect(view.dom.classList.contains(ACTIVE_CLASS)).toBe(true);

    selectTable(view, null);

    expect(view.dom.classList.contains(ACTIVE_CLASS)).toBe(false);
  });

  it('switching from one selection kind to another leaves the class present throughout', () => {
    const view = mountRootView(TABLE);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    expect(view.dom.classList.contains(ACTIVE_CLASS)).toBe(true);
  });

  it('never moves or replaces state.selection — only the DOM class changes', () => {
    const view = mountRootView(TABLE);
    const before = view.state.selection;

    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    expect(view.state.selection.eq(before)).toBe(true);
  });
});
