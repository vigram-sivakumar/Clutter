// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { inlineCodeMarkerDecoration } from './inlineCodeMarkerDecoration';
import { markdownHighlighting } from './markdownHighlightStyle';

/** Mirrors emphasisMarkerDecoration.test.ts's style: mount a real EditorView in jsdom and inspect rendered DOM/state. */
function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), markdownHighlighting(), inlineCodeMarkerDecoration()],
  });
  return new EditorView({ state, parent });
}

describe('inlineCodeMarkerDecoration', () => {
  it('at rest, the ` markers have no DOM presence at all — not merely hidden', () => {
    const view = mountView('Text before `code` after');

    expect(view.dom.textContent).toContain('Text before code after');
    expect(view.dom.textContent).not.toContain('`');
  });

  it('reveals the raw `…` text once the cursor is inside it', () => {
    const text = 'Text before `code` after';
    const view = mountView(text);
    const nodeStart = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeStart + 2 } });

    expect(view.dom.textContent).toContain('`code`');
  });

  it('re-collapses the markers once the selection leaves the node', () => {
    const view = mountView('Before `code` after');

    view.dispatch({ selection: { anchor: 9 } }); // inside the node
    expect(view.dom.textContent).toContain('`code`');

    view.dispatch({ selection: { anchor: 0 } }); // outside the node
    expect(view.dom.textContent).not.toContain('`');
    expect(view.dom.textContent).toContain('code');
  });

  it('variable-length backtick run (``code with ` backtick``): the longer run is required to let a literal backtick appear inside', () => {
    const text = 'Text before ``code with ` backtick`` after';
    const view = mountView(text);
    const nodeStart = 'Text before '.length;

    expect(view.dom.textContent).not.toContain('``');

    view.dispatch({ selection: { anchor: nodeStart + 3 } });
    expect(view.dom.textContent).toContain('``code with ` backtick``');
  });

  it('does not parse further Markdown inside a code span — `**not bold**` stays literal', () => {
    const text = 'Text before `**not bold**` after';
    const view = mountView(text);

    // No emphasis decoration is even registered here, but the real
    // assertion is at the parser level: the code span's content must
    // never contain a nested Emphasis/StrongEmphasis node in the first
    // place (CommonMark's own rule — code span content is always literal).
    const language = markdownLanguageExtension().language;
    const names: string[] = [];
    language.parser.parse(text).iterate({
      enter: (n) => {
        names.push(n.name);
      },
    });
    expect(names).toContain('InlineCode');
    expect(names).not.toContain('Emphasis');
    expect(names).not.toContain('StrongEmphasis');

    expect(view.dom.textContent).toContain('Text before **not bold** after');
  });

  describe('node shape', () => {
    it('InlineCode has exactly two CodeMark children — firstChild and lastChild', () => {
      const language = markdownLanguageExtension().language;
      const tree = language.parser.parse('`code`');
      const cursor = tree.cursor();
      let found = false;

      function visit() {
        if (cursor.name === 'InlineCode') {
          found = true;
          const node = cursor.node;
          expect(node.firstChild?.name).toBe('CodeMark');
          expect(node.lastChild?.name).toBe('CodeMark');
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

    it('a variable-length backtick run still resolves firstChild/lastChild to the full opening/closing run', () => {
      const language = markdownLanguageExtension().language;
      const tree = language.parser.parse('``code with ` backtick``');
      const cursor = tree.cursor();
      let found = false;

      function visit() {
        if (cursor.name === 'InlineCode') {
          found = true;
          const node = cursor.node;
          expect(node.firstChild?.name).toBe('CodeMark');
          expect(node.lastChild?.name).toBe('CodeMark');
          // The opening/closing runs are each 2 characters ("``").
          expect(node.firstChild!.to - node.firstChild!.from).toBe(2);
          expect(node.lastChild!.to - node.lastChild!.from).toBe(2);
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
  });

  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as markers collapse/reveal', () => {
      const text = 'Text before `code` after';
      const view = mountView(text);
      const nodeStart = 'Text before '.length;

      expect(view.state.doc.toString()).toBe(text);

      view.dispatch({ selection: { anchor: nodeStart + 2 } }); // engage
      expect(view.state.doc.toString()).toBe(text);

      view.dispatch({ selection: { anchor: 0 } }); // disengage
      expect(view.state.doc.toString()).toBe(text);
    });

    it('a selection placed at a document offset inside an at-rest collapsed range is not atomic — it lands exactly there, unmoved', () => {
      // 'Text before ' = 12 chars, opening '`' occupies [12, 13).
      const text = 'Text before `code` after';
      const view = mountView(text);

      view.dispatch({ selection: { anchor: 13 } });

      expect(view.state.selection.main.head).toBe(13);
      expect(view.state.selection.main.anchor).toBe(13);
    });

    it('does not affect plain text with no code span', () => {
      const view = mountView('Just plain text, nothing to hide.');

      expect(view.dom.textContent).toBe('Just plain text, nothing to hide.');
    });
  });
});
