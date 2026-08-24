// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import type { Extension } from '@codemirror/state';

import { markdownLanguageExtension } from '../markdownLanguage';
import { emphasisLivePreview } from './emphasisLivePreview';
import { strikethroughLivePreview } from './strikethroughLivePreview';

/** Mirrors emphasisLivePreview.test.ts's mounting style. */
function mountView(doc: string, extraExtensions: Extension[] = []): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), strikethroughLivePreview(), ...extraExtensions],
  });
  return new EditorView({ state, parent });
}

function mountViewWithSelection(doc: string, anchor: number, extraExtensions: Extension[] = []): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdownLanguageExtension(), strikethroughLivePreview(), ...extraExtensions],
  });
  return new EditorView({ state, parent });
}

describe('strikethroughLivePreview', () => {
  describe('~~text~~ (Strikethrough)', () => {
    it('at rest, the ~~ markers have no DOM presence at all — not merely hidden', () => {
      const view = mountView('Text before ~~struck~~ after');

      expect(view.dom.textContent).toBe('Text before struck after');
      expect(view.dom.textContent).not.toContain('~');
    });

    it('renders the content struck-through at rest', () => {
      const view = mountView('Text before ~~struck~~ after');

      const strike = view.dom.querySelector('.tok-strike');
      expect(strike).not.toBeNull();
      expect(strike?.textContent).toBe('struck');
    });

    it('~~Text with several words~~: multi-word content behaves the same', () => {
      // Padded so the construct is not the entire document — see the
      // "known, deferred limitation" describe block below for why.
      const view = mountView('before ~~Text with several words~~ after');

      expect(view.dom.textContent).toBe('before Text with several words after');
      expect(view.dom.querySelector('.tok-strike')?.textContent).toBe('Text with several words');
    });

    it('before ~~Text~~ after: works mid-paragraph', () => {
      const view = mountView('before ~~Text~~ after');

      expect(view.dom.textContent).toBe('before Text after');
    });

    it('reveals the raw ~~…~~ text once the selection is inside it', () => {
      const text = 'Text before ~~struck~~ after';
      const view = mountView(text);
      const nodeStart = 'Text before '.length;

      view.dispatch({ selection: { anchor: nodeStart + 3 } });

      expect(view.dom.textContent).toContain('~~struck~~');
      expect(view.dom.querySelector('.tok-strike')).toBeNull();
    });

    it('re-collapses the markers once the selection leaves the node', () => {
      const view = mountView('Before ~~struck~~ after');

      view.dispatch({ selection: { anchor: 10 } }); // inside the node
      expect(view.dom.textContent).toContain('~~struck~~');

      view.dispatch({ selection: { anchor: 0 } }); // outside the node
      expect(view.dom.textContent).not.toContain('~');
      expect(view.dom.textContent).toContain('struck');
      expect(view.dom.querySelector('.tok-strike')).not.toBeNull();
    });

    describe('boundary-after-completion', () => {
      it('caret at node.to (right after typing the closing ~~) stays revealed', () => {
        const doc = 'Text before ~~struck~~ after';
        const nodeTo = 'Text before ~~struck~~'.length;
        const view = mountViewWithSelection(doc, nodeTo);

        expect(view.dom.textContent).toBe('Text before ~~struck~~ after');
        expect(view.dom.querySelector('.tok-strike')).toBeNull();
      });

      it('caret at node.from (right before the opening ~~) stays revealed', () => {
        const doc = 'Text before ~~struck~~ after';
        const nodeFrom = 'Text before '.length;
        const view = mountViewWithSelection(doc, nodeFrom);

        expect(view.dom.textContent).toBe('Text before ~~struck~~ after');
      });

      it('caret inside the opening/closing mark, and anywhere in content, all count as engaged', () => {
        const doc = 'Text before ~~struck~~ after';
        const nodeFrom = 'Text before '.length; // node.from
        const openMarkInside = nodeFrom + 1; // inside "~~"
        const contentStart = nodeFrom + 2; // right after "~~"
        const contentMiddle = nodeFrom + 5; // inside "struck"
        const closeMarkInside = nodeFrom + 'struck'.length + 2 + 1; // inside closing "~~"

        for (const pos of [nodeFrom, openMarkInside, contentStart, contentMiddle, closeMarkInside]) {
          const view = mountViewWithSelection(doc, pos);
          expect(view.dom.textContent).toBe(doc);
        }
      });

      it('caret one position further out on either side conceals normally', () => {
        const doc = 'Text before ~~struck~~ after';
        const nodeFrom = 'Text before '.length;
        const nodeTo = 'Text before ~~struck~~'.length;

        const viewBefore = mountViewWithSelection(doc, nodeFrom - 1);
        expect(viewBefore.dom.textContent).toBe('Text before struck after');

        const viewAfter = mountViewWithSelection(doc, nodeTo + 1);
        expect(viewAfter.dom.textContent).toBe('Text before struck after');
      });
    });
  });

  describe('parser-confirmed non-construct cases (no Strikethrough node at all)', () => {
    it('~~ Text ~~: space after opening and before closing blocks the construct', () => {
      const view = mountView('before ~~ Text ~~ after');

      expect(view.dom.textContent).toBe('before ~~ Text ~~ after');
      expect(view.dom.querySelector('.tok-strike')).toBeNull();
    });

    it('~~Text ~~: space before the closing delimiter blocks the construct', () => {
      const view = mountView('before ~~Text ~~ after');

      expect(view.dom.textContent).toBe('before ~~Text ~~ after');
      expect(view.dom.querySelector('.tok-strike')).toBeNull();
    });

    it('~~ Text~~: space after the opening delimiter blocks the construct', () => {
      const view = mountView('before ~~ Text~~ after');

      expect(view.dom.textContent).toBe('before ~~ Text~~ after');
      expect(view.dom.querySelector('.tok-strike')).toBeNull();
    });

    it('~Text~ (single tilde): never a Strikethrough delimiter', () => {
      const view = mountView('before ~Text~ after');

      expect(view.dom.textContent).toBe('before ~Text~ after');
      expect(view.dom.querySelector('.tok-strike')).toBeNull();
    });
  });

  describe('nested/mixed with Emphasis/StrongEmphasis', () => {
    // emphasisLivePreview() is mounted alongside strikethroughLivePreview()
    // here, exactly the way strikethroughMarkerDecoration.test.ts's own
    // nested-composition tests mount emphasisMarkerDecoration() alongside
    // it — two independent plugins, each owning its own construct, whose
    // concealment/reveal composes correctly because engagement containment
    // (§C of the investigation) makes them agree without any coordination
    // between them.
    it('***~~Text~~***: Emphasis > StrongEmphasis > Strikethrough, all conceal together at rest', () => {
      const view = mountView('before ***~~Text~~*** after', [emphasisLivePreview()]);

      expect(view.dom.textContent).toBe('before Text after');
      expect(view.dom.textContent).not.toMatch(/[*~]/);
    });

    it('~~***Text***~~: Strikethrough > Emphasis > StrongEmphasis, all conceal together at rest', () => {
      const view = mountView('before ~~***Text***~~ after', [emphasisLivePreview()]);

      expect(view.dom.textContent).toBe('before Text after');
      expect(view.dom.textContent).not.toMatch(/[*~]/);
      expect(view.dom.querySelector('.tok-strike')?.textContent).toBe('Text');
    });

    it('**~~Text~~**: strikethrough nested inside strong emphasis', () => {
      const view = mountView('before **~~Text~~** after', [emphasisLivePreview()]);

      expect(view.dom.textContent).toBe('before Text after');
      expect(view.dom.querySelector('.tok-strike')?.textContent).toBe('Text');
    });

    it('~~**Text**~~: strong emphasis nested inside strikethrough', () => {
      const view = mountView('before ~~**Text**~~ after', [emphasisLivePreview()]);

      expect(view.dom.textContent).toBe('before Text after');
      expect(view.dom.querySelector('.tok-strike')?.textContent).toBe('Text');
    });

    it('~~*Text*~~: emphasis nested inside strikethrough', () => {
      const view = mountView('before ~~*Text*~~ after', [emphasisLivePreview()]);

      expect(view.dom.textContent).toBe('before Text after');
      expect(view.dom.querySelector('.tok-strike')?.textContent).toBe('Text');
    });

    it('*~~Text~~*: strikethrough nested inside emphasis', () => {
      const view = mountView('before *~~Text~~* after', [emphasisLivePreview()]);

      expect(view.dom.textContent).toBe('before Text after');
      expect(view.dom.querySelector('.tok-strike')?.textContent).toBe('Text');
    });

    // Strikethrough and Emphasis are two independent plugins with no
    // shared coordinator (deliberately, per the investigation's Option 1
    // recommendation) — each decides its own engagement purely from
    // whether the caret lies within *its own* node's range. A caret truly
    // inside the innermost content lies within both nodes' ranges, so
    // both reveal (containment is transitive there — see the
    // investigation's §C). But at the *outer* construct's own boundary,
    // the two node ranges are NOT the same size (the outer node's marks
    // sit further out than the inner node's own edge), so a caret at the
    // outer boundary can be within the outer node's range while sitting
    // outside the inner node's own range — in which case only the outer
    // construct reveals and the inner one independently stays concealed.
    // This is real, verified behavior, not a bug: it is the expected
    // consequence of choosing two uncoordinated plugins over a shared
    // engagement-range abstraction.
    describe('cross-plugin composition: each construct engages independently from its own node range', () => {
      it('~~***Text***~~: caret truly inside the innermost content reveals both constructs', () => {
        const doc = 'before ~~***Text***~~ after';
        const insideContent = doc.indexOf('Text') + 2;
        const view = mountViewWithSelection(doc, insideContent, [emphasisLivePreview()]);

        expect(view.dom.textContent).toBe(doc);
      });

      it('~~***Text***~~: caret at the outer Strikethrough boundary (node.from/node.to) reveals only the "~~" markers — the inner "***" stays independently concealed', () => {
        const doc = 'before ~~***Text***~~ after';
        const nodeFrom = 'before '.length;
        const nodeTo = 'before ~~***Text***~~'.length;

        const atFrom = mountViewWithSelection(doc, nodeFrom, [emphasisLivePreview()]);
        expect(atFrom.dom.textContent).toBe('before ~~Text~~ after');

        const atTo = mountViewWithSelection(doc, nodeTo, [emphasisLivePreview()]);
        expect(atTo.dom.textContent).toBe('before ~~Text~~ after');
      });

      it('~~***Text***~~: caret one position outside the outer Strikethrough boundary fully conceals everything', () => {
        const doc = 'before ~~***Text***~~ after';
        const nodeFrom = 'before '.length;
        const nodeTo = 'before ~~***Text***~~'.length;

        const before = mountViewWithSelection(doc, nodeFrom - 1, [emphasisLivePreview()]);
        expect(before.dom.textContent).toBe('before Text after');

        const after = mountViewWithSelection(doc, nodeTo + 1, [emphasisLivePreview()]);
        expect(after.dom.textContent).toBe('before Text after');
      });

      it('**~~Text~~**: caret truly inside the innermost content reveals both constructs', () => {
        const doc = 'before **~~Text~~** after';
        const insideContent = doc.indexOf('Text') + 2;
        const view = mountViewWithSelection(doc, insideContent, [emphasisLivePreview()]);

        expect(view.dom.textContent).toBe(doc);
      });

      it('**~~Text~~**: caret at the outer StrongEmphasis boundary (node.from/node.to) reveals only the "**" markers — the inner "~~" stays independently concealed', () => {
        const doc = 'before **~~Text~~** after';
        const nodeFrom = 'before '.length;
        const nodeTo = 'before **~~Text~~**'.length;

        const atFrom = mountViewWithSelection(doc, nodeFrom, [emphasisLivePreview()]);
        expect(atFrom.dom.textContent).toBe('before **Text** after');

        const atTo = mountViewWithSelection(doc, nodeTo, [emphasisLivePreview()]);
        expect(atTo.dom.textContent).toBe('before **Text** after');
      });
    });
  });

  describe('parser-confirmed line-start tilde runs: FencedCode, never Strikethrough', () => {
    it('~~~Text~~~ at line start: no Strikethrough node, no tok-strike', () => {
      const view = mountView('~~~Text~~~');

      expect(view.dom.querySelector('.tok-strike')).toBeNull();
    });

    it('~~~~Text~~~~ at line start: no Strikethrough node, no tok-strike', () => {
      const view = mountView('~~~~Text~~~~');

      expect(view.dom.querySelector('.tok-strike')).toBeNull();
    });

    it('~~~~~~Text~~~~~~ at line start: no Strikethrough node, no tok-strike', () => {
      const view = mountView('~~~~~~Text~~~~~~');

      expect(view.dom.querySelector('.tok-strike')).toBeNull();
    });
  });

  describe('parser-confirmed mid-line long tilde runs: one Strikethrough, leftover tildes as literal content', () => {
    it('before ~~~~Text~~~~ after: exactly one Strikethrough forms; 2 leftover tildes precede it (literal, unconcealed) and 2 more trail inside its content', () => {
      const doc = 'before ~~~~Text~~~~ after';
      const view = mountView(doc);

      // Per the parser: the 4-tilde run at [7,11) splits as 2 leftover
      // literal tildes at [7,9) (never part of any node, so never
      // concealed) followed by the real StrikethroughMark at [9,11).
      // Strikethrough[9,19) itself: open mark [9,11), content [11,17) =
      // "Text~~" (2 more literal trailing tildes inside the content
      // range), close mark [17,19). Only the two StrikethroughMark
      // ranges are ever concealed; the leftover tildes on both sides are
      // ordinary, always-visible text.
      expect(view.dom.textContent).toBe('before ~~Text~~ after');
      expect(view.dom.querySelector('.tok-strike')?.textContent).toBe('Text~~');
    });

    it('before ~~~~~~Text~~~~~~ after: exactly one Strikethrough forms; 4 leftover tildes precede it and 4 more trail inside its content', () => {
      const doc = 'before ~~~~~~Text~~~~~~ after';
      const view = mountView(doc);

      // Same pattern as the 4-tilde case, scaled up: 4 leftover literal
      // tildes before the node, StrikethroughMark[11,13), content
      // [13,21) = "Text~~~~" (4 more literal trailing tildes),
      // StrikethroughMark[21,23).
      expect(view.dom.textContent).toBe('before ~~~~Text~~~~ after');
      expect(view.dom.querySelector('.tok-strike')?.textContent).toBe('Text~~~~');
    });
  });

  describe('parser-confirmed adjacent-delimiter quirk', () => {
    it('~~Text~~~~More~~: only the "~~More~~" portion forms a Strikethrough node; the leading "~~Text~~" is entirely unwrapped, literal text', () => {
      const doc = '~~Text~~~~More~~';
      const view = mountView(doc);

      // Per the parser: only Strikethrough[8,16) = "~~More~~" forms.
      // "~~Text~~" (positions 0-8) belongs to no node at all — not a
      // marker, not content — so it is never touched by the decoration
      // layer and remains fully literal in the rendered output.
      expect(view.dom.textContent).toBe('~~Text~~More');
      const strikeSpans = Array.from(view.dom.querySelectorAll('.tok-strike'));
      expect(strikeSpans).toHaveLength(1);
      expect(strikeSpans[0]?.textContent).toBe('More');
    });
  });

  it('soft-wrapped ~~one\\ntwo~~ spans the line break within one paragraph', () => {
    // Padded with "before "/" after" so the construct is not the entire
    // document — otherwise the default caret at position 0 would sit
    // exactly on node.from and trigger the known whole-document-mount
    // limitation below, which is a separate concern from soft-wrap.
    const view = mountView('before ~~one\ntwo~~ after');

    expect(view.dom.textContent).toBe('before onetwo after');
    // The mark decoration spans a real line break, so CM6 renders it as
    // two separate per-line <span class="tok-strike"> elements rather
    // than one spanning both lines.
    const strikeSpans = Array.from(view.dom.querySelectorAll('.tok-strike'));
    expect(strikeSpans.map((el) => el.textContent)).toEqual(['one', 'two']);
  });

  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as markers collapse/reveal', () => {
      const text = 'Text before ~~struck~~ after';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);

      view.dispatch({ selection: { anchor: 20 } }); // engage
      expect(view.state.doc.toString()).toBe(text);

      view.dispatch({ selection: { anchor: 0 } }); // disengage
      expect(view.state.doc.toString()).toBe(text);
    });

    it('a selection placed at a document offset inside an at-rest collapsed range is not atomic — it lands exactly there, unmoved', () => {
      const text = 'Text before ~~struck~~ after';
      const view = mountView(text);

      // 'Text before ' = 12 chars, opening '~~' occupies [12, 14).
      view.dispatch({ selection: { anchor: 13 } });

      expect(view.state.selection.main.head).toBe(13);
      expect(view.state.selection.main.anchor).toBe(13);
    });

    it('does not affect plain text with no strikethrough', () => {
      const view = mountView('Just plain text, nothing to hide.');

      expect(view.dom.textContent).toBe('Just plain text, nothing to hide.');
    });
  });

  describe('unrelated-construct isolation', () => {
    it('does not decorate emphasis/strong as strikethrough', () => {
      const view = mountView('Text with **bold** and *italic* only');

      expect(view.dom.querySelector('.tok-strike')).toBeNull();
    });

    it('an independent, unrelated ~~plain~~ strikethrough elsewhere still renders after a separate nested construct', () => {
      const view = mountView('Before ~~***nested***~~ middle ~~plain~~ after', [emphasisLivePreview()]);

      expect(view.dom.textContent).toBe('Before nested middle plain after');
      const spans = Array.from(view.dom.querySelectorAll('.tok-strike'));
      expect(spans.some((el) => el.textContent === 'plain')).toBe(true);
    });
  });

  describe('known, deferred limitation: whole-document construct at the real initial cursor position', () => {
    // createEditorView.ts always seeds the initial selection at doc.length.
    // Same limitation as emphasisLivePreview.ts, unrelated to nesting or
    // to anything Strikethrough-specific — not solved here.
    it('plain ~~Hey~~ as the entire document, caret at doc.length: stays revealed (known limitation)', () => {
      const doc = '~~Hey~~';
      const view = mountViewWithSelection(doc, doc.length);

      expect(view.dom.textContent).toBe('~~Hey~~');
    });

    it('plain ~~Hey~~ as the entire document, caret at 0: stays revealed (known limitation)', () => {
      const doc = '~~Hey~~';
      const view = mountViewWithSelection(doc, 0);

      expect(view.dom.textContent).toBe('~~Hey~~');
    });
  });

  describe('node shape', () => {
    it('Strikethrough has exactly two StrikethroughMark children — firstChild and lastChild', () => {
      const language = markdownLanguageExtension().language;
      const tree = language.parser.parse('~~struck~~');
      const cursor = tree.cursor();
      let found = false;

      function visit() {
        if (cursor.name === 'Strikethrough') {
          found = true;
          const node = cursor.node;
          expect(node.firstChild?.name).toBe('StrikethroughMark');
          expect(node.lastChild?.name).toBe('StrikethroughMark');
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
  });
});
