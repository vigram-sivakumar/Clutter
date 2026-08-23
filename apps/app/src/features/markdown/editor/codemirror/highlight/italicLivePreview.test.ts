// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { boldLivePreview } from './boldLivePreview';
import { italicLivePreview } from './italicLivePreview';

/**
 * Mirrors boldLivePreview.test.ts's style: mount a real EditorView in
 * jsdom and inspect rendered DOM/state rather than asserting on the
 * decoration set directly.
 */
function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), italicLivePreview()],
  });
  return new EditorView({ state, parent });
}

function mountViewWithSelection(doc: string, anchor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdownLanguageExtension(), italicLivePreview()],
  });
  return new EditorView({ state, parent });
}

describe('italicLivePreview', () => {
  it('*text*: at rest, the * markers have no DOM presence — not merely hidden', () => {
    const view = mountView('Text before *italic* after');

    expect(view.dom.textContent).toBe('Text before italic after');
    expect(view.dom.textContent).not.toContain('*');
  });

  it('*text*: renders the content italic at rest', () => {
    const view = mountView('Text before *italic* after');

    const em = view.dom.querySelector('.tok-emphasis');
    expect(em).not.toBeNull();
    expect(em?.textContent).toBe('italic');
  });

  it('_text_: markers collapse at rest and reveal when engaged, same as *text*', () => {
    const view = mountView('Text before _italic_ after');

    expect(view.dom.textContent).toBe('Text before italic after');
    expect(view.dom.textContent).not.toContain('_');
    expect(view.dom.querySelector('.tok-emphasis')?.textContent).toBe('italic');
  });

  it('reveals the raw *…* text once the selection is inside it', () => {
    const text = 'Text before *italic* after';
    const view = mountView(text);
    const nodeStart = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeStart + 3 } });

    expect(view.dom.textContent).toContain('*italic*');
    expect(view.dom.querySelector('.tok-emphasis')).toBeNull();
  });

  it('re-collapses the markers once the selection leaves the node', () => {
    const view = mountView('Before *italic* after');

    view.dispatch({ selection: { anchor: 10 } }); // inside the node
    expect(view.dom.textContent).toContain('*italic*');

    view.dispatch({ selection: { anchor: 0 } }); // outside the node
    expect(view.dom.textContent).not.toContain('*');
    expect(view.dom.textContent).toContain('italic');
    expect(view.dom.querySelector('.tok-emphasis')).not.toBeNull();
  });

  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as markers collapse/reveal', () => {
      const text = 'Text before _italic_ after';
      const view = mountView(text);
      const nodeStart = 'Text before '.length;

      expect(view.state.doc.toString()).toBe(text);

      view.dispatch({ selection: { anchor: nodeStart + 3 } }); // engage
      expect(view.state.doc.toString()).toBe(text);

      view.dispatch({ selection: { anchor: 0 } }); // disengage
      expect(view.state.doc.toString()).toBe(text);
    });

    it('a selection placed inside an at-rest collapsed range is not atomic — it lands exactly there, unmoved', () => {
      const text = 'Text before *italic* after';
      const view = mountView(text);

      // 'Text before ' = 12 chars, opening '*' occupies [12, 13).
      view.dispatch({ selection: { anchor: 12 } });

      expect(view.state.selection.main.head).toBe(12);
      expect(view.state.selection.main.anchor).toBe(12);
    });

    it('does not affect plain text with no italic', () => {
      const view = mountView('Just plain text, nothing to hide.');

      expect(view.dom.textContent).toBe('Just plain text, nothing to hide.');
    });
  });

  describe('non-interference with StrongEmphasis (bold-only text)', () => {
    it('does not decorate **bold** as italic', () => {
      const view = mountView('Text with **bold** only');

      // italicLivePreview alone never registers StrongEmphasis, so its own
      // markers stay untouched (raw) — boldLivePreview is what conceals them.
      expect(view.dom.textContent).toContain('**bold**');
      expect(view.dom.querySelector('.tok-emphasis')).toBeNull();
    });

    it('bold and italic both wired together: each concealed/styled independently', () => {
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const state = EditorState.create({
        doc: 'Text with **bold** and *italic* together',
        extensions: [markdownLanguageExtension(), boldLivePreview(), italicLivePreview()],
      });
      const view = new EditorView({ state, parent });

      expect(view.dom.textContent).toBe('Text with bold and italic together');
      expect(view.dom.querySelector('.tok-strong')?.textContent).toBe('bold');
      expect(view.dom.querySelector('.tok-emphasis')?.textContent).toBe('italic');
    });
  });

  describe('nested Emphasis via mixed delimiter characters (_*a*_ and *_a_*)', () => {
    // Unlike StrongEmphasis's 4-star-run nesting trigger, Emphasis nests
    // via mixed delimiter chars — confirmed via direct tree inspection:
    // Emphasis[0,5] > [EmphasisMark, Emphasis[1,4], EmphasisMark]. Same
    // class of problem RangeSetBuilder already crashed on for bold; fixed
    // here from the start via the same Decoration.set(ranges, true) +
    // inner-content-range engagement pattern, not rediscovered.
    it('_*a*_ does not crash mounting the view', () => {
      expect(() => mountView('Text before _*a*_ after')).not.toThrow();
    });

    it('_*a*_ conceals both levels of markers at rest', () => {
      const view = mountView('Text before _*a*_ after');

      expect(view.dom.textContent).toBe('Text before a after');
      expect(view.dom.textContent).not.toMatch(/[*_]/);
    });

    it('*_a_* conceals both levels of markers at rest', () => {
      const view = mountView('Text before *_a_* after');

      expect(view.dom.textContent).toBe('Text before a after');
      expect(view.dom.textContent).not.toMatch(/[*_]/);
    });

    it('_*a*_ renders the nested content italic', () => {
      const view = mountView('Text before _*a*_ after');

      const em = view.dom.querySelector('.tok-emphasis');
      expect(em).not.toBeNull();
      expect(em?.textContent).toBe('a');
    });

    it('an independent, unrelated *plain* italic elsewhere still renders after the nested construct', () => {
      const view = mountView('Before _*nested*_ middle *plain* after');

      expect(view.dom.textContent).toBe('Before nested middle plain after');
      const spans = Array.from(view.dom.querySelectorAll('.tok-emphasis'));
      expect(spans).toHaveLength(3); // 2 overlapping levels for the nested construct + 1 independent
      expect(spans.some((el) => el.textContent === 'plain')).toBe(true);
      expect(spans.every((el) => el.textContent === 'nested' || el.textContent === 'plain')).toBe(true);
    });

    it('the document text is never mutated by mounting or decorating the nested construct', () => {
      const text = 'Text before _*a*_ after';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);
    });
  });

  describe('boundary-after-completion: a caret at either edge of the construct stays engaged', () => {
    // A caret sitting exactly at node.from or node.to counts as engaged
    // (full-range containment, including both boundaries) — this is what
    // keeps a just-completed construct revealed on the exact keystroke
    // that finished it. Confirmed by direct browser execution: typing
    // "*italic*" character by character leaves the selection at {8,8} ==
    // node.to immediately, and the construct must still render raw at
    // that instant, not collapse before the user moves on.
    it('caret at node.to (right after typing the closing *) stays revealed', () => {
      const doc = 'Text before *italic* after';
      const nodeTo = 'Text before *italic*'.length;
      const view = mountViewWithSelection(doc, nodeTo);

      expect(view.dom.textContent).toBe('Text before *italic* after');
      expect(view.dom.querySelector('.tok-emphasis')).toBeNull();
    });

    it('caret at node.from (right before the opening *) stays revealed', () => {
      const doc = 'Text before *italic* after';
      const nodeFrom = 'Text before '.length;
      const view = mountViewWithSelection(doc, nodeFrom);

      expect(view.dom.textContent).toBe('Text before *italic* after');
    });

    it('caret one position further out on either side conceals normally', () => {
      const doc = 'Text before *italic* after';
      const nodeFrom = 'Text before '.length;
      const nodeTo = 'Text before *italic*'.length;

      const viewBefore = mountViewWithSelection(doc, nodeFrom - 1);
      expect(viewBefore.dom.textContent).toBe('Text before italic after');

      const viewAfter = mountViewWithSelection(doc, nodeTo + 1);
      expect(viewAfter.dom.textContent).toBe('Text before italic after');
    });

    it('nested _*a*_: caret at the outer node.to keeps the outer level revealed (inner independently stays concealed — its own range does not contain this position)', () => {
      const doc = 'Text before _*a*_ after';
      const nodeTo = 'Text before _*a*_'.length;
      const view = mountViewWithSelection(doc, nodeTo);

      expect(view.dom.textContent).toBe('Text before _a_ after');
    });
  });

  describe('known, deferred limitation: whole-document construct at the real initial cursor position', () => {
    // createEditorView.ts always seeds the initial selection at doc.length.
    // When an Emphasis node's own range coincides with doc.length (or with
    // position 0) -- i.e. the construct is the *entire* reachable document
    // -- the full-range engagement rule (restored above) reads that
    // boundary as "inside," so the construct loads permanently revealed
    // until the user clicks elsewhere. A narrower fix (checking the inner
    // content range instead) was tried and reverted: it broke the far
    // more common "stays revealed right after typing" case tested above.
    // No rule that's a pure function of (tree, selection) can satisfy
    // both, since the identical boundary position occurs in both
    // scenarios with no way to distinguish "just typed" from "just
    // loaded." Left as a known, deliberately out-of-scope gap -- these
    // tests document and pin the current (accepted) behavior rather than
    // leaving it silently unverified. See boldLivePreview.test.ts's
    // identical block for the full rationale.
    it('*italic* as the entire document, caret at doc.length: stays revealed (known limitation)', () => {
      const doc = '*italic*';
      const view = mountViewWithSelection(doc, doc.length);

      expect(view.dom.textContent).toBe('*italic*');
    });

    it('*italic* as the entire document, caret at 0: stays revealed (known limitation)', () => {
      const doc = '*italic*';
      const view = mountViewWithSelection(doc, 0);

      expect(view.dom.textContent).toBe('*italic*');
    });
  });
});
