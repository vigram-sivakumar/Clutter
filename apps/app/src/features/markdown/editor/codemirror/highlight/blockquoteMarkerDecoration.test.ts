// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { blockquoteMarkerDecoration } from './blockquoteMarkerDecoration';

/** Mirrors headingMarkerDecoration.test.ts's mountView — see its doc comment for why `initialAnchor` matters for "at rest" tests. */
function mountView(doc: string, initialAnchor: number | null = null): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: initialAnchor === null ? undefined : { anchor: initialAnchor },
    extensions: [markdownLanguageExtension(), blockquoteMarkerDecoration()],
  });
  return new EditorView({ state, parent });
}

describe('blockquoteMarkerDecoration', () => {
  it('at rest, a single-line "> " marker has no DOM presence', () => {
    const text = '> quoted text\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.textContent).toContain('quoted text');
    expect(view.dom.textContent).not.toContain('>');
  });

  it('reveals the raw "> " once the cursor is inside the quote', () => {
    const view = mountView('> quoted text');

    view.dispatch({ selection: { anchor: 5 } }); // inside "quoted"

    expect(view.dom.textContent).toBe('> quoted text');
  });

  it('re-collapses once the selection leaves the quote', () => {
    const text = '> quoted text\n\nOther';
    const view = mountView(text, 5); // inside the quote

    expect(view.dom.textContent).toContain('> quoted text');

    view.dispatch({ selection: { anchor: text.indexOf('Other') } });

    expect(view.dom.textContent).not.toContain('>');
    expect(view.dom.textContent).toContain('quoted text');
  });

  it("multi-line quote: hides every continuation line's \"> \" marker, not just the first", () => {
    const text = '> line one\n> line two\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.textContent).not.toContain('>');
    expect(view.dom.textContent).toContain('line one');
    expect(view.dom.textContent).toContain('line two');
  });

  it('multi-line quote engages as one construct: cursor anywhere inside reveals every line\'s marker', () => {
    const text = '> line one\n> line two';
    const lineTwoStart = text.indexOf('line two');
    const view = mountView(text, lineTwoStart + 2); // inside "line two"

    expect(view.dom.textContent).toContain('> line one');
    expect(view.dom.textContent).toContain('> line two');
  });

  it('lazy continuation (no ">" on the second physical line) needs no decoration and is unaffected', () => {
    // Not a QuoteMark-bearing continuation line at all — CommonMark lazy
    // continuation without a repeated ">" is just literal text appended to
    // the same Paragraph. Included to document the distinction from the
    // "> line two" case above, not because this construct hides anything.
    const text = '> line one\nlazy continuation\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.textContent).toContain('line one');
    expect(view.dom.textContent).toContain('lazy continuation');
    expect(view.dom.textContent).not.toContain('>');
  });

  it('nested quote (>>): both levels\' markers are hidden at rest', () => {
    const text = '>> nested quote\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.textContent).toContain('nested quote');
    expect(view.dom.textContent).not.toContain('>');
  });

  it('nested quote (>>): engaging the content reveals both markers', () => {
    const text = '>> nested quote';
    const view = mountView(text, text.indexOf('nested') + 2);

    expect(view.dom.textContent).toBe('>> nested quote');
  });

  describe('lazy continuation does not leak engagement onto an unrelated marker-less line', () => {
    it('"> quote\\n=": cursor on the "=" line does not reveal ">" — the "=" line has no QuoteMark of its own', () => {
      const text = '> quote\n=';
      const view = mountView(text, text.indexOf('='));

      expect(view.dom.textContent).not.toContain('>');
      expect(view.dom.textContent).toContain('quote');
    });

    it("the marker's own physical line still reveals correctly despite the lazy-continuation fix", () => {
      const text = '> quote\n=';
      const view = mountView(text, 2); // inside "quote", the marker's own line

      expect(view.dom.textContent).toContain('> quote');
    });
  });

  describe('node shape', () => {
    it('a single-line Blockquote has QuoteMark as firstChild', () => {
      const language = markdownLanguageExtension().language;
      const tree = language.parser.parse('> quoted text');
      const cursor = tree.cursor();
      let found = false;

      function visit() {
        if (cursor.name === 'Blockquote') {
          found = true;
          expect(cursor.node.firstChild?.name).toBe('QuoteMark');
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

    it('a continuation line\'s QuoteMark is nested inside the Paragraph, not a direct Blockquote child', () => {
      const language = markdownLanguageExtension().language;
      const tree = language.parser.parse('> line one\n> line two');
      const cursor = tree.cursor();
      let blockquoteDirectQuoteMarks = 0;
      let paragraphNestedQuoteMarks = 0;

      function visit() {
        if (cursor.name === 'Blockquote') {
          for (let child = cursor.node.firstChild; child; child = child.nextSibling) {
            if (child.name === 'QuoteMark') {
              blockquoteDirectQuoteMarks++;
            }
            if (child.name === 'Paragraph') {
              for (let grandchild = child.firstChild; grandchild; grandchild = grandchild.nextSibling) {
                if (grandchild.name === 'QuoteMark') {
                  paragraphNestedQuoteMarks++;
                }
              }
            }
          }
        }
        if (cursor.firstChild()) {
          do {
            visit();
          } while (cursor.nextSibling());
          cursor.parent();
        }
      }
      visit();

      expect(blockquoteDirectQuoteMarks).toBe(1);
      expect(paragraphNestedQuoteMarks).toBe(1);
    });
  });

  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as markers collapse/reveal', () => {
      const text = '> line one\n> line two';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 5 } });
      expect(view.state.doc.toString()).toBe(text);
    });

    it('does not affect plain text with no blockquote', () => {
      const view = mountView('Just plain text, nothing to hide.');

      expect(view.dom.textContent).toBe('Just plain text, nothing to hide.');
    });
  });
});
