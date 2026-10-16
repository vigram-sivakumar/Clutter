// @vitest-environment jsdom
import { history, insertNewlineAndIndent, redo, undo } from '@codemirror/commands';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { blockSeparatorDecoration } from '../highlight/blockSeparatorDecoration';
import { SEPARATOR } from '../highlight/separatorScope';
import { markdownLanguageExtension } from '../markdownLanguage';
import { insertSoftLineBreak, markdownEnterCommand } from './markdownEnterKeymap';

/** `|` marks the cursor (or `[`…`]` a selection), as in markdownEnterKeymap.test.ts. */
function mount(source: string): EditorView {
  const open = source.indexOf('[');
  const close = source.indexOf(']');
  const text =
    open >= 0 ? source.replace('[', '').replace(']', '') : source.replace('|', '');
  const selection =
    open >= 0
      ? EditorSelection.range(open, close - 1)
      : EditorSelection.cursor(source.indexOf('|'));
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc: text,
      selection,
      extensions: [markdownLanguageExtension(), blockSeparatorDecoration(), history(), EditorState.allowMultipleSelections.of(true)],
    }),
    parent,
  });
  ensureSyntaxTree(view.state, view.state.doc.length, 5000);
  return view;
}

const shown = (view: EditorView) => {
  const pos = view.state.selection.main.head;
  const text = view.state.doc.toString();
  return text.slice(0, pos) + '|' + text.slice(pos);
};
const shiftEnter = (view: EditorView) => {
  insertSoftLineBreak(view);
  ensureSyntaxTree(view.state, view.state.doc.length, 5000);
};
const enter = (view: EditorView) => {
  markdownEnterCommand(view) || insertNewlineAndIndent(view);
};
// A zero-height separator is not rendered at all, so "no gap" is an empty list.
const heights = (view: EditorView) =>
  Array.from(view.dom.querySelectorAll('.cm-block-separator')).map((el) =>
    parseInt((el as HTMLElement).style.height, 10)
  );

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Shift+Enter inserts a backslash hard break inside the block', () => {
  it('at the end of a line: break, cursor on the next line', () => {
    const view = mount('Hello|');
    shiftEnter(view);
    expect(shown(view)).toBe('Hello\\\n|');
  });

  it('in the middle: the rest of the line moves down, still one paragraph', () => {
    const view = mount('Hel|lo');
    shiftEnter(view);
    expect(shown(view)).toBe('Hel\\\n|lo');
    expect(heights(view)).toEqual([]);
  });

  it('at the beginning of a line', () => {
    const view = mount('|Hello');
    shiftEnter(view);
    expect(shown(view)).toBe('\\\n|Hello');
  });

  it('replaces a selection', () => {
    const view = mount('Hel[lo wor]ld');
    shiftEnter(view);
    expect(shown(view)).toBe('Hel\\\n|ld');
  });

  it('does not stack a backslash onto an unescaped one already before the cursor', () => {
    const view = mount('Hello\\|');
    shiftEnter(view);
    expect(shown(view)).toBe('Hello\\\n|');
  });

  it('continues later lines of the same paragraph', () => {
    const view = mount('One\\\ntwo|');
    shiftEnter(view);
    expect(shown(view)).toBe('One\\\ntwo\\\n|');
  });
});

describe('Shift+Enter keeps the structure it is in', () => {
  it('a bullet item: the new line is indented under the item text, not a new item', () => {
    const view = mount('- item|');
    shiftEnter(view);
    expect(shown(view)).toBe('- item\\\n  |');
    view.dispatch({ changes: { from: view.state.doc.length, insert: 'more' } });
    ensureSyntaxTree(view.state, view.state.doc.length, 5000);
    expect(view.state.doc.toString()).toBe('- item\\\n  more');
    expect(heights(view)).toEqual([]);
  });

  it('an ordered item aligns with its marker width', () => {
    const view = mount('10. item|');
    shiftEnter(view);
    expect(shown(view)).toBe('10. item\\\n    |');
  });

  it('a nested item keeps its own indentation', () => {
    const view = mount('- a\n  - b|');
    shiftEnter(view);
    expect(shown(view)).toBe('- a\n  - b\\\n    |');
  });

  it('a blockquote repeats its marker', () => {
    const view = mount('> quote|');
    shiftEnter(view);
    expect(shown(view)).toBe('> quote\\\n> |');
  });

  it('a nested blockquote repeats all of its markers', () => {
    const view = mount('>> quote|');
    shiftEnter(view);
    expect(shown(view)).toBe('>> quote\\\n>> |');
  });

  it('a list item inside a quote', () => {
    const view = mount('> - item|');
    shiftEnter(view);
    expect(shown(view)).toBe('> - item\\\n>   |');
  });
});

describe('Shift+Enter where a hard break cannot live behaves exactly like Enter', () => {
  it.each([
    ['a heading', '# Title|'],
    ['fenced code', '```\ncode|\n```'],
    ['inline code', 'a `co|de` b'],
    ['a table', '| a | b |\n| - | - |\n| 1 | 2|'],
    ['an empty list item', '- |'],
  ])('%s', (_label, source) => {
    const soft = mount(source);
    const plain = mount(source);

    shiftEnter(soft);
    enter(plain);

    expect(soft.state.doc.toString()).toBe(plain.state.doc.toString());
    expect(soft.state.selection.main.head).toBe(plain.state.selection.main.head);
  });
});

describe('Enter itself is unchanged, and spacing differs only across the hard break', () => {
  it('Enter still starts a new block with normal spacing', () => {
    const view = mount('Hello|');
    enter(view);
    expect(view.state.doc.toString()).toBe('Hello\n');
    expect(heights(view)).toEqual([SEPARATOR.normal]);
  });

  it('a plain two-line paragraph (no hard break) keeps its normal gap', () => {
    expect(heights(mount('one\ntwo|'))).toEqual([SEPARATOR.normal]);
  });

  it('two-space hard breaks also join with no gap', () => {
    expect(heights(mount('one  \ntwo|'))).toEqual([]);
  });

  it('a break inside a quote has no gap', () => {
    expect(heights(mount('> one\\\n> two|'))).toEqual([]);
  });

  it('a trailing backslash at the end of a block is just text: normal gaps stay', () => {
    expect(heights(mount('one\\\n\ntwo|'))).toEqual([SEPARATOR.normal, SEPARATOR.normal]);
  });

  it('a heading line before text keeps its own spacing', () => {
    expect(heights(mount('# H\\\nx|'))).toEqual([SEPARATOR.normal]);
  });
});

describe('undo, redo, selection and IME', () => {
  it('is one undoable step, restoring the document and the redo', () => {
    const view = mount('Hel|lo');
    shiftEnter(view);

    undo(view);
    expect(view.state.doc.toString()).toBe('Hello');
    redo(view);
    expect(view.state.doc.toString()).toBe('Hel\\\nlo');
  });

  it('does nothing while an IME composition is active', () => {
    const view = mount('Hello|');
    Object.defineProperty(view, 'composing', { value: true });

    expect(insertSoftLineBreak(view)).toBe(false);
    expect(view.state.doc.toString()).toBe('Hello');
  });

  it('several cursors fall back to Enter rather than breaking only one', () => {
    const view = mount('|a\nb');
    view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(3)]) });

    shiftEnter(view);
    const plain = mount('|a\nb');
    plain.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(3)]) });
    enter(plain);

    expect(view.state.doc.toString()).not.toContain('\\');
    expect(view.state.doc.toString()).toBe(plain.state.doc.toString());
  });
});
