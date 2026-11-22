// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { resolveTableHandleMenuAnchor, tableHandleMenuSync, type OnTableHandleMenuChange } from './tableHandleMenuSync';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

function mountRootView(doc: string, onChange: OnTableHandleMenuChange): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [markdownLanguageExtension(), tableSelectionField, tableHandleMenuSync(() => onChange)],
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

describe('tableHandleMenuSync', () => {
  it('calls the callback with null when TableSelection transitions from set to null', () => {
    const onChange = vi.fn();
    const view = mountRootView(TABLE, onChange);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });
    onChange.mockClear(); // the initial select itself isn't this extension's own concern

    selectTable(view, null);

    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('does not call the callback when there was nothing selected to begin with (no spurious calls on ordinary edits)', () => {
    const onChange = vi.fn();
    const view = mountRootView(TABLE, onChange);

    view.dispatch({ changes: { from: 0, insert: 'x' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not call the callback when the selection changes from one row/column to a different one (a handle click, not a close)', () => {
    const onChange = vi.fn();
    const view = mountRootView(TABLE, onChange);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });
    onChange.mockClear();

    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not call the callback a second time while the selection stays null', () => {
    const onChange = vi.fn();
    const view = mountRootView(TABLE, onChange);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });
    selectTable(view, null);
    onChange.mockClear();

    view.dispatch({ changes: { from: 0, insert: 'x' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('is a no-op when no callback is currently registered (getter returns undefined)', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({
        doc: TABLE,
        extensions: [markdownLanguageExtension(), tableSelectionField, tableHandleMenuSync(() => undefined)],
      }),
      parent,
    });
    mountedViews.push(view);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    expect(() => selectTable(view, null)).not.toThrow();
  });
});


describe('resolveTableHandleMenuAnchor', () => {
  const makeWidget = () => {
    const widget = document.createElement('div'); widget.className = 'cm-table-widget'; widget.dataset.tableFrom = '0';
    widget.innerHTML = '<div class="cm-table-wrapper"><div class="cm-table-scroll"><table><thead><tr><th><div class="cm-table-column-handle"></div></th><th><div class="cm-table-column-handle"></div></th></tr></thead><tbody><tr><td><div class="cm-table-row-handle"></div></td><td></td></tr><tr><td><div class="cm-table-row-handle"></div></td><td></td></tr></tbody></table></div></div>';
    return widget;
  };
  it('resolves row and column handles from the current table selection', () => {
    const view = mountRootView(TABLE, vi.fn()); const widget = makeWidget(); view.dom.appendChild(widget);
    const rowSelection = { kind: 'row' as const, tableFrom: 0, rowIndex: 2 }; selectTable(view, rowSelection);
    expect(resolveTableHandleMenuAnchor(view, rowSelection)).toBe(widget.querySelector('tbody tr:nth-child(2) .cm-table-row-handle'));
    const columnSelection = { kind: 'column' as const, tableFrom: 0, columnIndex: 1 }; selectTable(view, columnSelection);
    expect(resolveTableHandleMenuAnchor(view, columnSelection)).toBe(widget.querySelector('thead th:nth-child(2) .cm-table-column-handle'));
  });
  it('resolves a replacement widget instead of retaining a detached handle', () => {
    const view = mountRootView(TABLE, vi.fn()); const firstWidget = makeWidget(); view.dom.appendChild(firstWidget);
    const selection = { kind: 'row' as const, tableFrom: 0, rowIndex: 1 }; selectTable(view, selection);
    const firstHandle = resolveTableHandleMenuAnchor(view, selection); const replacementWidget = makeWidget(); firstWidget.replaceWith(replacementWidget);
    const currentHandle = resolveTableHandleMenuAnchor(view, selection);
    expect(currentHandle).toBe(replacementWidget.querySelector('.cm-table-row-handle'));
    expect(currentHandle).not.toBe(firstHandle); expect(firstHandle?.isConnected).toBe(false);
  });
  it('returns null when the selected handle is absent from the live editor DOM', () => {
    const view = mountRootView(TABLE, vi.fn()); const selection = { kind: 'row' as const, tableFrom: 0, rowIndex: 1 }; selectTable(view, selection);
    expect(resolveTableHandleMenuAnchor(view, selection)).toBeNull();
  });
});
