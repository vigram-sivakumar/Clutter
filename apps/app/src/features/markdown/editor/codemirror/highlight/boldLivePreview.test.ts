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

  describe('nested StrongEmphasis (a 4+-star delimiter run, e.g. ****text****)', () => {
    // A 4-star run is valid CommonMark and parses as StrongEmphasis nested
    // inside StrongEmphasis (confirmed via direct tree inspection, not
    // assumed) — realistic input (e.g. a bold shortcut pressed twice on
    // the same selection), not a contrived malformed case.
    it('does not crash mounting the view', () => {
      expect(() => mountView('Text before ****strong**** after')).not.toThrow();
    });

    it('conceals both levels of markers at rest', () => {
      const view = mountView('Text before ****strong**** after');

      expect(view.dom.textContent).toBe('Text before strong after');
      expect(view.dom.textContent).not.toContain('*');
    });

    it('renders the nested content bold', () => {
      const view = mountView('Text before ****strong**** after');

      const bold = view.dom.querySelector('.tok-strong');
      expect(bold).not.toBeNull();
      expect(bold?.textContent).toBe('strong');
    });

    it('an independent, unrelated **bold** elsewhere in the same document still renders after the nested construct', () => {
      const view = mountView('Before ****nested**** middle **plain** after');

      expect(view.dom.textContent).toBe('Before nested middle plain after');
      // The nested construct contributes two overlapping .tok-strong spans
      // (outer's content mark wraps the inner node's own mark) — a genuine
      // consequence of two independently-decorated nesting levels, not a
      // bug. The independent "plain" span is the third, unrelated one and
      // must still be present and correctly scoped to just its own text.
      const boldSpans = Array.from(view.dom.querySelectorAll('.tok-strong'));
      expect(boldSpans).toHaveLength(3);
      expect(boldSpans.some((el) => el.textContent === 'plain')).toBe(true);
      expect(boldSpans.every((el) => el.textContent === 'nested' || el.textContent === 'plain')).toBe(true);
    });

    it('the document text is never mutated by mounting or decorating the nested construct', () => {
      const text = 'Text before ****strong**** after';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);
    });
  });

  describe('engagement-boundary fix: whole-document construct at the real initial cursor position', () => {
    // createEditorView.ts always seeds the initial selection at doc.length
    // ("opening a page should land the cursor at the end of its content").
    // When a StrongEmphasis node's own range coincides with doc.length (or
    // with position 0), isTokenEngaged's boundary-inclusive containment
    // check previously read the caret as "inside" the *full* node range
    // (including the delimiters themselves), permanently engaging the
    // construct and leaving its markers visibly unconcealed until the
    // user clicked elsewhere. Checking the inner content range instead
    // (openMark.to to closeMark.from) fixes this without touching
    // isTokenEngaged itself.
    function mountViewWithSelection(doc: string, anchor: number): EditorView {
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const state = EditorState.create({
        doc,
        selection: { anchor },
        extensions: [markdownLanguageExtension(), boldLivePreview()],
      });
      return new EditorView({ state, parent });
    }

    it('plain **Hey** as the entire document, caret at doc.length: fully conceals', () => {
      const doc = '**Hey**';
      const view = mountViewWithSelection(doc, doc.length);

      expect(view.dom.textContent).toBe('Hey');
      expect(view.dom.textContent).not.toContain('*');
      expect(view.dom.querySelector('.tok-strong')?.textContent).toBe('Hey');
    });

    it('plain **Hey** as the entire document, caret at 0: fully conceals', () => {
      const doc = '**Hey**';
      const view = mountViewWithSelection(doc, 0);

      expect(view.dom.textContent).toBe('Hey');
      expect(view.dom.textContent).not.toContain('*');
    });

    it('nested ****Hey**** as the entire document, caret at doc.length: fully conceals both levels', () => {
      const doc = '****Hey****';
      const view = mountViewWithSelection(doc, doc.length);

      expect(view.dom.textContent).toBe('Hey');
      expect(view.dom.textContent).not.toContain('*');
    });

    it('nested ****Hey**** as the entire document, caret at 0: fully conceals both levels', () => {
      const doc = '****Hey****';
      const view = mountViewWithSelection(doc, 0);

      expect(view.dom.textContent).toBe('Hey');
      expect(view.dom.textContent).not.toContain('*');
    });

    it('still engages when the caret is genuinely inside the content, even at the exact inner-content boundary', () => {
      const doc = '**Hey**';
      // Position right after the opening '**', i.e. the first character of
      // the content — the inner-content range's own inclusive boundary.
      const view = mountViewWithSelection(doc, 2);

      expect(view.dom.textContent).toBe('**Hey**');
    });

    it('placing the caret inside nested content reveals both delimiter levels together (matches the established ***bold italic*** precedent)', () => {
      const doc = 'Before ****Hey**** after';
      const view = mountViewWithSelection(doc, doc.indexOf('Hey') + 1);

      expect(view.dom.textContent).toBe('Before ****Hey**** after');
    });
  });
});
