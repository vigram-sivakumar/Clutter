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

/**
 * The real `>` character is now always present in `view.dom.textContent`
 * — this construct's deliberate deviation from every other marker-hiding
 * construct in this codebase (`Decoration.mark`, not `Decoration.replace`;
 * see blockquoteMarkerDecoration.ts's own doc comment for why). So
 * "concealed" is asserted via the `.cm-quote-marker--concealed` class,
 * never via `textContent` exclusion.
 */
function markerSpans(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll('.cm-quote-marker'));
}

function concealedMarkerTexts(view: EditorView): string[] {
  return markerSpans(view)
    .filter((s) => s.classList.contains('cm-quote-marker--concealed'))
    .map((s) => s.textContent ?? '');
}

function revealedMarkerTexts(view: EditorView): string[] {
  return markerSpans(view)
    .filter((s) => !s.classList.contains('cm-quote-marker--concealed'))
    .map((s) => s.textContent ?? '');
}

describe('blockquoteMarkerDecoration', () => {
  it('at rest, a single-line "> " marker is real text, concealed via class — not removed from the DOM', () => {
    const text = '> quoted text\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.textContent).toBe('> quoted textOther');
    expect(concealedMarkerTexts(view)).toEqual(['> ']);
    expect(revealedMarkerTexts(view)).toEqual([]);
  });

  it('reveals the "> " marker (drops the concealed class) once the cursor is inside the quote', () => {
    const view = mountView('> quoted text');

    view.dispatch({ selection: { anchor: 5 } }); // inside "quoted"

    expect(revealedMarkerTexts(view)).toEqual(['> ']);
    expect(concealedMarkerTexts(view)).toEqual([]);
  });

  it('re-conceals once the selection leaves the quote', () => {
    const text = '> quoted text\n\nOther';
    const view = mountView(text, 5); // inside the quote

    expect(revealedMarkerTexts(view)).toEqual(['> ']);

    view.dispatch({ selection: { anchor: text.indexOf('Other') } });

    expect(concealedMarkerTexts(view)).toEqual(['> ']);
    expect(revealedMarkerTexts(view)).toEqual([]);
  });

  it("multi-line quote: conceals every continuation line's \"> \" marker, not just the first", () => {
    const text = '> line one\n> line two\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(concealedMarkerTexts(view)).toEqual(['> ', '> ']);
    expect(view.dom.textContent).toBe('> line one> line twoOther');
  });

  it('multi-line quote engagement is strictly per physical line: cursor on line two reveals ONLY line two\'s marker, not line one\'s', () => {
    const text = '> line one\n> line two';
    const lineTwoStart = text.indexOf('line two');
    const view = mountView(text, lineTwoStart + 2); // inside "line two"

    expect(concealedMarkerTexts(view)).toEqual(['> ']);
    expect(revealedMarkerTexts(view)).toEqual(['> ']);
  });

  it('the reverse: cursor on line one reveals ONLY line one\'s marker, not line two\'s', () => {
    const text = '> line one\n> line two';
    const view = mountView(text, 2); // inside "line one"

    expect(revealedMarkerTexts(view)).toEqual(['> ']);
    expect(concealedMarkerTexts(view)).toEqual(['> ']);
  });

  describe('nested-depth cross-line leak (the reported bug)', () => {
    // "> hey\n>> come on\n>> Man": line 2's second ">" and line 3's two ">"
    // all end up in the *same* inner Blockquote node's own mark set
    // (CommonMark lazy continuation nests line 3's markers one level into
    // the Paragraph line 2's own direct QuoteMark also belongs to). The
    // pre-existing per-mark isPhysicalLineEngaged fix (reused here
    // unchanged) is what keeps engagement scoped to one physical line
    // even though the marker range collection spans several.
    const text = '> hey\n>> come on\n>> Man';

    it('cursor on "> hey": only line 1\'s marker reveals', () => {
      const view = mountView(text, text.indexOf('hey'));

      expect(revealedMarkerTexts(view)).toEqual(['> ']);
      expect(concealedMarkerTexts(view)).toEqual(['>', '> ', '>', '> ']);
    });

    it('cursor on ">> come on": only line 2\'s markers reveal, not line 1\'s or line 3\'s', () => {
      const view = mountView(text, text.indexOf('come on'));

      expect(revealedMarkerTexts(view)).toEqual(['>', '> ']);
      expect(concealedMarkerTexts(view)).toEqual(['> ', '>', '> ']);
    });

    it('cursor on ">> Man": only line 3\'s markers reveal, not line 2\'s (the exact reported symptom)', () => {
      const view = mountView(text, text.indexOf('Man'));

      expect(revealedMarkerTexts(view)).toEqual(['>', '> ']);
      expect(concealedMarkerTexts(view)).toEqual(['> ', '>', '> ']);
    });

    it('moving the caret 1 -> 2 -> 3 -> 2 -> 1 always reveals exactly the current line', () => {
      const view = mountView(text, text.indexOf('hey'));
      expect(revealedMarkerTexts(view)).toEqual(['> ']);

      view.dispatch({ selection: { anchor: text.indexOf('come on') } });
      expect(revealedMarkerTexts(view)).toEqual(['>', '> ']);

      view.dispatch({ selection: { anchor: text.indexOf('Man') } });
      expect(revealedMarkerTexts(view)).toEqual(['>', '> ']);

      view.dispatch({ selection: { anchor: text.indexOf('come on') } });
      expect(revealedMarkerTexts(view)).toEqual(['>', '> ']);

      view.dispatch({ selection: { anchor: text.indexOf('hey') } });
      expect(revealedMarkerTexts(view)).toEqual(['> ']);
    });

    it('>>> nested three deep: engaging one line never reveals a sibling line\'s markers', () => {
      const deep = '> one\n>> two\n>>> three';
      const view = mountView(deep, deep.indexOf('two'));

      expect(revealedMarkerTexts(view)).toEqual(['>', '> ']);
      expect(concealedMarkerTexts(view)).toEqual(['> ', '>', '>', '> ']);
    });
  });

  it('genuinely separate blockquotes (blank-line separated) never leak into each other', () => {
    const text = '> first\n\n> second';
    const view = mountView(text, text.indexOf('first'));

    expect(revealedMarkerTexts(view)).toEqual(['> ']);
    expect(concealedMarkerTexts(view)).toEqual(['> ']);
  });

  it('lazy continuation (no ">" on the second physical line) needs no marker decoration and is unaffected', () => {
    // Not a QuoteMark-bearing continuation line at all — CommonMark lazy
    // continuation without a repeated ">" is just literal text appended to
    // the same Paragraph. Included to document the distinction from the
    // "> line two" case above, not because this construct hides anything.
    const text = '> line one\nlazy continuation\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.textContent).toBe('> line onelazy continuationOther');
    expect(markerSpans(view)).toHaveLength(1); // only line one's own "> "
    expect(concealedMarkerTexts(view)).toEqual(['> ']);
  });

  it('nested quote (>>): both levels\' markers are concealed at rest', () => {
    const text = '>> nested quote\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.textContent).toBe('>> nested quoteOther');
    expect(concealedMarkerTexts(view)).toEqual(['>', '> ']);
  });

  it('nested quote (>>): engaging the content reveals both markers', () => {
    const text = '>> nested quote';
    const view = mountView(text, text.indexOf('nested') + 2);

    expect(revealedMarkerTexts(view)).toEqual(['>', '> ']);
    expect(concealedMarkerTexts(view)).toEqual([]);
  });

  describe('lazy continuation does not leak engagement onto an unrelated marker-less line', () => {
    it('"> quote\\n=": cursor on the "=" line does not reveal ">" — the "=" line has no QuoteMark of its own', () => {
      const text = '> quote\n=';
      const view = mountView(text, text.indexOf('='));

      expect(concealedMarkerTexts(view)).toEqual(['> ']);
      expect(revealedMarkerTexts(view)).toEqual([]);
      expect(view.dom.textContent).toBe('> quote=');
    });

    it("the marker's own physical line still reveals correctly despite the lazy-continuation fix", () => {
      const text = '> quote\n=';
      const view = mountView(text, 2); // inside "quote", the marker's own line

      expect(revealedMarkerTexts(view)).toEqual(['> ']);
    });
  });

  describe('two-span structure: marker span and content span are separate siblings', () => {
    it('a simple quote line produces exactly a marker span followed by a content span, no enclosing wrapper', () => {
      const text = '> Hello world';
      const view = mountView(text, text.indexOf('Hello'));
      const line = view.dom.querySelector('.cm-line');

      expect(line?.children).toHaveLength(2);
      expect(line?.children[0]?.className).toContain('cm-quote-marker');
      expect(line?.children[1]?.className).toBe('cm-quote');
      expect(line?.children[1]?.textContent).toBe('Hello world');
    });

    it('the marker is never duplicated: exactly one marker span per QuoteMark, wrapping the real character', () => {
      const text = '> Hello world';
      const view = mountView(text, text.indexOf('Hello'));

      expect(markerSpans(view)).toHaveLength(1);
      expect(markerSpans(view)[0]?.textContent).toBe('> ');
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
    it('the stored document text never changes as markers conceal/reveal', () => {
      const text = '> line one\n> line two';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 5 } });
      expect(view.state.doc.toString()).toBe(text);
    });

    it('does not affect plain text with no blockquote', () => {
      const view = mountView('Just plain text, nothing to hide.');

      expect(view.dom.textContent).toBe('Just plain text, nothing to hide.');
      expect(markerSpans(view)).toHaveLength(0);
    });
  });
});
