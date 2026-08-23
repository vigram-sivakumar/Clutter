// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { boldLivePreview } from './boldLivePreview';

/**
 * Mirrors emphasisMarkerDecoration.test.ts's style: mount a real EditorView
 * in jsdom and inspect rendered DOM/state rather than asserting on the
 * decoration set directly.
 */
function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), boldLivePreview()],
  });
  return new EditorView({ state, parent });
}

describe('boldLivePreview', () => {
  it('at rest, the ** markers have no DOM presence at all — not merely hidden', () => {
    const view = mountView('Text before **hello** after');

    expect(view.dom.textContent).toBe('Text before hello after');
    expect(view.dom.textContent).not.toContain('*');
  });

  it('renders the content bold at rest', () => {
    // Selection defaults to position 0, so surrounding text keeps the
    // caret from sitting exactly at the construct's own start boundary
    // (which isTokenEngaged treats as engaged).
    const view = mountView('Text before **hello** after');

    const bold = view.dom.querySelector('.tok-strong');
    expect(bold).not.toBeNull();
    expect(bold?.textContent).toBe('hello');
  });

  it('reveals the raw **…** text once the selection is inside it', () => {
    const text = 'Text before **hello** after';
    const view = mountView(text);
    const nodeStart = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeStart + 3 } });

    expect(view.dom.textContent).toContain('**hello**');
    expect(view.dom.querySelector('.tok-strong')).toBeNull();
  });

  it('re-collapses the markers once the selection leaves the node', () => {
    const view = mountView('Before **hello** after');

    view.dispatch({ selection: { anchor: 10 } }); // inside the node
    expect(view.dom.textContent).toContain('**hello**');

    view.dispatch({ selection: { anchor: 0 } }); // outside the node
    expect(view.dom.textContent).not.toContain('*');
    expect(view.dom.textContent).toContain('hello');
    expect(view.dom.querySelector('.tok-strong')).not.toBeNull();
  });

  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as markers collapse/reveal', () => {
      const text = 'Text before **hello** after';
      const view = mountView(text);
      const nodeStart = 'Text before '.length;

      expect(view.state.doc.toString()).toBe(text);

      view.dispatch({ selection: { anchor: nodeStart + 3 } }); // engage
      expect(view.state.doc.toString()).toBe(text);

      view.dispatch({ selection: { anchor: 0 } }); // disengage
      expect(view.state.doc.toString()).toBe(text);
    });

    it('a selection placed at a document offset inside an at-rest collapsed range is not atomic — it lands exactly there, unmoved', () => {
      const text = 'Text before **hello** after';
      const view = mountView(text);

      // 'Text before ' = 12 chars, opening '**' occupies [12, 14).
      view.dispatch({ selection: { anchor: 13 } });

      expect(view.state.selection.main.head).toBe(13);
      expect(view.state.selection.main.anchor).toBe(13);
    });

    it('does not affect plain text with no bold', () => {
      const view = mountView('Just plain text, nothing to hide.');

      expect(view.dom.textContent).toBe('Just plain text, nothing to hide.');
    });

    it('does not decorate ordinary single-* emphasis', () => {
      const view = mountView('Text with *italic* only');

      expect(view.dom.textContent).toContain('*italic*');
      expect(view.dom.querySelector('.tok-strong')).toBeNull();
    });
  });
});
