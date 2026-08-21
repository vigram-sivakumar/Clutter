// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { emojiListMarkDecoration } from './emojiListMarkDecoration';

function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), emojiListMarkDecoration()],
  });
  return new EditorView({ state, parent });
}

function markedSpans(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll('.cm-emoji-list-marker'));
}

describe('emojiListMarkDecoration', () => {
  it('wraps the emoji marker in cm-emoji-list-marker without hiding or replacing it', () => {
    const view = mountView('🍎 Apple');

    const spans = markedSpans(view);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.textContent).toBe('🍎');
    expect(view.dom.textContent).toBe('🍎 Apple');
  });

  it('also carries the shared cm-list-marker class alongside cm-emoji-list-marker', () => {
    const view = mountView('🍎 Apple');

    const span = markedSpans(view)[0];
    expect(span?.classList.contains('cm-list-marker')).toBe(true);
    expect(span?.classList.contains('cm-emoji-list-marker')).toBe(true);
  });

  it('marks a class for every item in a multi-emoji list', () => {
    const view = mountView('🍎 Apple\n🍊 Orange');

    const spans = markedSpans(view);
    expect(spans.map((el) => el.textContent)).toEqual(['🍎', '🍊']);
  });

  it('does not mark a native bullet marker', () => {
    const view = mountView('- Apple');

    expect(markedSpans(view)).toHaveLength(0);
  });
});
