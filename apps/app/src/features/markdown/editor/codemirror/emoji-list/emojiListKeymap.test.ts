// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { deleteEmojiListMarkerBackward, insertNewlineInEmojiList } from './emojiListKeymap';

function mountView(doc: string, cursorPos: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdownLanguageExtension()],
  });
  return new EditorView({ state, parent });
}

describe('insertNewlineInEmojiList', () => {
  it("repeats the current item's emoji verbatim on Enter", () => {
    const doc = '🍎 Apple';
    const view = mountView(doc, doc.length);

    const handled = insertNewlineInEmojiList(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('🍎 Apple\n🍎 ');
  });

  it('exits the list on Enter in an empty item, stripping the marker', () => {
    const doc = '🍎 ';
    const view = mountView(doc, doc.length);

    const handled = insertNewlineInEmojiList(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('');
  });

  it('preserves nested indentation when repeating the marker', () => {
    const doc = '- Fruits\n  🍎 Apple';
    const view = mountView(doc, doc.length);

    const handled = insertNewlineInEmojiList(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- Fruits\n  🍎 Apple\n  🍎 ');
  });

  it('does nothing outside an emoji list', () => {
    const doc = '- Apple';
    const view = mountView(doc, doc.length);

    const handled = insertNewlineInEmojiList(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('does nothing for a non-empty selection', () => {
    const doc = '🍎 Apple';
    const view = mountView(doc, 0);
    view.dispatch({ selection: { anchor: 0, head: doc.length } });

    const handled = insertNewlineInEmojiList(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });
});

describe('deleteEmojiListMarkerBackward', () => {
  it('deletes the marker and separator when Backspace is pressed right after them', () => {
    const doc = '🍎 Apple';
    const view = mountView(doc, doc.indexOf('Apple'));

    const handled = deleteEmojiListMarkerBackward(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('Apple');
  });

  it('does nothing when the cursor is inside the item text, not right after the marker', () => {
    const doc = '🍎 Apple';
    const view = mountView(doc, doc.length);

    const handled = deleteEmojiListMarkerBackward(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('does nothing outside an emoji list', () => {
    const doc = 'plain paragraph';
    const view = mountView(doc, 3);

    const handled = deleteEmojiListMarkerBackward(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });
});
