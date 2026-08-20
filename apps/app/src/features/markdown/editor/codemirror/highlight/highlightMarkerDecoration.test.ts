// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { emphasisMarkerDecoration } from './emphasisMarkerDecoration';
import { highlightMarkerDecoration } from './highlightMarkerDecoration';
import { markdownHighlighting } from './markdownHighlightStyle';
import { strikethroughMarkerDecoration } from './strikethroughMarkerDecoration';

/** Mirrors strikethroughMarkerDecoration.test.ts's style: mount a real EditorView in jsdom and inspect rendered DOM/state. */
function mountView(doc: string, extraExtensions: Extension[] = []): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      markdownLanguageExtension(),
      markdownHighlighting(),
      highlightMarkerDecoration(),
      ...extraExtensions,
    ],
  });
  return new EditorView({ state, parent });
}

describe('highlightMarkerDecoration', () => {
  it('at rest, the == markers have no DOM presence at all — not merely hidden', () => {
    const view = mountView('Text before ==marked== after');

    expect(view.dom.textContent).toContain('Text before marked after');
    expect(view.dom.textContent).not.toContain('=');
  });

  it('reveals the raw ==…== text once the cursor is inside it', () => {
    const text = 'Text before ==marked== after';
    const view = mountView(text);
    const nodeStart = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeStart + 3 } });

    expect(view.dom.textContent).toContain('==marked==');
  });

  it('re-collapses the markers once the selection leaves the node', () => {
    const view = mountView('Before ==marked== after');

    view.dispatch({ selection: { anchor: 10 } }); // inside the node
    expect(view.dom.textContent).toContain('==marked==');

    view.dispatch({ selection: { anchor: 0 } }); // outside the node
    expect(view.dom.textContent).not.toContain('=');
    expect(view.dom.textContent).toContain('marked');
  });

  it('==**bold**==: engaging the inner text reveals both delimiter pairs (highlight and emphasis independently)', () => {
    const text = 'Text before ==**bold**== after';
    const view = mountView(text, [emphasisMarkerDecoration()]);
    const nodeStart = 'Text before '.length;

    expect(view.dom.textContent).not.toContain('=');
    expect(view.dom.textContent).not.toContain('*');

    view.dispatch({ selection: { anchor: nodeStart + 6 } }); // inside "bold"
    expect(view.dom.textContent).toContain('==**bold**==');
  });

  it('~~==struck highlight==~~: composes with strikethrough, the same way it composes with emphasis', () => {
    const text = 'Text before ~~==struck highlight==~~ after';
    const view = mountView(text, [strikethroughMarkerDecoration()]);
    const nodeStart = 'Text before '.length;

    expect(view.dom.textContent).not.toContain('=');
    expect(view.dom.textContent).not.toContain('~');

    view.dispatch({ selection: { anchor: nodeStart + 6 } }); // inside "struck highlight"
    expect(view.dom.textContent).toContain('~~==struck highlight==~~');
  });

  describe('node shape', () => {
    it('Highlight has exactly two HighlightMark children — firstChild and lastChild', () => {
      const language = markdownLanguageExtension().language;
      const tree = language.parser.parse('==marked==');
      const cursor = tree.cursor();
      let found = false;

      function visit() {
        if (cursor.name === 'Highlight') {
          found = true;
          const node = cursor.node;
          expect(node.firstChild?.name).toBe('HighlightMark');
          expect(node.lastChild?.name).toBe('HighlightMark');
          expect(node.firstChild).not.toBe(node.lastChild);
        }
        if (cursor.firstChild()) {
          do {
            visit();
          } while (cursor.nextSibling());
          cursor.parent();
        }
      }
      visit();

      expect(found).toBe(true);
    });

    it('a bare triple run (===not-highlight===) does not parse as a clean Highlight spanning the whole text', () => {
      // Verified empirically against the configured parser: matches
      // Strikethrough's own documented behavior for `~~~text~~~` — the
      // parser rejects opening on a `=` run whose third character is also
      // `=`, then matches starting one position later, leaving a literal
      // `=` outside the node on the left and folded into the content on
      // the right. Not a clean [[0, length)] Highlight node either way.
      const language = markdownLanguageExtension().language;
      const text = '===not-highlight===';
      const tree = language.parser.parse(text);
      const cursor = tree.cursor();
      let highlightSpan: { from: number; to: number } | null = null;

      function visit() {
        if (cursor.name === 'Highlight') {
          highlightSpan = { from: cursor.from, to: cursor.to };
        }
        if (cursor.firstChild()) {
          do {
            visit();
          } while (cursor.nextSibling());
          cursor.parent();
        }
      }
      visit();

      expect(highlightSpan).not.toBeNull();
      expect(highlightSpan).not.toEqual({ from: 0, to: text.length });
      // The leading '=' at position 0 is left outside the node.
      expect(highlightSpan!.from).toBe(1);
    });
  });

  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as markers collapse/reveal', () => {
      const text = 'Text before ==marked== after';
      const view = mountView(text);
      const nodeStart = 'Text before '.length;

      expect(view.state.doc.toString()).toBe(text);

      view.dispatch({ selection: { anchor: nodeStart + 3 } }); // engage
      expect(view.state.doc.toString()).toBe(text);

      view.dispatch({ selection: { anchor: 0 } }); // disengage
      expect(view.state.doc.toString()).toBe(text);
    });

    it('does not affect plain text with no highlight', () => {
      const view = mountView('Just plain text, nothing to hide.');

      expect(view.dom.textContent).toBe('Just plain text, nothing to hide.');
    });
  });
});
