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

  it('marks exactly the opening and closing brackets once engaged, and conceals the folder prefix, leaving only the filename', () => {
    const text = 'Text before [[Projects/Page]]';
    const view = mountView(text);
    const nodeStart = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeStart + 3 } });

    const spans = markedSpans(view);
    expect(spans).toHaveLength(2);
    expect(spans.map((el) => el.textContent)).toEqual(['[[', ']]']);
    expect(spans[0]?.classList.contains('tok-mark')).toBe(true);
    expect(spans[1]?.classList.contains('tok-mark')).toBe(true);
    // The canonical path must never be shown while editing — only the
    // filename, per docs/editor-architecture-decisions.md.
    expect(view.dom.textContent).not.toContain('Projects/Page');
    expect(view.dom.textContent).toContain('Page');
    expect(view.dom.textContent).not.toContain('Projects');
  });

  it('marks both brackets for an aliased WikiLink, conceals the folder prefix, leaves the filename and alias visible', () => {
    const text = 'Text before [[Projects/Page|Alias]]';
    const view = mountView(text);
    const nodeStart = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeStart + 3 } });

    const spans = markedSpans(view);
    expect(spans.map((el) => el.textContent)).toEqual(['[[', ']]']);
    expect(view.dom.textContent).not.toContain('Projects');
    expect(view.dom.textContent).toContain('Page');
    expect(view.dom.textContent).toContain('Alias');
  });

  it('removes the bracket marks once the selection leaves the node', () => {
    const view = mountView('Before [[Projects/Page]] after');

    view.dispatch({ selection: { anchor: 10 } }); // inside the node
    expect(markedSpans(view)).toHaveLength(2);

    view.dispatch({ selection: { anchor: 0 } }); // outside the node
    expect(markedSpans(view)).toHaveLength(0);
  });

  describe('folder-prefix concealment', () => {
    it('does not conceal anything for a reference with no folder component', () => {
      const view = mountView('Text before [[Page]]');
      view.dispatch({ selection: { anchor: 'Text before '.length + 3 } });

      expect(view.dom.textContent).toContain('[[Page]]');
    });

    it('conceals only up to the LAST slash for a nested path, leaving just the filename', () => {
      const view = mountView('[[Projects/Project A/Note]]');
      view.dispatch({ selection: { anchor: 3 } });

      expect(view.dom.textContent).not.toContain('Projects');
      expect(view.dom.textContent).not.toContain('Project A');
      expect(view.dom.textContent).toContain('Note');
    });

    it('does not treat an escaped slash as a folder separator', () => {
      // "A\/B" is a literal "A/B" filename, not a folder "A" + file "B" —
      // nothing should be concealed. Engaged text is raw (undecoded)
      // markdown, same as every other engaged construct, so the literal
      // backslash is still visible here — concealment is the only new
      // behavior under test, not escape-decoding.
      const view = mountView('[[A\\/B]]');
      view.dispatch({ selection: { anchor: 3 } });

      expect(view.dom.textContent).toContain('A\\/B');
    });

    it('re-reveals the full remaining text the instant the delimiting slash is deleted', () => {
      const view = mountView('[[Projects/Note]]');
      view.dispatch({ selection: { anchor: 11 } }); // right after "Projects/"

      expect(view.dom.textContent).not.toContain('Projects');

      view.dispatch({ changes: { from: 10, to: 11, insert: '' } }); // delete the "/"

      expect(view.dom.textContent).toContain('Projects');
      expect(view.dom.textContent).toContain('Note');
    });
  });
});
