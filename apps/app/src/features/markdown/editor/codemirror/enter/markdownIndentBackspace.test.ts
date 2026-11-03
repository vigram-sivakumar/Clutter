// @vitest-environment jsdom
import { ensureSyntaxTree, indentUnit } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, keymap, runScopeHandlers } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { editorDefaultKeymap } from '../editorDefaultKeymap';
import { INDENT_UNIT_STRING } from '../indent/markdownIndentContext';
import { markdownLanguageExtension } from '../markdownLanguage';
import { markdownEnterKeymap } from './markdownEnterKeymap';

/**
 * Backspace in the leading whitespace of a paragraph that continues a list item removes one four-space unit, like
 * Backspace on any other indented line. Drives the real keymap chain (`markdownEnterKeymap()` then the default
 * keymap) through a real view, repeatedly, on the same view — no re-focus or re-click between presses. `|` is the
 * caret, `_` a space.
 */
const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

function mount(source: string): EditorView {
  const doc = source.replace(/_/g, ' ');
  const pos = doc.indexOf('|');
  const text = doc.replace('|', '');
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      selection: EditorSelection.cursor(pos),
      extensions: [
        markdownLanguageExtension(),
        indentUnit.of(INDENT_UNIT_STRING),
        markdownEnterKeymap(),
        keymap.of(editorDefaultKeymap),
      ],
    }),
  });
  ensureSyntaxTree(view.state, text.length, 5000);
  views.push(view);
  return view;
}

function backspace(view: EditorView): void {
  runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'Backspace' }), 'editor');
}

function shown(view: EditorView): string {
  const head = view.state.selection.main.head;
  const text = view.state.doc.toString();
  return (text.slice(0, head) + '|' + text.slice(head)).replace(/ /g, '_');
}

describe('Backspace at the start of an indented continuation paragraph', () => {
  it.each([
    ['unordered -', '- item\n\n____|para', '- item\n\n|para'],
    ['unordered +', '+ item\n\n____|para', '+ item\n\n|para'],
    ['unordered *', '* item\n\n____|para', '*_item\n\n|para'.replace('_', ' ')],
    ['numbered', '1. item\n\n____|para', '1._item\n\n|para'.replace('_', ' ')],
    ['task', '- [ ] t\n\n____|para', '-_[_]_t\n\n|para'],
    ['checked task', '- [x] t\n\n____|para', '-_[x]_t\n\n|para'],
    ['directly under the item, no blank line', '- item\n____|para', '-_item\n|para'],
    ['under a nested item', '- a\n____- b\n\n________|para', '-_a\n____-_b\n\n____|para'],
  ])('%s: removes one four-space unit, caret stays before the text', (_name, before, after) => {
    const view = mount(before);

    backspace(view);

    expect(shown(view)).toBe(after.replace(/ /g, '_'));
  });

  it('does not merge the paragraph into the preceding item', () => {
    const view = mount('- item\n\n____|para');

    backspace(view);

    expect(view.state.doc.toString()).toBe('- item\n\npara');
  });

  it('steps down one unit per press across several indentation levels, on the same view', () => {
    const view = mount('- item\n\n____________|para');

    backspace(view);
    expect(shown(view)).toBe('-_item\n\n________|para');
    backspace(view);
    expect(shown(view)).toBe('-_item\n\n____|para');
    backspace(view);
    expect(shown(view)).toBe('-_item\n\n|para');
  });

  it('with no indentation left, the next press is the ordinary one (it joins the previous line)', () => {
    const view = mount('- item\n\n|para');

    backspace(view);

    expect(view.state.doc.toString()).toBe('- item\npara');
  });

  it('deletes one character, leaving the indentation, when the caret is inside the text', () => {
    const view = mount('- item\n\n____pa|ra');

    backspace(view);

    expect(view.state.doc.toString()).toBe('- item\n\n    pra');
    expect(view.state.selection.main.head).toBe('- item\n\n____p'.length);
  });

  it('removes one unit from a plain indented paragraph as before', () => {
    const view = mount('plain\n\n____|para');

    backspace(view);

    expect(view.state.doc.toString()).toBe('plain\n\npara');
  });

  it('removes one unit from a whitespace-only continuation line, caret at its end', () => {
    const view = mount('- item\n\n____|');

    backspace(view);

    expect(shown(view)).toBe('-_item\n\n|');
  });
});

describe('Backspace elsewhere in a list is unchanged', () => {
  it('at content-start of a marker line, removes only the separator', () => {
    const view = mount('- |Text');
    backspace(view);
    expect(view.state.doc.toString()).toBe('-Text');
  });

  it('on an empty item, removes the whole marker', () => {
    const view = mount('- item\n- |');
    backspace(view);
    expect(view.state.doc.toString()).toBe('- item\n');
  });

  it('on an empty numbered or task item, removes the marker', () => {
    const numbered = mount('1. item\n2. |');
    backspace(numbered);
    expect(numbered.state.doc.toString()).toBe('1. item\n');

    const task = mount('- [ ] t\n- [ ] |');
    backspace(task);
    expect(task.state.doc.toString()).toBe('- [ ] t\n');
  });

  it('inside a blockquote prefix, still uses the markup delete', () => {
    const view = mount('> |Quoted');
    backspace(view);
    expect(view.state.doc.toString()).toBe('Quoted');
  });
});
