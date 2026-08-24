// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { inlineLivePreviewRegion } from './inlineLivePreviewRegion';

/**
 * Tests for the single authoritative inline visibility mechanism, per the
 * Inline Live Preview Region ODR §9: **prove structural invariants, do not
 * enumerate construct combinations.**
 *
 * The nested cases below are chosen as structurally distinct
 * representatives (same-kind nesting, cross-kind nesting in both
 * directions, three-level nesting), not as a matrix of pairs. Each is
 * evidence of the general rule in ODR §5; none is a hard-coded special
 * case, and no construct-pair logic exists in the implementation to
 * correspond to them.
 *
 * Consolidates and replaces the retired `emphasisLivePreview.test.ts` and
 * `strikethroughLivePreview.test.ts`; their meaningful behavioral coverage
 * is migrated below rather than discarded.
 */
function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), inlineLivePreviewRegion()],
  });
  return new EditorView({ state, parent });
}

function mountViewWithSelection(doc: string, anchor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdownLanguageExtension(), inlineLivePreviewRegion()],
  });
  return new EditorView({ state, parent });
}

/**
 * Asserts ODR §4.4 (one coherent region state) and §4.1 (region-level
 * resolution) for one nested construct, by sweeping **every** caret
 * position from `region.from` through `region.to` inclusive — which is
 * exactly the set of positions the ODR §6 table names (region root's own
 * boundaries, inside each delimiter run, between delimiter levels, inside
 * the innermost content) without enumerating them individually.
 */
function expectRegionRevealsAtomicallyThroughout(padded: string, construct: string) {
  const regionFrom = padded.indexOf(construct);
  const regionTo = regionFrom + construct.length;

  // Guard against a vacuous sweep: at rest the whole region must collapse
  // to its bare content, which is only true if every participating level
  // actually concealed its markers.
  const atRest = mountView(padded);
  expect(atRest.dom.textContent).not.toBe(padded);

  for (let pos = regionFrom; pos <= regionTo; pos++) {
    const view = mountViewWithSelection(padded, pos);
    expect(
      view.dom.textContent,
      `caret at ${pos} (offset ${pos - regionFrom} into the region) must reveal the whole region as source`
    ).toBe(padded);
  }

  // One position beyond either edge: the whole region conceals again.
  const before = mountViewWithSelection(padded, regionFrom - 1);
  expect(before.dom.textContent).toBe(atRest.dom.textContent);
  const after = mountViewWithSelection(padded, regionTo + 1);
  expect(after.dom.textContent).toBe(atRest.dom.textContent);
}

describe('inlineLivePreviewRegion', () => {
  // ===================================================================
  // ODR §9.1 — INVARIANT: region atomicity
  // ===================================================================
  describe('INVARIANT: every caret position within a region root renders the entire region as source', () => {
    it('~~__Text__~~ — the defect this ODR was written for (Strikethrough > StrongEmphasis)', () => {
      expectRegionRevealsAtomicallyThroughout('before ~~__Text__~~ after', '~~__Text__~~');
    });

    it('***~~Text~~*** — three levels, emphasis outermost (Emphasis > StrongEmphasis > Strikethrough)', () => {
      expectRegionRevealsAtomicallyThroughout('before ***~~Text~~*** after', '***~~Text~~***');
    });

    it('~~***Text***~~ — three levels, strikethrough outermost (Strikethrough > Emphasis > StrongEmphasis)', () => {
      expectRegionRevealsAtomicallyThroughout('before ~~***Text***~~ after', '~~***Text***~~');
    });

    it('**~~Text~~** — cross-kind, emphasis outside', () => {
      expectRegionRevealsAtomicallyThroughout('before **~~Text~~** after', '**~~Text~~**');
    });

    it('~~**Text**~~ — cross-kind, strikethrough outside', () => {
      expectRegionRevealsAtomicallyThroughout('before ~~**Text**~~ after', '~~**Text**~~');
    });

    it('*~~Text~~* — cross-kind with single-delimiter emphasis outside', () => {
      expectRegionRevealsAtomicallyThroughout('before *~~Text~~* after', '*~~Text~~*');
    });

    it('~~*Text*~~ — cross-kind with single-delimiter emphasis inside', () => {
      expectRegionRevealsAtomicallyThroughout('before ~~*Text*~~ after', '~~*Text*~~');
    });

    it('***Text*** — same-family nesting (Emphasis > StrongEmphasis)', () => {
      expectRegionRevealsAtomicallyThroughout('before ***Text*** after', '***Text***');
    });

    it('****Text**** — same-kind nesting (StrongEmphasis > StrongEmphasis)', () => {
      expectRegionRevealsAtomicallyThroughout('before ****Text**** after', '****Text****');
    });

    it('___Text___ — same-family nesting with underscore delimiters', () => {
      expectRegionRevealsAtomicallyThroughout('before ___Text___ after', '___Text___');
    });

    it('*****Text***** — deeper chain (Emphasis > StrongEmphasis > StrongEmphasis)', () => {
      expectRegionRevealsAtomicallyThroughout('before *****Text***** after', '*****Text*****');
    });

    it('**_Text_** / __*Text*__ — mixed delimiter characters', () => {
      expectRegionRevealsAtomicallyThroughout('before **_Text_** after', '**_Text_**');
      expectRegionRevealsAtomicallyThroughout('before __*Text*__ after', '__*Text*__');
    });
  });

  // ===================================================================
  // ODR §9.2 — INVARIANT: disengagement independence
  // ===================================================================
  describe('INVARIANT: outside the region root, every level conceals independently', () => {
    it('a nested region fully conceals when the caret is elsewhere in the document', () => {
      const view = mountViewWithSelection('before ~~__Text__~~ after', 0);

      expect(view.dom.textContent).toBe('before Text after');
      expect(view.dom.textContent).not.toMatch(/[~_]/);
    });

    it('every participating level applied its own content class at rest', () => {
      const view = mountViewWithSelection('before ~~__Text__~~ after', 0);

      expect(view.dom.querySelector('.tok-strike')?.textContent).toBe('Text');
      expect(view.dom.querySelector('.tok-strong')?.textContent).toBe('Text');
    });
  });

  // ===================================================================
  // ODR §9.3 — INVARIANT: region coherence (no mixed preview/source)
  // ===================================================================
  describe('INVARIANT: a region is never partly preview and partly source', () => {
    it('no caret position in ~~__Text__~~ produces a mixed state', () => {
      const doc = 'before ~~__Text__~~ after';
      const regionFrom = doc.indexOf('~~__Text__~~');
      const regionTo = regionFrom + '~~__Text__~~'.length;

      for (let pos = 0; pos <= doc.length; pos++) {
        const text = mountViewWithSelection(doc, pos).dom.textContent ?? '';
        const inRegion = pos >= regionFrom && pos <= regionTo;
        // Exactly two legal outcomes — fully raw, or fully collapsed.
        // Anything else (e.g. "~~Text~~" with inner markers still hidden)
        // is the ODR §4.4 violation.
        expect(text, `caret at ${pos}`).toBe(inRegion ? doc : 'before Text after');
      }
    });

    it('accepted §4.4 consequence: siblings inside an engaged ancestor also render as source', () => {
      const doc = 'x ~~**a** and **b**~~ y';
      const insideA = doc.indexOf('a', doc.indexOf('**'));

      const view = mountViewWithSelection(doc, insideA);

      // The caret is inside `**a**`, which is inside the Strikethrough —
      // so the whole Strikethrough region reveals, `**b**` included.
      expect(view.dom.textContent).toBe(doc);
    });
  });

  // ===================================================================
  // ODR §9.4 — INVARIANT: cross-region independence
  // ===================================================================
  describe('INVARIANT: separate regions resolve independently of one another', () => {
    it('engaging one region leaves an unrelated region concealed', () => {
      const doc = 'a ~~__one__~~ b ~~__two__~~ c';
      const firstRegion = doc.indexOf('~~__one__~~');

      const view = mountViewWithSelection(doc, firstRegion + 1);

      expect(view.dom.textContent).toBe('a ~~__one__~~ b two c');
    });

    it('an unrelated plain construct still renders after a separate nested construct', () => {
      const view = mountViewWithSelection('Before ~~***nested***~~ middle **plain** after', 0);

      expect(view.dom.textContent).toBe('Before nested middle plain after');
      const strong = Array.from(view.dom.querySelectorAll('.tok-strong'));
      expect(strong.some((el) => el.textContent === 'plain')).toBe(true);
    });
  });

  // ===================================================================
  // ODR §9.6 — INVARIANT: no stored visibility state
  // ===================================================================
  describe('INVARIANT: visibility is recomputed from selection + tree, never stored', () => {
    it('the same region reveals, conceals, and reveals again as the selection moves', () => {
      const doc = 'before ~~__Text__~~ after';
      const view = mountView(doc);
      const regionFrom = doc.indexOf('~~__Text__~~');

      view.dispatch({ selection: { anchor: 0 } });
      expect(view.dom.textContent).toBe('before Text after');

      view.dispatch({ selection: { anchor: regionFrom + 2 } });
      expect(view.dom.textContent).toBe(doc);

      view.dispatch({ selection: { anchor: doc.length } });
      expect(view.dom.textContent).toBe('before Text after');

      view.dispatch({ selection: { anchor: regionFrom } });
      expect(view.dom.textContent).toBe(doc);
    });
  });

  // ===================================================================
  // Migrated behavioral coverage — single (non-nested) constructs
  // ===================================================================
  describe('*text* (Emphasis)', () => {
    it('at rest, the * markers have no DOM presence — not merely hidden', () => {
      const view = mountView('Text before *italic* after');

      expect(view.dom.textContent).toBe('Text before italic after');
      expect(view.dom.textContent).not.toContain('*');
    });

    it('renders the content italic at rest', () => {
      expect(mountView('Text before *italic* after').dom.querySelector('.tok-emphasis')?.textContent).toBe('italic');
    });

    it('_text_: same behavior with underscores', () => {
      const view = mountView('Text before _italic_ after');

      expect(view.dom.textContent).toBe('Text before italic after');
      expect(view.dom.querySelector('.tok-emphasis')?.textContent).toBe('italic');
    });

    it('reveals the raw *…* text once the selection is inside it, then re-collapses when it leaves', () => {
      const view = mountView('Before *italic* after');

      view.dispatch({ selection: { anchor: 10 } });
      expect(view.dom.textContent).toContain('*italic*');
      expect(view.dom.querySelector('.tok-emphasis')).toBeNull();

      view.dispatch({ selection: { anchor: 0 } });
      expect(view.dom.textContent).not.toContain('*');
      expect(view.dom.querySelector('.tok-emphasis')).not.toBeNull();
    });

    it('does not decorate **bold** as italic', () => {
      expect(mountView('Text with **bold** only').dom.querySelector('.tok-emphasis')).toBeNull();
    });

    it('boundary-after-completion: caret at node.from/node.to stays revealed, one further out conceals', () => {
      const doc = 'Text before *italic* after';
      const nodeFrom = 'Text before '.length;
      const nodeTo = 'Text before *italic*'.length;

      expect(mountViewWithSelection(doc, nodeFrom).dom.textContent).toBe(doc);
      expect(mountViewWithSelection(doc, nodeTo).dom.textContent).toBe(doc);
      expect(mountViewWithSelection(doc, nodeFrom - 1).dom.textContent).toBe('Text before italic after');
      expect(mountViewWithSelection(doc, nodeTo + 1).dom.textContent).toBe('Text before italic after');
    });
  });

  describe('**text** (StrongEmphasis)', () => {
    it('at rest, the ** markers have no DOM presence at all — not merely hidden', () => {
      const view = mountView('Text before **hello** after');

      expect(view.dom.textContent).toBe('Text before hello after');
      expect(view.dom.textContent).not.toContain('*');
    });

    it('renders the content bold at rest', () => {
      expect(mountView('Text before **hello** after').dom.querySelector('.tok-strong')?.textContent).toBe('hello');
    });

    it('reveals the raw **…** text once the selection is inside it, then re-collapses when it leaves', () => {
      const view = mountView('Before **hello** after');

      view.dispatch({ selection: { anchor: 10 } });
      expect(view.dom.textContent).toContain('**hello**');
      expect(view.dom.querySelector('.tok-strong')).toBeNull();

      view.dispatch({ selection: { anchor: 0 } });
      expect(view.dom.textContent).not.toContain('*');
      expect(view.dom.querySelector('.tok-strong')).not.toBeNull();
    });

    it('does not decorate ordinary single-* emphasis as bold', () => {
      expect(mountView('Text with *italic* only').dom.querySelector('.tok-strong')).toBeNull();
    });

    it('boundary-after-completion: caret at node.from/node.to stays revealed, one further out conceals', () => {
      const doc = 'Text before **bold** after';
      const nodeFrom = 'Text before '.length;
      const nodeTo = 'Text before **bold**'.length;

      expect(mountViewWithSelection(doc, nodeFrom).dom.textContent).toBe(doc);
      expect(mountViewWithSelection(doc, nodeTo).dom.textContent).toBe(doc);
      expect(mountViewWithSelection(doc, nodeFrom - 1).dom.textContent).toBe('Text before bold after');
      expect(mountViewWithSelection(doc, nodeTo + 1).dom.textContent).toBe('Text before bold after');
    });
  });

  describe('~~text~~ (Strikethrough)', () => {
    it('at rest, the ~~ markers have no DOM presence at all — not merely hidden', () => {
      const view = mountView('Text before ~~struck~~ after');

      expect(view.dom.textContent).toBe('Text before struck after');
      expect(view.dom.textContent).not.toContain('~');
    });

    it('renders the content struck-through at rest', () => {
      expect(mountView('Text before ~~struck~~ after').dom.querySelector('.tok-strike')?.textContent).toBe('struck');
    });

    it('multi-word content behaves the same', () => {
      const view = mountView('before ~~Text with several words~~ after');

      expect(view.dom.textContent).toBe('before Text with several words after');
      expect(view.dom.querySelector('.tok-strike')?.textContent).toBe('Text with several words');
    });

    it('reveals the raw ~~…~~ text once the selection is inside it, then re-collapses when it leaves', () => {
      const view = mountView('Before ~~struck~~ after');

      view.dispatch({ selection: { anchor: 10 } });
      expect(view.dom.textContent).toContain('~~struck~~');
      expect(view.dom.querySelector('.tok-strike')).toBeNull();

      view.dispatch({ selection: { anchor: 0 } });
      expect(view.dom.textContent).not.toContain('~');
      expect(view.dom.querySelector('.tok-strike')).not.toBeNull();
    });

    it('boundary-after-completion: caret at node.from/node.to stays revealed, one further out conceals', () => {
      const doc = 'Text before ~~struck~~ after';
      const nodeFrom = 'Text before '.length;
      const nodeTo = 'Text before ~~struck~~'.length;

      expect(mountViewWithSelection(doc, nodeFrom).dom.textContent).toBe(doc);
      expect(mountViewWithSelection(doc, nodeTo).dom.textContent).toBe(doc);
      expect(mountViewWithSelection(doc, nodeFrom - 1).dom.textContent).toBe('Text before struck after');
      expect(mountViewWithSelection(doc, nodeTo + 1).dom.textContent).toBe('Text before struck after');
    });
  });

  describe('bold, italic, and strikethrough together but not nested: each resolves separately', () => {
    it('renders separately, each with its own class', () => {
      const view = mountViewWithSelection('Text with **bold** and *italic* and ~~struck~~ together', 0);

      expect(view.dom.textContent).toBe('Text with bold and italic and struck together');
      expect(view.dom.querySelector('.tok-strong')?.textContent).toBe('bold');
      expect(view.dom.querySelector('.tok-emphasis')?.textContent).toBe('italic');
      expect(view.dom.querySelector('.tok-strike')?.textContent).toBe('struck');
    });
  });

  // ===================================================================
  // Migrated parser-confirmed cases (from strikethroughLivePreview.test.ts)
  // ===================================================================
  describe('parser-confirmed non-construct cases: nothing is decorated', () => {
    it('whitespace-adjacent delimiters never form a Strikethrough', () => {
      for (const doc of ['before ~~ Text ~~ after', 'before ~~Text ~~ after', 'before ~~ Text~~ after']) {
        const view = mountViewWithSelection(doc, 0);
        expect(view.dom.textContent).toBe(doc);
        expect(view.dom.querySelector('.tok-strike')).toBeNull();
      }
    });

    it('~Text~ (single tilde) is never a Strikethrough delimiter', () => {
      const view = mountViewWithSelection('before ~Text~ after', 0);
      expect(view.dom.textContent).toBe('before ~Text~ after');
      expect(view.dom.querySelector('.tok-strike')).toBeNull();
    });

    it('line-start tilde runs of 3+ are FencedCode, never Strikethrough', () => {
      for (const doc of ['~~~Text~~~', '~~~~Text~~~~', '~~~~~~Text~~~~~~']) {
        expect(mountView(doc).dom.querySelector('.tok-strike')).toBeNull();
      }
    });

    it('mid-line long tilde runs: leftover tildes stay literal on both sides', () => {
      const view = mountViewWithSelection('before ~~~~Text~~~~ after', 0);

      expect(view.dom.textContent).toBe('before ~~Text~~ after');
      expect(view.dom.querySelector('.tok-strike')?.textContent).toBe('Text~~');
    });

    it('~~Text~~~~More~~: only "~~More~~" forms a node; the leading run stays unwrapped literal text', () => {
      const view = mountViewWithSelection('~~Text~~~~More~~', 0);

      expect(view.dom.textContent).toBe('~~Text~~More');
      const spans = Array.from(view.dom.querySelectorAll('.tok-strike'));
      expect(spans).toHaveLength(1);
      expect(spans[0]?.textContent).toBe('More');
    });

    it('soft-wrapped ~~one\\ntwo~~ spans the line break within one paragraph', () => {
      const view = mountViewWithSelection('before ~~one\ntwo~~ after', 0);

      expect(view.dom.textContent).toBe('before onetwo after');
      const spans = Array.from(view.dom.querySelectorAll('.tok-strike'));
      expect(spans.map((el) => el.textContent)).toEqual(['one', 'two']);
    });
  });

  describe('non-qualifying outer constructs: the inner construct still resolves on its own', () => {
    it('* **Text** * — leading "* " is a list item, not Emphasis', () => {
      const view = mountViewWithSelection('* **Text** *', 12);

      expect(view.dom.querySelector('.tok-strong')?.textContent).toBe('Text');
      expect(view.dom.textContent).toContain('*');
    });

    it('** *Text* ** — outer ** fails flanking rules and stays literal', () => {
      const view = mountViewWithSelection('** *Text* **', 0);

      expect(view.dom.querySelector('.tok-emphasis')?.textContent).toBe('Text');
      expect(view.dom.textContent).toContain('**');
    });
  });

  // ===================================================================
  // Migrated core invariants
  // ===================================================================
  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as markers collapse/reveal', () => {
      const text = 'Text before **hello** and *italic* and ~~struck~~ after';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 20 } });
      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 0 } });
      expect(view.state.doc.toString()).toBe(text);
    });

    it('a selection placed inside an at-rest collapsed range is not atomic — it lands exactly there, unmoved', () => {
      const view = mountView('Text before **hello** after');

      // 'Text before ' = 12 chars, opening '**' occupies [12, 14).
      view.dispatch({ selection: { anchor: 13 } });

      expect(view.state.selection.main.head).toBe(13);
      expect(view.state.selection.main.anchor).toBe(13);
    });

    it('does not affect plain text with no formatting', () => {
      expect(mountView('Just plain text, nothing to hide.').dom.textContent).toBe(
        'Just plain text, nothing to hide.'
      );
    });
  });

  // ===================================================================
  // ODR §9.7 — known limitation, pinned separately, deliberately unsolved
  // ===================================================================
  describe('known, deferred limitation: whole-document construct at the real initial cursor position', () => {
    // createEditorView.ts seeds the initial selection at doc.length. When a
    // construct's range *is* the whole document, that boundary is inclusive,
    // so it loads revealed. Unrelated to nesting; not solved here (ODR §7.1).
    it('a construct spanning the entire document stays revealed at either end', () => {
      for (const doc of ['**Hey**', '*italic*', '~~Hey~~']) {
        expect(mountViewWithSelection(doc, doc.length).dom.textContent).toBe(doc);
        expect(mountViewWithSelection(doc, 0).dom.textContent).toBe(doc);
      }
    });
  });

  describe('node shape', () => {
    it('each participant parses with exactly two same-named delimiter children', () => {
      const language = markdownLanguageExtension().language;
      const cases: [string, string, string][] = [
        ['*italic*', 'Emphasis', 'EmphasisMark'],
        ['**bold**', 'StrongEmphasis', 'EmphasisMark'],
        ['~~struck~~', 'Strikethrough', 'StrikethroughMark'],
      ];

      for (const [source, nodeName, markName] of cases) {
        const cursor = language.parser.parse(source).cursor();
        let found = false;

        function visit() {
          if (cursor.name === nodeName) {
            found = true;
            const node = cursor.node;
            expect(node.firstChild?.name).toBe(markName);
            expect(node.lastChild?.name).toBe(markName);
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

        expect(found, `${nodeName} not found in ${source}`).toBe(true);
      }
    });
  });
});
