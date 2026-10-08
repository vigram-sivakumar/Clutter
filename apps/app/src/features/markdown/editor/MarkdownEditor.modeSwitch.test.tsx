// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { completionStatus } from '@codemirror/autocomplete';
import { undoDepth } from '@codemirror/commands';
import { foldEffect, foldState } from '@codemirror/language';
import { EditorView } from '@codemirror/view';

import { MarkdownEditor } from './MarkdownEditor';
import { __clearAllCachedEditorHistoryForTests } from './codemirror/editorHistoryCache';

/**
 * Archiving or restoring an open page flips the editor's `readOnly` prop. The live `EditorView` is
 * re-configured in place — it is never rebuilt — so everything the user can see or has done in it carries
 * on, while the editing machinery is removed and restored with the mode.
 */

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => {
  __clearAllCachedEditorHistoryForTests();
});
afterEach(cleanup);

const DOC = '# Heading\n\nBody text\n\n- item';
const TABLE = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';


function mount(markdown: string, readOnly: boolean) {
  const props = { pageId: 'switch-page', getTagSuggestions: () => ['design'] } as const;
  const utils = render(<MarkdownEditor {...props} markdown={markdown} readOnly={readOnly} />);
  const viewOf = () => EditorView.findFromDOM(utils.container as unknown as HTMLElement)!;

  return {
    ...utils,
    viewOf,
    setMode: (next: boolean, nextMarkdown = markdown) =>
      utils.rerender(<MarkdownEditor {...props} markdown={nextMarkdown} readOnly={next} />),
  };
}

const press = (view: EditorView, key: string) =>
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const cellOf = (view: EditorView, text: string) =>
  Array.from(view.dom.querySelectorAll('th, td')).find((el) => el.textContent === text)!;
const clickCell = (cell: Element) => {
  cell.querySelector(':scope > .cm-table-cell-wrapper')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('archive → restore keeps the same editor', () => {
  it('the EditorView and its .cm-editor element survive both switches', () => {
    const { viewOf, setMode, container } = mount(DOC, false);
    const view = viewOf();
    const editorEl = container.querySelector('.cm-editor');

    setMode(true);
    expect(viewOf()).toBe(view);
    expect(container.querySelector('.cm-editor')).toBe(editorEl);
    expect(view.contentDOM.getAttribute('contenteditable')).toBe('false');

    setMode(false);
    expect(viewOf()).toBe(view);
    expect(container.querySelector('.cm-editor')).toBe(editorEl);
    expect(view.contentDOM.getAttribute('contenteditable')).toBe('true');
  });

  it('keeps undo history, selection, fold state and scroll position across archive and restore', () => {
    const { viewOf, setMode } = mount(DOC, false);
    const view = viewOf();
    view.dispatch({ changes: { from: 0, insert: 'X' } });
    view.dispatch({ selection: { anchor: 5, head: 8 } });
    view.dispatch({ effects: foldEffect.of({ from: 10, to: 20 }) });
    view.scrollDOM.scrollTop = 120;
    const before = {
      depth: undoDepth(view.state),
      selection: view.state.selection.main.toJSON(),
      folds: view.state.field(foldState).size,
    };
    expect(before.depth).toBe(1);

    for (const mode of [true, false]) {
      setMode(mode);

      expect(undoDepth(view.state)).toBe(before.depth);
      expect(view.state.selection.main.toJSON()).toEqual(before.selection);
      expect(view.state.field(foldState).size).toBe(before.folds);
      expect(view.scrollDOM.scrollTop).toBe(120);
    }
  });

  it('takes no focus in either direction', () => {
    const { viewOf, setMode } = mount(DOC, false);
    const view = viewOf();

    setMode(true);
    expect(document.activeElement).not.toBe(view.contentDOM);
    setMode(false);
    expect(document.activeElement).not.toBe(view.contentDOM);
  });

  it('an editing session blurs when the page is archived under it', () => {
    const { viewOf, setMode } = mount(DOC, false);
    const view = viewOf();
    view.focus();
    expect(document.activeElement).toBe(view.contentDOM);

    setMode(true);

    expect(document.activeElement).not.toBe(view.contentDOM);
  });
});

describe('typing and keymaps follow the mode', () => {
  it('typing is blocked while archived and works again after restore', () => {
    const { viewOf, setMode } = mount('Existing', false);
    const view = viewOf();

    setMode(true);
    view.dispatch({ changes: { from: 0, insert: 'typed ' } });
    expect(view.state.doc.toString()).toBe('Existing');

    setMode(false);
    view.dispatch({ changes: { from: 0, insert: 'typed ' } });
    expect(view.state.doc.toString()).toBe('typed Existing');
  });

  it('Enter continues a list and Tab indents it again after restore — and neither does anything while archived', () => {
    const { viewOf, setMode } = mount('- item', false);
    const view = viewOf();
    view.dispatch({ selection: { anchor: view.state.doc.length } });

    setMode(true);
    press(view, 'Enter');
    press(view, 'Tab');
    expect(view.state.doc.toString()).toBe('- item');

    setMode(false);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    press(view, 'Enter');
    expect(view.state.doc.toString()).toBe('- item\n- ');

    press(view, 'Tab');
    expect(view.state.doc.toString()).not.toBe('- item\n- ');
    expect(view.state.doc.toString()).toMatch(/^- item\n\s+- $/);
  });

  it('autocomplete is gone while archived and returns after restore', async () => {
    const { viewOf, setMode } = mount('see #', false);
    const view = viewOf();
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    const { startCompletion } = await import('@codemirror/autocomplete');

    setMode(true);
    startCompletion(view);
    await wait(150);
    expect(completionStatus(view.state)).toBeNull();

    setMode(false);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    startCompletion(view);
    await wait(150);
    expect(completionStatus(view.state)).toBe('active');
  });

  it('an open completion popup is dismissed when the page is archived', async () => {
    const { viewOf, setMode } = mount('see #', false);
    const view = viewOf();
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    const { startCompletion } = await import('@codemirror/autocomplete');
    startCompletion(view);
    await wait(150);
    expect(completionStatus(view.state)).toBe('active');

    setMode(true);

    expect(completionStatus(view.state)).toBeNull();
  });
});

describe('external sync works in both modes', () => {
  it('a change to the stored document is applied while editable, while archived, and after restore', () => {
    const { viewOf, setMode } = mount('one', false);
    const view = viewOf();

    setMode(false, 'two');
    expect(view.state.doc.toString()).toBe('two');

    setMode(true, 'three');
    expect(view.state.doc.toString()).toBe('three');

    setMode(false, 'four');
    expect(view.state.doc.toString()).toBe('four');
  });

  it('the external sync is not a user edit: it adds no undo step', () => {
    const { viewOf, setMode } = mount('one', false);
    const view = viewOf();

    setMode(true, 'synced while archived');

    expect(undoDepth(view.state)).toBe(0);
  });
});

describe('tables', () => {
  it('are interactive when editable, static once archived, and interactive again after restore', () => {
    const { viewOf, setMode } = mount(TABLE, false);
    const view = viewOf();

    clickCell(cellOf(view, 'Vik'));
    expect(view.dom.querySelector('.cm-table-widget .cm-editor')).not.toBeNull();

    // Archiving while a cell is being edited removes the nested editor, and the table is plain static content.
    setMode(true);
    expect(view.dom.querySelector('.cm-table-widget')).not.toBeNull();
    expect(view.dom.querySelector('.cm-table-widget .cm-editor')).toBeNull();
    expect(cellOf(view, 'Vik').textContent).toBe('Vik');
    clickCell(cellOf(view, 'Vik'));
    expect(view.dom.querySelector('.cm-table-widget .cm-editor')).toBeNull();

    setMode(false);
    clickCell(cellOf(view, 'Vik'));
    expect(view.dom.querySelector('.cm-table-widget .cm-editor')).not.toBeNull();
  });
});
