// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { emphasisLivePreview } from './emphasisLivePreview';

/**
 * Mirrors the mounting style of the retired boldLivePreview.test.ts /
 * italicLivePreview.test.ts: mount a real EditorView in jsdom and inspect
 * rendered DOM/state rather than asserting on the decoration set directly.
 */
function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), emphasisLivePreview()],
  });
  return new EditorView({ state, parent });
}

function mountViewWithSelection(doc: string, anchor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdownLanguageExtension(), emphasisLivePreview()],
  });
  return new EditorView({ state, parent });
}

describe('emphasisLivePreview', () => {
  describe('*text* (Emphasis)', () => {
    it('at rest, the * markers have no DOM presence — not merely hidden', () => {
      const view = mountView('Text before *italic* after');

      expect(view.dom.textContent).toBe('Text before italic after');
      expect(view.dom.textContent).not.toContain('*');
    });

    it('renders the content italic at rest', () => {
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

    it('does not decorate **bold** as italic', () => {
      const view = mountView('Text with **bold** only');

      // emphasisLivePreview matches StrongEmphasis itself for **bold**, so
      // this only confirms italic's own class isn't applied to it.
      expect(view.dom.querySelector('.tok-emphasis')).toBeNull();
    });

    describe('boundary-after-completion', () => {
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
    });
  });

  describe('**text** (StrongEmphasis)', () => {
    it('at rest, the ** markers have no DOM presence at all — not merely hidden', () => {
      const view = mountView('Text before **hello** after');

      expect(view.dom.textContent).toBe('Text before hello after');
      expect(view.dom.textContent).not.toContain('*');
    });

    it('renders the content bold at rest', () => {
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

    it('does not decorate ordinary single-* emphasis as bold', () => {
      const view = mountView('Text with *italic* only');

      expect(view.dom.querySelector('.tok-strong')).toBeNull();
    });

    describe('boundary-after-completion', () => {
      it('caret at node.to (right after typing the closing **) stays revealed', () => {
        const doc = 'Text before **bold** after';
        const nodeTo = 'Text before **bold**'.length;
        const view = mountViewWithSelection(doc, nodeTo);

        expect(view.dom.textContent).toBe('Text before **bold** after');
        expect(view.dom.querySelector('.tok-strong')).toBeNull();
      });

      it('caret at node.from (right before the opening **) stays revealed', () => {
        const doc = 'Text before **bold** after';
        const nodeFrom = 'Text before '.length;
        const view = mountViewWithSelection(doc, nodeFrom);

        expect(view.dom.textContent).toBe('Text before **bold** after');
      });

      it('caret one position further out on either side conceals normally', () => {
        const doc = 'Text before **bold** after';
        const nodeFrom = 'Text before '.length;
        const nodeTo = 'Text before **bold**'.length;

        const viewBefore = mountViewWithSelection(doc, nodeFrom - 1);
        expect(viewBefore.dom.textContent).toBe('Text before bold after');

        const viewAfter = mountViewWithSelection(doc, nodeTo + 1);
        expect(viewAfter.dom.textContent).toBe('Text before bold after');
      });
    });
  });

  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as markers collapse/reveal', () => {
      const text = 'Text before **hello** and *italic* after';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);

      view.dispatch({ selection: { anchor: 20 } }); // engage
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

    it('does not affect plain text with no emphasis', () => {
      const view = mountView('Just plain text, nothing to hide.');

      expect(view.dom.textContent).toBe('Just plain text, nothing to hide.');
    });
  });

  describe('bold and italic both present: each concealed/styled independently when not nested', () => {
    it('renders separately, each with its own class', () => {
      const view = mountView('Text with **bold** and *italic* together');

      expect(view.dom.textContent).toBe('Text with bold and italic together');
      expect(view.dom.querySelector('.tok-strong')?.textContent).toBe('bold');
      expect(view.dom.querySelector('.tok-emphasis')?.textContent).toBe('italic');
    });

    it('an independent, unrelated *plain* italic elsewhere still renders after a separate nested construct', () => {
      const view = mountView('Before ***nested*** middle *plain* after');

      expect(view.dom.textContent).toBe('Before nested middle plain after');
      const em = Array.from(view.dom.querySelectorAll('.tok-emphasis'));
      expect(em.some((el) => el.textContent === 'plain')).toBe(true);
    });
  });

  describe('combined region: ***Text*** / ___Text___ (Emphasis > StrongEmphasis)', () => {
    it('***Text***: does not crash mounting the view', () => {
      expect(() => mountView('Text before ***Text*** after')).not.toThrow();
    });

    it('___Text___: does not crash mounting the view', () => {
      expect(() => mountView('Text before ___Text___ after')).not.toThrow();
    });

    it('at rest, all four markers are concealed and content is both bold and italic', () => {
      const view = mountView('Text before ***Text*** after');

      expect(view.dom.textContent).toBe('Text before Text after');
      expect(view.dom.textContent).not.toContain('*');

      const strong = view.dom.querySelector('.tok-strong');
      const emphasis = view.dom.querySelector('.tok-emphasis');
      expect(strong?.textContent).toBe('Text');
      expect(emphasis?.textContent).toBe('Text');
    });

    it('___Text___: same combined-at-rest behavior with underscores', () => {
      const view = mountView('Text before ___Text___ after');

      expect(view.dom.textContent).toBe('Text before Text after');
      expect(view.dom.textContent).not.toContain('_');
      expect(view.dom.querySelector('.tok-strong')?.textContent).toBe('Text');
      expect(view.dom.querySelector('.tok-emphasis')?.textContent).toBe('Text');
    });

    it('caret at outer node.from: all four markers reveal together atomically (no partial *|**Text** state)', () => {
      const doc = 'Text before ***Text*** after';
      const nodeFrom = 'Text before '.length;
      const view = mountViewWithSelection(doc, nodeFrom);

      expect(view.dom.textContent).toBe(doc);
      expect(view.dom.querySelector('.tok-strong')).toBeNull();
      expect(view.dom.querySelector('.tok-emphasis')).toBeNull();
    });

    it('caret at outer node.to: all four markers reveal together atomically (no partial **Text**|* state)', () => {
      const doc = 'Text before ***Text*** after';
      const nodeTo = 'Text before ***Text***'.length;
      const view = mountViewWithSelection(doc, nodeTo);

      expect(view.dom.textContent).toBe(doc);
      expect(view.dom.querySelector('.tok-strong')).toBeNull();
      expect(view.dom.querySelector('.tok-emphasis')).toBeNull();
    });

    it('caret anywhere inside the inner content: fully revealed', () => {
      const doc = 'Text before ***Text*** after';
      const view = mountViewWithSelection(doc, doc.indexOf('Text', 'Text before ***'.length) + 2);

      expect(view.dom.textContent).toBe(doc);
    });

    it('caret one position outside either edge: fully concealed, combined styling', () => {
      const doc = 'Text before ***Text*** after';
      const nodeFrom = 'Text before '.length;
      const nodeTo = 'Text before ***Text***'.length;

      const before = mountViewWithSelection(doc, nodeFrom - 1);
      expect(before.dom.textContent).toBe('Text before Text after');

      const after = mountViewWithSelection(doc, nodeTo + 1);
      expect(after.dom.textContent).toBe('Text before Text after');
    });

    it('the document text is never mutated by mounting or decorating the combined construct', () => {
      const text = 'Text before ***Text*** after';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);
    });
  });

  describe('combined region: **_Text_** / __*Text*__ (StrongEmphasis > Emphasis)', () => {
    it('**_Text_**: at rest, all four markers concealed, content both bold and italic', () => {
      const view = mountView('Text before **_Text_** after');

      expect(view.dom.textContent).toBe('Text before Text after');
      expect(view.dom.querySelector('.tok-strong')?.textContent).toBe('Text');
      expect(view.dom.querySelector('.tok-emphasis')?.textContent).toBe('Text');
    });

    it('__*Text*__: at rest, all four markers concealed, content both bold and italic', () => {
      const view = mountView('Text before __*Text*__ after');

      expect(view.dom.textContent).toBe('Text before Text after');
      expect(view.dom.querySelector('.tok-strong')?.textContent).toBe('Text');
      expect(view.dom.querySelector('.tok-emphasis')?.textContent).toBe('Text');
    });

    it('**_Text_**: caret at outer node.from reveals atomically', () => {
      const doc = 'Text before **_Text_** after';
      const nodeFrom = 'Text before '.length;
      const view = mountViewWithSelection(doc, nodeFrom);

      expect(view.dom.textContent).toBe(doc);
    });

    it('**_Text_**: caret at outer node.to reveals atomically', () => {
      const doc = 'Text before **_Text_** after';
      const nodeTo = 'Text before **_Text_**'.length;
      const view = mountViewWithSelection(doc, nodeTo);

      expect(view.dom.textContent).toBe(doc);
    });

    it('__*Text*__: caret at outer node.from reveals atomically', () => {
      const doc = 'Text before __*Text*__ after';
      const nodeFrom = 'Text before '.length;
      const view = mountViewWithSelection(doc, nodeFrom);

      expect(view.dom.textContent).toBe(doc);
    });

    it('__*Text*__: caret at outer node.to reveals atomically', () => {
      const doc = 'Text before __*Text*__ after';
      const nodeTo = 'Text before __*Text*__'.length;
      const view = mountViewWithSelection(doc, nodeTo);

      expect(view.dom.textContent).toBe(doc);
    });
  });

  describe('same-kind nested StrongEmphasis: ****Text**** (a 4+-star delimiter run)', () => {
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
      const boldSpans = Array.from(view.dom.querySelectorAll('.tok-strong'));
      expect(boldSpans.some((el) => el.textContent === 'plain')).toBe(true);
      expect(boldSpans.every((el) => el.textContent === 'nested' || el.textContent === 'plain')).toBe(true);
    });

    it('the document text is never mutated by mounting or decorating the nested construct', () => {
      const text = 'Text before ****strong**** after';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);
    });

    it('caret at outer node.to now reveals both levels together atomically (supersedes the old partial-reveal limitation)', () => {
      const doc = 'Text before ****Hey**** after';
      const nodeTo = 'Text before ****Hey****'.length;
      const view = mountViewWithSelection(doc, nodeTo);

      expect(view.dom.textContent).toBe(doc);
    });

    it('caret at outer node.from also reveals both levels together atomically', () => {
      const doc = 'Text before ****Hey**** after';
      const nodeFrom = 'Text before '.length;
      const view = mountViewWithSelection(doc, nodeFrom);

      expect(view.dom.textContent).toBe(doc);
    });
  });

  describe('same-kind nested Emphasis via mixed delimiter characters (_*a*_ and *_a_*)', () => {
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
      expect(spans.some((el) => el.textContent === 'plain')).toBe(true);
      expect(spans.every((el) => el.textContent === 'nested' || el.textContent === 'plain')).toBe(true);
    });

    it('the document text is never mutated by mounting or decorating the nested construct', () => {
      const text = 'Text before _*a*_ after';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);
    });

    it('_*a*_: caret at outer node.to now reveals both levels together atomically (supersedes the old partial-reveal limitation)', () => {
      const doc = 'Text before _*a*_ after';
      const nodeTo = 'Text before _*a*_'.length;
      const view = mountViewWithSelection(doc, nodeTo);

      expect(view.dom.textContent).toBe(doc);
    });
  });

  describe('deeper chain: *****Text***** (Emphasis > StrongEmphasis > StrongEmphasis)', () => {
    it('does not crash mounting the view', () => {
      expect(() => mountView('Text before *****Text***** after')).not.toThrow();
    });

    it('at rest, all three levels are concealed and content carries both classes', () => {
      const view = mountView('Text before *****Text***** after');

      expect(view.dom.textContent).toBe('Text before Text after');
      expect(view.dom.textContent).not.toContain('*');
      expect(view.dom.querySelector('.tok-strong')?.textContent).toBe('Text');
      expect(view.dom.querySelector('.tok-emphasis')?.textContent).toBe('Text');
    });

    it('caret anywhere within the chain reveals all three levels atomically', () => {
      const doc = 'Text before *****Text***** after';
      const nodeTo = 'Text before *****Text*****'.length;
      const view = mountViewWithSelection(doc, nodeTo);

      expect(view.dom.textContent).toBe(doc);
    });

    it('caret at outer node.from reveals all three levels atomically', () => {
      const doc = 'Text before *****Text***** after';
      const nodeFrom = 'Text before '.length;
      const view = mountViewWithSelection(doc, nodeFrom);

      expect(view.dom.textContent).toBe(doc);
    });

    it('the document text is never mutated', () => {
      const text = 'Text before *****Text***** after';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);
    });
  });

  describe('non-qualifying cases: no outer construct exists, so no combined behavior applies', () => {
    it('* **Text** * — leading "* " is parsed as a list item, not Emphasis; the inner StrongEmphasis still behaves independently', () => {
      const view = mountView('* **Text** *');

      expect(view.dom.querySelector('.tok-strong')?.textContent).toBe('Text');
      // The trailing " *" is unmatched literal text, never becomes an EmphasisMark.
      expect(view.dom.textContent).toContain('*');
    });

    it('** *Text* ** — outer ** fails CommonMark flanking rules (space-adjacent) and stays literal; inner Emphasis behaves independently', () => {
      const view = mountView('** *Text* **');

      const em = view.dom.querySelector('.tok-emphasis');
      expect(em?.textContent).toBe('Text');
      expect(view.dom.textContent).toContain('**');
    });
  });

  describe('known, deferred limitation: whole-document construct at the real initial cursor position', () => {
    // createEditorView.ts always seeds the initial selection at doc.length.
    // When a construct's own range coincides with doc.length (or with
    // position 0) -- i.e. the construct is the *entire* reachable document
    // -- the full-range engagement rule reads that boundary as "inside," so
    // the construct loads permanently revealed until the user clicks
    // elsewhere. Unrelated to nesting; carried over unchanged from
    // boldLivePreview.test.ts / italicLivePreview.test.ts.
    it('plain **Hey** as the entire document, caret at doc.length: stays revealed (known limitation)', () => {
      const doc = '**Hey**';
      const view = mountViewWithSelection(doc, doc.length);

      expect(view.dom.textContent).toBe('**Hey**');
    });

    it('plain **Hey** as the entire document, caret at 0: stays revealed (known limitation)', () => {
      const doc = '**Hey**';
      const view = mountViewWithSelection(doc, 0);

      expect(view.dom.textContent).toBe('**Hey**');
    });

    it('plain *italic* as the entire document, caret at doc.length: stays revealed (known limitation)', () => {
      const doc = '*italic*';
      const view = mountViewWithSelection(doc, doc.length);

      expect(view.dom.textContent).toBe('*italic*');
    });

    it('plain *italic* as the entire document, caret at 0: stays revealed (known limitation)', () => {
      const doc = '*italic*';
      const view = mountViewWithSelection(doc, 0);

      expect(view.dom.textContent).toBe('*italic*');
    });
  });
});
