// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { markdownHighlighting } from './markdownHighlightStyle';
import { emphasisMarkerDecoration } from './emphasisMarkerDecoration';

/**
 * Mirrors wikiLinkMarkerDecorations.test.ts's style: mount a real
 * EditorView in jsdom and inspect rendered spans, rather than asserting
 * on the decoration set directly.
 */
function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), markdownHighlighting(), emphasisMarkerDecoration()],
  });
  return new EditorView({ state, parent });
}

function hiddenMarkSpans(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll('.tok-mark-hidden'));
}

describe('emphasisMarkerDecoration', () => {
  it('hides the * markers while *italic* is at rest', () => {
    const view = mountView('Text before *italic* after');

    const hidden = hiddenMarkSpans(view);
    expect(hidden).toHaveLength(2);
    expect(hidden.map((el) => el.textContent)).toEqual(['*', '*']);
    expect(view.dom.textContent).toContain('*italic*');
  });

  it('reveals the * markers once the cursor is inside *italic*', () => {
    const text = 'Text before *italic* after';
    const view = mountView(text);
    const nodeStart = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeStart + 3 } });

    expect(hiddenMarkSpans(view)).toHaveLength(0);
  });

  it('re-hides the markers once the selection leaves the node', () => {
    const view = mountView('Before *italic* after');

    view.dispatch({ selection: { anchor: 10 } }); // inside the node
    expect(hiddenMarkSpans(view)).toHaveLength(0);

    view.dispatch({ selection: { anchor: 0 } }); // outside the node
    expect(hiddenMarkSpans(view)).toHaveLength(2);
  });

  it('hides the __ markers while __bold__ is at rest, and reveals them when engaged', () => {
    const text = 'Text before __bold__ after';
    const view = mountView(text);

    expect(hiddenMarkSpans(view).map((el) => el.textContent)).toEqual(['__', '__']);

    const nodeStart = 'Text before '.length;
    view.dispatch({ selection: { anchor: nodeStart + 3 } });
    expect(hiddenMarkSpans(view)).toHaveLength(0);
  });

  it('***bold italic***: engaging the inner text reveals both delimiter pairs', () => {
    const text = 'Text before ***bi*** after';
    const view = mountView(text);
    const nodeStart = 'Text before '.length;

    expect(hiddenMarkSpans(view)).toHaveLength(4); // outer * pair + inner ** pair

    view.dispatch({ selection: { anchor: nodeStart + 4 } }); // inside "bi"
    expect(hiddenMarkSpans(view)).toHaveLength(0);
  });

  it('does not affect plain text with no emphasis', () => {
    const view = mountView('Just plain text, nothing to hide.');

    expect(hiddenMarkSpans(view)).toHaveLength(0);
  });
});
