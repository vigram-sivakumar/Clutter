// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { emphasisMarkerDecoration } from './emphasisMarkerDecoration';
import { markdownHighlighting } from './markdownHighlightStyle';

/**
 * Mirrors wikiLinkMarkerDecorations.test.ts's style: mount a real
 * EditorView in jsdom and inspect rendered DOM/state, rather than
 * asserting on the decoration set directly.
 *
 * jsdom has no real layout engine, so it cannot reproduce the actual
 * click-hit-testing bug this decoration was rewritten to fix (that was
 * confirmed separately, by mounting the same production code in a real
 * browser — see the emphasisMarkerDecoration.ts/liveMarkDecoration.ts doc
 * comments). What these tests lock in instead is the invariant the fix
 * depends on: an unengaged marker has no DOM presence at all (not merely
 * a styled-invisible one), the underlying document text and positions
 * never change no matter which state the decoration is in, and ordinary
 * (non-atomic) selection placement inside a collapsed range still works
 * exactly as CM6's own position mapping says it should.
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

describe('emphasisMarkerDecoration', () => {
  it('at rest, the * markers have no DOM presence at all — not merely hidden', () => {
    const view = mountView('Text before *italic* after');

    // Decoration.replace({}) removes the range from the render tree
    // entirely, so the rendered text omits the markers outright.
    expect(view.dom.textContent).toContain('Text before italic after');
    expect(view.dom.textContent).not.toContain('*');
  });

  it('reveals the raw *…* text once the cursor is inside it', () => {
    const text = 'Text before *italic* after';
    const view = mountView(text);
    const nodeStart = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeStart + 3 } });

    expect(view.dom.textContent).toContain('*italic*');
  });

  it('re-collapses the markers once the selection leaves the node', () => {
    const view = mountView('Before *italic* after');

    view.dispatch({ selection: { anchor: 10 } }); // inside the node
    expect(view.dom.textContent).toContain('*italic*');

    view.dispatch({ selection: { anchor: 0 } }); // outside the node
    expect(view.dom.textContent).not.toContain('*');
    expect(view.dom.textContent).toContain('italic');
  });

  it('_italic_: markers collapse at rest and reveal when engaged, same as *italic*', () => {
    const text = 'Text before _italic_ after';
    const view = mountView(text);

    expect(view.dom.textContent).not.toContain('_');

    const nodeStart = 'Text before '.length;
    view.dispatch({ selection: { anchor: nodeStart + 3 } });
    expect(view.dom.textContent).toContain('_italic_');
  });

  it('__bold__: markers collapse at rest and reveal when engaged, same as *italic*', () => {
    const text = 'Text before __bold__ after';
    const view = mountView(text);

    expect(view.dom.textContent).not.toContain('_');

    const nodeStart = 'Text before '.length;
    view.dispatch({ selection: { anchor: nodeStart + 3 } });
    expect(view.dom.textContent).toContain('__bold__');
  });

  it('***bold italic***: engaging the inner text reveals both delimiter pairs', () => {
    const text = 'Text before ***bi*** after';
    const view = mountView(text);
    const nodeStart = 'Text before '.length;

    expect(view.dom.textContent).not.toContain('*');

    view.dispatch({ selection: { anchor: nodeStart + 4 } }); // inside "bi"
    expect(view.dom.textContent).toContain('***bi***');
  });

  it('___bold italic___: same composition as ***bold italic*** with underscores', () => {
    const text = 'Text before ___bi___ after';
    const view = mountView(text);
    const nodeStart = 'Text before '.length;

    expect(view.dom.textContent).not.toContain('_');

    view.dispatch({ selection: { anchor: nodeStart + 4 } }); // inside "bi"
    expect(view.dom.textContent).toContain('___bi___');
  });

  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as markers collapse/reveal', () => {
      const text = 'Text before __bold__ after';
      const view = mountView(text);
      const nodeStart = 'Text before '.length;

      expect(view.state.doc.toString()).toBe(text);

      view.dispatch({ selection: { anchor: nodeStart + 3 } }); // engage
      expect(view.state.doc.toString()).toBe(text);

      view.dispatch({ selection: { anchor: 0 } }); // disengage
      expect(view.state.doc.toString()).toBe(text);
    });

    it('a selection placed at a document offset inside an at-rest collapsed range is not atomic — it lands exactly there, unmoved', () => {
      // 'Text before ' = 12 chars, opening '__' occupies [12, 14). No
      // EditorView.atomicRanges is registered for this decoration
      // (deliberately — see liveMarkDecoration.ts's doc comment on why
      // atomic behavior is reserved for at-rest semantic tokens, never
      // ordinary Live-Preview marks), so setting the selection strictly
      // between the two underscores must be honored exactly, not snapped
      // to either boundary.
      const text = 'Text before __bold__ after';
      const view = mountView(text);

      view.dispatch({ selection: { anchor: 13 } });

      expect(view.state.selection.main.head).toBe(13);
      expect(view.state.selection.main.anchor).toBe(13);
    });

    it('does not affect plain text with no emphasis', () => {
      const view = mountView('Just plain text, nothing to hide.');

      expect(view.dom.textContent).toBe('Just plain text, nothing to hide.');
    });
  });
});
