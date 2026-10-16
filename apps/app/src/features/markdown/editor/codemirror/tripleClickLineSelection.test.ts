// @vitest-environment jsdom

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { lineContentRange, tripleClickLineSelection } from './tripleClickLineSelection';

const DOC = '1. Start\n   1. Pick a place\n   2. Somewhere quiet\n\nPlain paragraph';

let view: EditorView | undefined;
afterEach(() => {
  view?.destroy();
  view = undefined;
});

/** A real view over DOC, with the point under the pointer stubbed (jsdom has no layout to hit-test). */
function setup(posUnderPointer: () => number) {
  view = new EditorView({ state: EditorState.create({ doc: DOC, extensions: [tripleClickLineSelection()] }), parent: document.body });
  const v = view;
  v.posAndSideAtCoords = () => ({ pos: posUnderPointer(), assoc: 1 as const });
  const handlers = v.state.facet(EditorView.mouseSelectionStyle);
  const styleFor = (init: Partial<MouseEventInit> & { detail?: number }) => {
    const event = new MouseEvent('mousedown', { button: 0, detail: 3, ...init });
    for (const make of handlers) {
      const style = make(v, event);
      if (style) return style;
    }
    return null;
  };
  return { v, styleFor };
}

describe('lineContentRange', () => {
  it('is the line\'s text, never including its line break', () => {
    const state = EditorState.create({ doc: DOC });
    expect(lineContentRange(state, 3)).toEqual({ from: 0, to: 8 });
    expect(state.sliceDoc(0, 8)).toBe('1. Start');
    expect(lineContentRange(state, DOC.length)).toEqual({ from: DOC.indexOf('Plain'), to: DOC.length });
  });
});

describe('triple-click selects the line\'s text', () => {
  it('selects exactly the clicked list item, leaving the caret/head at the end of its own line', () => {
    const { v, styleFor } = setup(() => 3);
    const sel = styleFor({})!.get(new MouseEvent('mouseup'), false, false);

    expect(sel.main.from).toBe(0);
    expect(sel.main.to).toBe(8);
    // Not the start of the next line, which is where CM6's native range puts it.
    expect(v.state.doc.lineAt(sel.main.to).number).toBe(1);
  });

  it('typing after it replaces the item\'s text and keeps the line break and the next line', () => {
    const { v, styleFor } = setup(() => 3);
    v.dispatch({ selection: styleFor({})!.get(new MouseEvent('mouseup'), false, false) });

    v.dispatch(v.state.replaceSelection('X'));

    expect(v.state.doc.toString()).toBe('X\n   1. Pick a place\n   2. Somewhere quiet\n\nPlain paragraph');
  });

  it('works for a nested item and an ordinary paragraph, including the last line', () => {
    let pos = DOC.indexOf('Pick');
    const { v, styleFor } = setup(() => pos);
    const nested = styleFor({})!.get(new MouseEvent('mouseup'), false, false);
    expect(v.state.sliceDoc(nested.main.from, nested.main.to)).toBe('   1. Pick a place');

    pos = DOC.indexOf('Plain');
    const paragraph = styleFor({})!.get(new MouseEvent('mouseup'), false, false);
    expect(v.state.sliceDoc(paragraph.main.from, paragraph.main.to)).toBe('Plain paragraph');
  });

  it('dragging after a triple-click extends by whole lines', () => {
    let pos = 3;
    const { styleFor } = setup(() => pos);
    const style = styleFor({})!;

    pos = DOC.indexOf('quiet');
    const sel = style.get(new MouseEvent('mousemove'), false, false);

    expect(sel.main.from).toBe(0);
    expect(sel.main.to).toBe(DOC.indexOf('\n\nPlain'));
  });
});

describe('everything else is left to CodeMirror\'s own handling', () => {
  it.each([
    ['single click', { detail: 1 }],
    ['double click', { detail: 2 }],
    ['shift triple-click', { shiftKey: true }],
    ['cmd triple-click', { metaKey: true }],
    ['ctrl triple-click', { ctrlKey: true }],
    ['right button', { button: 2 }],
  ])('%s returns no style', (_name, init) => {
    const { styleFor } = setup(() => 3);
    expect(styleFor(init)).toBeNull();
  });
});
