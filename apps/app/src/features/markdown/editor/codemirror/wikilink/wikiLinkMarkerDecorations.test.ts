// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { wikiLinkMarkerDecorations } from './wikiLinkMarkerDecorations';

function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), wikiLinkMarkerDecorations()],
  });
  return new EditorView({ state, parent });
}

function markedSpans(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll('.tok-wikilink-mark'));
}

describe('wikiLinkMarkerDecorations', () => {
  it('marks no brackets while the WikiLink is at rest', () => {
    const view = mountView('Text before [[Projects/Page]]');

    expect(markedSpans(view)).toHaveLength(0);
  });

  it('marks exactly the opening and closing brackets once engaged, leaving the path unmarked', () => {
    const text = 'Text before [[Projects/Page]]';
    const view = mountView(text);
    const nodeStart = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeStart + 3 } });

    const spans = markedSpans(view);
    expect(spans).toHaveLength(2);
    expect(spans.map((el) => el.textContent)).toEqual(['[[', ']]']);
    expect(spans[0]?.classList.contains('tok-mark')).toBe(true);
    expect(spans[1]?.classList.contains('tok-mark')).toBe(true);
    expect(view.dom.textContent).toContain('Projects/Page');
  });

  it('marks both brackets for an aliased WikiLink, still excluding the path and alias text', () => {
    const text = 'Text before [[Projects/Page|Alias]]';
    const view = mountView(text);
    const nodeStart = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeStart + 3 } });

    const spans = markedSpans(view);
    expect(spans.map((el) => el.textContent)).toEqual(['[[', ']]']);
  });

  it('removes the bracket marks once the selection leaves the node', () => {
    const view = mountView('Before [[Projects/Page]] after');

    view.dispatch({ selection: { anchor: 10 } }); // inside the node
    expect(markedSpans(view)).toHaveLength(2);

    view.dispatch({ selection: { anchor: 0 } }); // outside the node
    expect(markedSpans(view)).toHaveLength(0);
  });
});
