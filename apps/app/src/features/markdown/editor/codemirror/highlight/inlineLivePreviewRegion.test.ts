// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import type { ResolveDate } from '../date/dateResolution';
import { markdownLanguageExtension } from '../markdownLanguage';
import type { ResolveTag } from '../tag/tagResolution';
import { createInlineLivePreviewParticipants, type ParticipantResolvers } from './inlineLivePreviewParticipants';
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
/** No resolver injected — matches every existing test's assumption of fallback resolution unless a test explicitly supplies one. */
const noResolvers: ParticipantResolvers = {
  resolveWikiLink: () => undefined,
  resolveTag: () => undefined,
  resolveDate: () => undefined,
};

function mountView(doc: string, resolvers: ParticipantResolvers = noResolvers): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), inlineLivePreviewRegion(createInlineLivePreviewParticipants(resolvers))],
  });
  return new EditorView({ state, parent });
}

function mountViewWithSelection(
  doc: string,
  anchor: number,
  resolvers: ParticipantResolvers = noResolvers
): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdownLanguageExtension(), inlineLivePreviewRegion(createInlineLivePreviewParticipants(resolvers))],
  });
  return new EditorView({ state, parent });
}

/**
 * What a user actually sees, as opposed to `visibleText(view)` — which,
 * per the inline marker DOM migration (docs/markdown-dom-structure-
 * agreement.md §7), is no longer a valid proxy for that. Migrated markers
 * (Emphasis/StrongEmphasis/Strikethrough/Highlight/InlineCode) now keep
 * their real marker text in the DOM at rest, concealed only via
 * `cm-marker--concealed`'s `font-size: 0` (`inlineLivePreviewParticipants.ts`),
 * not via removal — so `textContent` alone can no longer distinguish
 * concealed from revealed the way it could when concealment meant
 * `Decoration.replace({})`. This walks the DOM the same way, but skips the
 * text of any element carrying `cm-marker--concealed`, mirroring what a
 * real browser actually renders. Every test below that means "what is
 * visually shown" uses this instead of raw `textContent`; a test that
 * specifically wants the underlying document text uses `view.state.doc`,
 * unaffected by any of this. Matches the assertion strategy
 * `blockquoteMarkerDecoration.test.ts` already established for the same
 * real-text-but-concealed pattern (there: assert via `--concealed` class
 * presence rather than `textContent` exclusion) — this is the same idea
 * generalized into one reusable text-extraction helper, since here
 * (unlike blockquote) many tests need to combine concealed-marker
 * awareness with content-level assertions across nested constructs.
 */
function visibleText(target: EditorView | Node | null | undefined): string {
  if (!target) {
    return '';
  }
  const root: Node = 'dom' in target ? target.dom : target;
  let result = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).classList.contains('cm-marker--concealed')) {
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? '';
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(root);
  return result;
}

/** Mirrors the "includes range in EditorView.atomicRanges" check the retired wikiLinkDecorations.test.ts/tagDecorations.test.ts/dateDecorations.test.ts each defined identically. */
function isAtomicAnywhere(view: EditorView): boolean {
  const atomicProviders = view.state.facet(EditorView.atomicRanges);
  return atomicProviders.some((provider) => {
    const rangeSet = provider(view);
    let found = false;
    rangeSet.between(0, view.state.doc.length, () => {
      found = true;
    });
    return found;
  });
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
  expect(visibleText(atRest)).not.toBe(padded);

  for (let pos = regionFrom; pos <= regionTo; pos++) {
    const view = mountViewWithSelection(padded, pos);
    expect(
      visibleText(view),
      `caret at ${pos} (offset ${pos - regionFrom} into the region) must reveal the whole region as source`
    ).toBe(padded);
  }

  // One position beyond either edge: the whole region conceals again.
  const before = mountViewWithSelection(padded, regionFrom - 1);
  expect(visibleText(before)).toBe(visibleText(atRest));
  const after = mountViewWithSelection(padded, regionTo + 1);
  expect(visibleText(after)).toBe(visibleText(atRest));
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

    it('~~==Text==~~ — Phase 2: Highlight nested inside Strikethrough', () => {
      expectRegionRevealsAtomicallyThroughout('before ~~==Text==~~ after', '~~==Text==~~');
    });

    it('==**Text**== — Phase 2: StrongEmphasis nested inside Highlight', () => {
      expectRegionRevealsAtomicallyThroughout('before ==**Text**== after', '==**Text**==');
    });

    it('**`Text`** — Phase 2: InlineCode nested inside StrongEmphasis (InlineCode can be a child but, per its terminal shape, never a parent)', () => {
      expectRegionRevealsAtomicallyThroughout('before **`Text`** after', '**`Text`**');
    });

    it('***~~`Text`~~*** — the 4-level chain (Emphasis > StrongEmphasis > Strikethrough > InlineCode), all four current participants in one region', () => {
      expectRegionRevealsAtomicallyThroughout('before ***~~`Text`~~*** after', '***~~`Text`~~***');
    });

    // WikiLink's own region-atomicity coverage moved to
    // wikiLinkLivePreview.test.ts — WikiLink is no longer a participant of
    // this mechanism (see inlineLivePreviewParticipants.ts's doc comment),
    // so "the whole region renders as literal source" no longer describes
    // its engaged behavior. Tag/Date remain participants and keep that
    // exact contract unchanged; representative coverage for the
    // widget-replace family in this INVARIANT block continues via them
    // elsewhere in this file.
  });

  // ===================================================================
  // ODR §9.2 — INVARIANT: disengagement independence
  // ===================================================================
  describe('INVARIANT: outside the region root, every level conceals independently', () => {
    it('a nested region fully conceals when the caret is elsewhere in the document', () => {
      const view = mountViewWithSelection('before ~~__Text__~~ after', 0);

      expect(visibleText(view)).toBe('before Text after');
      expect(visibleText(view)).not.toMatch(/[~_]/);
    });

    it('every participating level applied its own content class at rest', () => {
      const view = mountViewWithSelection('before ~~__Text__~~ after', 0);

      expect(visibleText(view.dom.querySelector('.tok-strike'))).toBe('Text');
      expect(visibleText(view.dom.querySelector('.tok-strong'))).toBe('Text');
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
        const text = visibleText(mountViewWithSelection(doc, pos));
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
      expect(visibleText(view)).toBe(doc);
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

      expect(visibleText(view)).toBe('a ~~__one__~~ b two c');
    });

    it('an unrelated plain construct still renders after a separate nested construct', () => {
      const view = mountViewWithSelection('Before ~~***nested***~~ middle **plain** after', 0);

      expect(visibleText(view)).toBe('Before nested middle plain after');
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
      expect(visibleText(view)).toBe('before Text after');

      view.dispatch({ selection: { anchor: regionFrom + 2 } });
      expect(visibleText(view)).toBe(doc);

      view.dispatch({ selection: { anchor: doc.length } });
      expect(visibleText(view)).toBe('before Text after');

      view.dispatch({ selection: { anchor: regionFrom } });
      expect(visibleText(view)).toBe(doc);
    });
  });

  // ===================================================================
  // Engaged nested marker representation (inline marker DOM migration,
  // docs/markdown-dom-structure-agreement.md §7 — nested-marker fix)
  //
  // Regression coverage for the confirmed bug: previously, an engaged
  // region only ever represented the region root's own two marks
  // (`ENGAGED_MARKER_RENDERERS`, one node lookup) — any nested
  // marker-contract construct's marks were simply never visited, so
  // `***bold italic***` engaged rendered as `*` + raw `**bold italic**`
  // text instead of independently-styleable `*` + `**` marker spans.
  // `revealedMarkerRanges` fixes this via one subtree walk over the
  // engaged region, scoped to the same five marker-contract constructs
  // (Emphasis/StrongEmphasis/Strikethrough/Highlight/InlineCode) already
  // covered by the at-rest marker DOM, with zero combination-specific
  // logic: nesting depth and construct kind are never branched on, only
  // read from the tree.
  // ===================================================================
  describe('INVARIANT: an engaged region represents every nested marker, not just the region root\'s own', () => {
    /** All `.cm-marker` spans in document order, with their construct-specific class and concealed-or-not state — DOM-order is also open/close pair order, since markers never reorder relative to their own document position. */
    function markerSpans(view: EditorView): { text: string; cls: string; concealed: boolean }[] {
      return Array.from(view.dom.querySelectorAll('.cm-marker')).map((el) => ({
        text: el.textContent ?? '',
        cls: Array.from(el.classList).find((c) => c.startsWith('cm-') && c !== 'cm-marker' && c !== 'cm-marker--concealed') ?? '',
        concealed: el.classList.contains('cm-marker--concealed'),
      }));
    }

    it('***bold italic*** — the exact reported bug: engaged reveals both the outer Emphasis and the nested StrongEmphasis markers', () => {
      const doc = 'x ***bold italic*** y';
      const mid = doc.indexOf('bold');

      const rest = mountView(doc);
      expect(markerSpans(rest)).toEqual([
        { text: '*', cls: 'cm-emphasis-marker', concealed: true },
        { text: '**', cls: 'cm-strong-marker', concealed: true },
        { text: '**', cls: 'cm-strong-marker', concealed: true },
        { text: '*', cls: 'cm-emphasis-marker', concealed: true },
      ]);

      const engaged = mountViewWithSelection(doc, mid);
      // Every marker present, none concealed — this is the fixed shape,
      // not the pre-fix `*` ... raw "**bold italic**" ... `*`.
      expect(markerSpans(engaged)).toEqual([
        { text: '*', cls: 'cm-emphasis-marker', concealed: false },
        { text: '**', cls: 'cm-strong-marker', concealed: false },
        { text: '**', cls: 'cm-strong-marker', concealed: false },
        { text: '*', cls: 'cm-emphasis-marker', concealed: false },
      ]);
      // Content stays completely raw/unclassed while engaged — no tok-*
      // decoration was introduced by the nested-marker fix.
      expect(engaged.dom.querySelector('.tok-emphasis, .tok-strong')).toBeNull();
      expect(visibleText(engaged)).toBe(doc);
    });

    it('~~***bold _italic_ `code`***~~ — four-level nesting resolves via the same mechanism, no combination-specific logic', () => {
      const doc = '~~***bold _italic_ `code`***~~';
      const midOfItalic = doc.indexOf('italic');

      const engaged = mountViewWithSelection(doc, midOfItalic);
      expect(markerSpans(engaged)).toEqual([
        { text: '~~', cls: 'cm-strike-marker', concealed: false },
        { text: '*', cls: 'cm-emphasis-marker', concealed: false },
        { text: '**', cls: 'cm-strong-marker', concealed: false },
        { text: '_', cls: 'cm-emphasis-marker', concealed: false },
        { text: '_', cls: 'cm-emphasis-marker', concealed: false },
        { text: '`', cls: 'cm-code-marker', concealed: false },
        { text: '`', cls: 'cm-code-marker', concealed: false },
        { text: '**', cls: 'cm-strong-marker', concealed: false },
        { text: '*', cls: 'cm-emphasis-marker', concealed: false },
        { text: '~~', cls: 'cm-strike-marker', concealed: false },
      ]);
      expect(engaged.dom.querySelector('[class*="tok-"]')).toBeNull();
      expect(visibleText(engaged)).toBe(doc);
      // No widget/atomic-range machinery was pulled in by the nested walk.
      expect(isAtomicAnywhere(engaged)).toBe(false);
    });

    it('****text**** — same-kind nesting (StrongEmphasis > StrongEmphasis): all four marker spans appear as independent siblings, not merged into one `****`', () => {
      const doc = 'x ****text**** y';
      const engaged = mountViewWithSelection(doc, doc.indexOf('text'));

      expect(markerSpans(engaged)).toEqual([
        { text: '**', cls: 'cm-strong-marker', concealed: false },
        { text: '**', cls: 'cm-strong-marker', concealed: false },
        { text: '**', cls: 'cm-strong-marker', concealed: false },
        { text: '**', cls: 'cm-strong-marker', concealed: false },
      ]);
      expect(visibleText(engaged)).toBe(doc);
    });

    it('**bold `code` _italic_ ~~strike~~** — sibling constructs at one nesting level all resolve independently', () => {
      const doc = '**bold `code` _italic_ ~~strike~~**';
      const engaged = mountViewWithSelection(doc, doc.indexOf('code'));

      expect(markerSpans(engaged)).toEqual([
        { text: '**', cls: 'cm-strong-marker', concealed: false },
        { text: '`', cls: 'cm-code-marker', concealed: false },
        { text: '`', cls: 'cm-code-marker', concealed: false },
        { text: '_', cls: 'cm-emphasis-marker', concealed: false },
        { text: '_', cls: 'cm-emphasis-marker', concealed: false },
        { text: '~~', cls: 'cm-strike-marker', concealed: false },
        { text: '~~', cls: 'cm-strike-marker', concealed: false },
        { text: '**', cls: 'cm-strong-marker', concealed: false },
      ]);
    });

    it('a non-marker-contract engaged node (Link) is unaffected: no cm-marker spans, no crash', () => {
      // Link is deliberately out of MARKER_CONSTRUCTS' scope for this
      // slice — engaging it must fall back to exactly today's behavior
      // (fully raw source, no marker spans at all), not error or produce
      // spurious markers.
      const doc = 'x [label](https://example.com) y';
      const engaged = mountViewWithSelection(doc, doc.indexOf('label'));

      expect(engaged.dom.querySelector('.cm-marker')).toBeNull();
      expect(visibleText(engaged)).toBe(doc);
    });
  });

  // ===================================================================
  // Migrated behavioral coverage — single (non-nested) constructs
  // ===================================================================
  describe('*text* (Emphasis)', () => {
    it('at rest, the * markers have no DOM presence — not merely hidden', () => {
      const view = mountView('Text before *italic* after');

      expect(visibleText(view)).toBe('Text before italic after');
      expect(visibleText(view)).not.toContain('*');
    });

    it('renders the content italic at rest', () => {
      expect(mountView('Text before *italic* after').dom.querySelector('.tok-emphasis')?.textContent).toBe('italic');
    });

    it('_text_: same behavior with underscores', () => {
      const view = mountView('Text before _italic_ after');

      expect(visibleText(view)).toBe('Text before italic after');
      expect(view.dom.querySelector('.tok-emphasis')?.textContent).toBe('italic');
    });

    it('reveals the raw *…* text once the selection is inside it, then re-collapses when it leaves', () => {
      const view = mountView('Before *italic* after');

      view.dispatch({ selection: { anchor: 10 } });
      expect(visibleText(view)).toContain('*italic*');
      expect(view.dom.querySelector('.tok-emphasis')).toBeNull();

      view.dispatch({ selection: { anchor: 0 } });
      expect(visibleText(view)).not.toContain('*');
      expect(view.dom.querySelector('.tok-emphasis')).not.toBeNull();
    });

    it('does not decorate **bold** as italic', () => {
      expect(mountView('Text with **bold** only').dom.querySelector('.tok-emphasis')).toBeNull();
    });

    it('boundary-after-completion: caret at node.from/node.to stays revealed, one further out conceals', () => {
      const doc = 'Text before *italic* after';
      const nodeFrom = 'Text before '.length;
      const nodeTo = 'Text before *italic*'.length;

      expect(visibleText(mountViewWithSelection(doc, nodeFrom))).toBe(doc);
      expect(visibleText(mountViewWithSelection(doc, nodeTo))).toBe(doc);
      expect(visibleText(mountViewWithSelection(doc, nodeFrom - 1))).toBe('Text before italic after');
      expect(visibleText(mountViewWithSelection(doc, nodeTo + 1))).toBe('Text before italic after');
    });
  });

  describe('**text** (StrongEmphasis)', () => {
    it('at rest, the ** markers have no DOM presence at all — not merely hidden', () => {
      const view = mountView('Text before **hello** after');

      expect(visibleText(view)).toBe('Text before hello after');
      expect(visibleText(view)).not.toContain('*');
    });

    it('renders the content bold at rest', () => {
      expect(mountView('Text before **hello** after').dom.querySelector('.tok-strong')?.textContent).toBe('hello');
    });

    it('reveals the raw **…** text once the selection is inside it, then re-collapses when it leaves', () => {
      const view = mountView('Before **hello** after');

      view.dispatch({ selection: { anchor: 10 } });
      expect(visibleText(view)).toContain('**hello**');
      expect(view.dom.querySelector('.tok-strong')).toBeNull();

      view.dispatch({ selection: { anchor: 0 } });
      expect(visibleText(view)).not.toContain('*');
      expect(view.dom.querySelector('.tok-strong')).not.toBeNull();
    });

    it('does not decorate ordinary single-* emphasis as bold', () => {
      expect(mountView('Text with *italic* only').dom.querySelector('.tok-strong')).toBeNull();
    });

    it('boundary-after-completion: caret at node.from/node.to stays revealed, one further out conceals', () => {
      const doc = 'Text before **bold** after';
      const nodeFrom = 'Text before '.length;
      const nodeTo = 'Text before **bold**'.length;

      expect(visibleText(mountViewWithSelection(doc, nodeFrom))).toBe(doc);
      expect(visibleText(mountViewWithSelection(doc, nodeTo))).toBe(doc);
      expect(visibleText(mountViewWithSelection(doc, nodeFrom - 1))).toBe('Text before bold after');
      expect(visibleText(mountViewWithSelection(doc, nodeTo + 1))).toBe('Text before bold after');
    });
  });

  describe('~~text~~ (Strikethrough)', () => {
    it('at rest, the ~~ markers have no DOM presence at all — not merely hidden', () => {
      const view = mountView('Text before ~~struck~~ after');

      expect(visibleText(view)).toBe('Text before struck after');
      expect(visibleText(view)).not.toContain('~');
    });

    it('renders the content struck-through at rest', () => {
      expect(mountView('Text before ~~struck~~ after').dom.querySelector('.tok-strike')?.textContent).toBe('struck');
    });

    it('multi-word content behaves the same', () => {
      const view = mountView('before ~~Text with several words~~ after');

      expect(visibleText(view)).toBe('before Text with several words after');
      expect(view.dom.querySelector('.tok-strike')?.textContent).toBe('Text with several words');
    });

    it('reveals the raw ~~…~~ text once the selection is inside it, then re-collapses when it leaves', () => {
      const view = mountView('Before ~~struck~~ after');

      view.dispatch({ selection: { anchor: 10 } });
      expect(visibleText(view)).toContain('~~struck~~');
      expect(view.dom.querySelector('.tok-strike')).toBeNull();

      view.dispatch({ selection: { anchor: 0 } });
      expect(visibleText(view)).not.toContain('~');
      expect(view.dom.querySelector('.tok-strike')).not.toBeNull();
    });

    it('boundary-after-completion: caret at node.from/node.to stays revealed, one further out conceals', () => {
      const doc = 'Text before ~~struck~~ after';
      const nodeFrom = 'Text before '.length;
      const nodeTo = 'Text before ~~struck~~'.length;

      expect(visibleText(mountViewWithSelection(doc, nodeFrom))).toBe(doc);
      expect(visibleText(mountViewWithSelection(doc, nodeTo))).toBe(doc);
      expect(visibleText(mountViewWithSelection(doc, nodeFrom - 1))).toBe('Text before struck after');
      expect(visibleText(mountViewWithSelection(doc, nodeTo + 1))).toBe('Text before struck after');
    });
  });

  // ===================================================================
  // Phase 2 — ==text== (Highlight)
  // ===================================================================
  describe('==text== (Highlight)', () => {
    it('at rest, the == markers have no DOM presence at all — not merely hidden', () => {
      const view = mountView('Text before ==marked== after');

      expect(visibleText(view)).toBe('Text before marked after');
      expect(visibleText(view)).not.toContain('=');
    });

    it('renders the content highlighted at rest', () => {
      expect(mountView('Text before ==marked== after').dom.querySelector('.tok-highlight')?.textContent).toBe('marked');
    });

    it('reveals the raw ==…== text once the selection is inside it, then re-collapses when it leaves', () => {
      const view = mountView('Before ==marked== after');

      view.dispatch({ selection: { anchor: 10 } });
      expect(visibleText(view)).toContain('==marked==');
      expect(view.dom.querySelector('.tok-highlight')).toBeNull();

      view.dispatch({ selection: { anchor: 0 } });
      expect(visibleText(view)).not.toContain('=');
      expect(view.dom.querySelector('.tok-highlight')).not.toBeNull();
    });

    it('boundary-after-completion: caret at node.from/node.to stays revealed, one further out conceals', () => {
      const doc = 'Text before ==marked== after';
      const nodeFrom = 'Text before '.length;
      const nodeTo = 'Text before ==marked=='.length;

      expect(visibleText(mountViewWithSelection(doc, nodeFrom))).toBe(doc);
      expect(visibleText(mountViewWithSelection(doc, nodeTo))).toBe(doc);
      expect(visibleText(mountViewWithSelection(doc, nodeFrom - 1))).toBe('Text before marked after');
      expect(visibleText(mountViewWithSelection(doc, nodeTo + 1))).toBe('Text before marked after');
    });

    // Delimiter-length policy (revised 2026-08-27, see docs/editor-
    // architecture-decisions.md's Highlight-delimiter entry): a run of
    // *any* length >= 2 opens/closes a Highlight, and the two runs never
    // need to match. Supersedes the old "===...=== isn't a Highlight"
    // expectation this describe block previously pinned — that was the
    // grammar's un-widened default, not a deliberate product decision, and
    // is now obsolete. Confirmed against the actual parser (not assumed):
    // each of these produces a single flat `Highlight` node whose two
    // `HighlightMark`s are exactly the matched run on each side, content
    // always the clean word with nothing swallowed or left stray.
    // Wrapped in surrounding plain text throughout (`x ... y`), same as
    // every other participant's tests in this file — a bare document
    // whose entire content is one construct sits at the doc-start/doc-end
    // caret-boundary default (`mountView`'s no-selection default of
    // anchor 0, which is inclusive of a construct starting at 0), an
    // already-known, unrelated limitation, not something to re-litigate
    // per construct.
    it.each([
      ['==text==', '==', '=='],
      ['===text===', '===', '==='],
      ['====text====', '====', '===='],
      ['=====text=====', '=====', '====='],
    ])('x %s y: symmetric runs of length >= 2 all produce a Highlight with matching-width marks', (construct, openMark, closeMark) => {
      const doc = `x ${construct} y`;
      const view = mountView(doc);

      expect(visibleText(view)).toBe('x text y');
      expect(view.dom.querySelector('.tok-highlight')?.textContent).toBe('text');

      view.dispatch({ selection: { anchor: Math.floor(doc.length / 2) } });
      const markers = Array.from(view.dom.querySelectorAll('.cm-highlight-marker'));
      expect(markers.map((m) => m.textContent)).toEqual([openMark, closeMark]);
    });

    it.each([
      ['==text===', '==', '==='],
      ['===text==', '===', '=='],
      ['====text===', '====', '==='],
      ['====text==', '====', '=='],
    ])('x %s y: opening/closing run lengths may differ — each mark is simply its own actual run, content stays clean', (construct, openMark, closeMark) => {
      const doc = `x ${construct} y`;
      const view = mountView(doc);

      // Content is always exactly "text" — nothing from either run leaks
      // into it, unlike the pre-widening asymmetric behavior where a
      // rejected triple-run character was swallowed into content.
      expect(visibleText(view)).toBe('x text y');
      expect(view.dom.querySelector('.tok-highlight')?.textContent).toBe('text');

      view.dispatch({ selection: { anchor: Math.floor(doc.length / 2) } });
      const markers = Array.from(view.dom.querySelectorAll('.cm-highlight-marker'));
      expect(markers.map((m) => m.textContent)).toEqual([openMark, closeMark]);
    });

    it.each(['=text=', '=text==', '==text=', '=text===', '===text', '======', '=== ==='])(
      'x %s y: a single = or an unmatched/unflanked run never becomes a Highlight',
      (construct) => {
        const doc = `x ${construct} y`;
        const view = mountView(doc);

        expect(view.dom.querySelector('.tok-highlight')).toBeNull();
        expect(view.dom.querySelector('.cm-highlight-marker')).toBeNull();
        expect(visibleText(view)).toBe(doc);
      }
    );

    it('two independent ==...== regions on one line resolve separately, unaffected by the length widening', () => {
      const view = mountView('before ==a== middle ==b== after');

      expect(visibleText(view)).toBe('before a middle b after');
      const highlights = Array.from(view.dom.querySelectorAll('.tok-highlight'));
      expect(highlights.map((h) => h.textContent)).toEqual(['a', 'b']);
    });

    it('an asymmetric-length Highlight composes normally with surrounding plain text', () => {
      const view = mountView('x ==text=== y');

      expect(visibleText(view)).toBe('x text y');
      expect(view.dom.querySelector('.tok-highlight')?.textContent).toBe('text');
    });
  });

  // ===================================================================
  // Phase 2 — `text` (InlineCode)
  // ===================================================================
  describe('`text` (InlineCode)', () => {
    it('at rest, the ` markers have no DOM presence at all — not merely hidden', () => {
      const view = mountView('Text before `code` after');

      expect(visibleText(view)).toBe('Text before code after');
      expect(visibleText(view)).not.toContain('`');
    });

    it('renders the content as code at rest', () => {
      expect(mountView('Text before `code` after').dom.querySelector('.tok-code')?.textContent).toBe('code');
    });

    it('reveals the raw `…` text once the selection is inside it, then re-collapses when it leaves', () => {
      const view = mountView('Before `code` after');

      view.dispatch({ selection: { anchor: 9 } });
      expect(visibleText(view)).toContain('`code`');
      expect(view.dom.querySelector('.tok-code')).toBeNull();

      view.dispatch({ selection: { anchor: 0 } });
      expect(visibleText(view)).not.toContain('`');
      expect(view.dom.querySelector('.tok-code')).not.toBeNull();
    });

    it('boundary-after-completion: caret at node.from/node.to stays revealed, one further out conceals', () => {
      const doc = 'Text before `code` after';
      const nodeFrom = 'Text before '.length;
      const nodeTo = 'Text before `code`'.length;

      expect(visibleText(mountViewWithSelection(doc, nodeFrom))).toBe(doc);
      expect(visibleText(mountViewWithSelection(doc, nodeTo))).toBe(doc);
      expect(visibleText(mountViewWithSelection(doc, nodeFrom - 1))).toBe('Text before code after');
      expect(visibleText(mountViewWithSelection(doc, nodeTo + 1))).toBe('Text before code after');
    });

    // Construct-local parser fact, migrated from the retired
    // inlineCodeMarkerDecoration.test.ts: CommonMark requires a longer
    // backtick run to let a literal backtick appear inside the span.
    // firstChild/lastChild resolve positionally, so this needs no
    // special-casing here — but it's real evidence worth pinning, not
    // implied by the generic mechanism.
    it('a variable-length backtick run lets a literal backtick appear inside the span', () => {
      const view = mountView('Text before ``code with ` backtick`` after');

      expect(visibleText(view)).not.toContain('``');
      expect(view.dom.querySelector('.tok-code')?.textContent).toBe('code with ` backtick');

      view.dispatch({ selection: { anchor: 15 } });
      expect(visibleText(view)).toContain('``code with ` backtick``');
    });

    // Construct-local parser-terminality fact this whole Phase 2
    // registration depends on, migrated from the retired suite: a code
    // span's content is CommonMark-literal and is never re-parsed as
    // Markdown — confirmed at the tree level, not just at the DOM level,
    // so this is independent of inlineLivePreviewRegion entirely.
    it('does not parse further Markdown inside a code span — `**not bold**` stays literal both in the tree and on screen', () => {
      const text = 'Text before `**not bold**` after';
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

      const view = mountView(text);
      expect(visibleText(view)).toContain('Text before **not bold** after');
    });
  });

  // ===================================================================
  // [label](url) — Link. A shared marker-hiding participant (like
  // Emphasis/Strikethrough/etc.), never a widget-replace/atomic one —
  // docs/editor-architecture-decisions.md, "Shared live-preview
  // participant contract — confirmed via Link".
  // ===================================================================
  describe('[label](url) (Link)', () => {
    it('at rest, only the label is visible — the [ ]( url ) syntax has no DOM presence', () => {
      const view = mountView('before [Display name](https://example.com) after');

      expect(visibleText(view)).toBe('before Display name after');
      expect(visibleText(view)).not.toContain('[');
      expect(visibleText(view)).not.toContain('https://example.com');
    });

    it('classes the label with tok-link at rest', () => {
      expect(
        mountView('before [Display name](https://example.com) after').dom.querySelector('.tok-link')?.textContent
      ).toBe('Display name');
    });

    it('reveals the full raw source from a caret anywhere in the node — label or URL portion, no distinction', () => {
      const doc = 'Before [Display name](https://example.com) after';
      const labelInside = doc.indexOf('name');
      const urlInside = doc.indexOf('example');

      expect(visibleText(mountViewWithSelection(doc, labelInside))).toBe(doc);
      expect(visibleText(mountViewWithSelection(doc, urlInside))).toBe(doc);

      const view = mountView(doc);
      view.dispatch({ selection: { anchor: labelInside } });
      expect(visibleText(view)).toBe(doc);
      view.dispatch({ selection: { anchor: 0 } });
      expect(visibleText(view)).toBe('Before Display name after');
    });

    it('region atomicity: every caret position within the node reveals the whole thing, exactly the shared invariant every other participant proves', () => {
      expectRegionRevealsAtomicallyThroughout(
        'before [Display name](https://example.com) after',
        '[Display name](https://example.com)'
      );
    });

    it('a URL with a title still conceals as one combined unit', () => {
      const view = mountView('before [text](https://example.com "a title") after');
      expect(visibleText(view)).toBe('before text after');
    });

    it('a URL with balanced parens still conceals correctly', () => {
      const view = mountView('before [text](https://example.com/a(b)c) after');
      expect(visibleText(view)).toBe('before text after');
    });

    it('nested formatting in the label composes correctly', () => {
      // Padded: a Link starting at document position 0 would otherwise
      // sit on the pre-existing default-(0,0)-selection edge case
      // (documented above under "known, deferred limitation") and load
      // engaged, defeating the at-rest assertion below.
      const bold = mountView('x [**bold** text](https://example.com) y');
      expect(visibleText(bold)).toBe('x bold text y');
      expect(bold.dom.querySelector('.tok-strong')?.textContent).toBe('bold');

      const italic = mountView('x [*italic* text](https://example.com) y');
      expect(visibleText(italic)).toBe('x italic text y');
      expect(italic.dom.querySelector('.tok-emphasis')?.textContent).toBe('italic');
    });

    it('Link nested inside StrongEmphasis: tok-strong wraps tok-link (DOM nesting, same mechanism as the WikiLink inheritance fix)', () => {
      const view = mountView('before **[text](https://example.com)** after');
      const label = view.dom.querySelector('.tok-link');
      expect(label).not.toBeNull();
      expect(label!.closest('.tok-strong')).not.toBeNull();
    });

    it('reference-style/shortcut links (no URL child) are left fully raw, not decorated at all', () => {
      expect(visibleText(mountView('before [Display][reference] after'))).toBe(
        'before [Display][reference] after'
      );
      expect(visibleText(mountView('before [Display][] after'))).toBe('before [Display][] after');
      expect(visibleText(mountView('before [Display] after'))).toBe('before [Display] after');
    });

    it('reference-style links stay raw even when a matching LinkReference definition exists elsewhere in the document', () => {
      const view = mountView('[Display][reference]\n\n[reference]: https://example.com');
      expect(visibleText(view)).toContain('[Display][reference]');
    });

    it('is never registered in EditorView.atomicRanges — the label stays ordinary, character-editable text', () => {
      const view = mountView('before [Display name](https://example.com) after');
      expect(isAtomicAnywhere(view)).toBe(false);
    });

    it('the underlying document never changes as the link collapses/reveals', () => {
      const text = 'before [Display name](https://example.com) after';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 10 } });
      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 0 } });
      expect(view.state.doc.toString()).toBe(text);
    });

    it('adjacent to Tag/Date/WikiLink as siblings: unaffected, no interaction', () => {
      const view = mountView('x [text](https://example.com) #tag y', {
        resolveTag: () => undefined,
        resolveDate: () => undefined,
      });
      expect(visibleText(view)).toBe('x text #tag y');
    });

    // =================================================================
    // Empty label ([](url)) falls back to displaying the URL itself, so
    // the construct never disappears at rest — docs/editor-architecture-
    // decisions.md, "Link/URL styling — resolved".
    // =================================================================
    describe('empty label ([](url)) falls back to the URL', () => {
      it('at rest, displays the URL itself, classed tok-link, instead of vanishing', () => {
        const view = mountView('before [](https://google.com) after');

        expect(visibleText(view)).toBe('before https://google.com after');
        expect(view.dom.querySelector('.tok-link')?.textContent).toBe('https://google.com');
      });

      it('a non-http URL (www.one.autodesk.com) follows the same fallback', () => {
        const view = mountView('before [](www.one.autodesk.com) after');

        expect(visibleText(view)).toBe('before www.one.autodesk.com after');
        expect(view.dom.querySelector('.tok-link')?.textContent).toBe('www.one.autodesk.com');
      });

      it('reveals the full raw [](url) source when engaged', () => {
        const doc = 'before [](https://google.com) after';
        const inside = doc.indexOf('google');

        expect(visibleText(mountViewWithSelection(doc, inside))).toBe(doc);
      });

      it('collapses back to the URL fallback once the caret leaves', () => {
        const doc = 'before [](https://google.com) after';
        const inside = doc.indexOf('google');
        const view = mountView(doc);

        view.dispatch({ selection: { anchor: inside } });
        expect(visibleText(view)).toBe(doc);
        view.dispatch({ selection: { anchor: 0 } });
        expect(visibleText(view)).toBe('before https://google.com after');
      });

      it('the underlying document never changes as it renders/reveals/collapses', () => {
        const text = 'before [](https://google.com) after';
        const view = mountView(text);

        expect(view.state.doc.toString()).toBe(text);
        view.dispatch({ selection: { anchor: 10 } });
        expect(view.state.doc.toString()).toBe(text);
        view.dispatch({ selection: { anchor: 0 } });
        expect(view.state.doc.toString()).toBe(text);
      });

      it('is never registered in EditorView.atomicRanges', () => {
        const view = mountView('before [](https://google.com) after');
        expect(isAtomicAnywhere(view)).toBe(false);
      });

      it('reuses the exact tok-link class a non-empty label uses — no second visual convention', () => {
        const emptyClass = mountView('x [](https://google.com) y').dom.querySelector('.tok-link')?.className;
        const nonEmptyClass = mountView('x [Google](https://google.com) y').dom.querySelector('.tok-link')
          ?.className;
        expect(emptyClass).not.toBeUndefined();
        expect(emptyClass).toBe(nonEmptyClass);
      });

      it('non-empty label [Google](https://google.com) is unaffected by the fallback branch', () => {
        const view = mountView('before [Google](https://google.com) after');

        expect(visibleText(view)).toBe('before Google after');
        expect(view.dom.querySelector('.tok-link')?.textContent).toBe('Google');
      });
    });
  });

  // ===================================================================
  // <https://example.com> — Autolink, and bare `https://example.com` —
  // URL. Reuse Link's own mechanism/CSS class rather than a second visual
  // convention — docs/editor-architecture-decisions.md, "Link/URL styling
  // — resolved". Autolink registers delimitedInlineRenderer unmodified
  // (its `LinkMark`/`URL`/`LinkMark` shape already fits); bare URL gets
  // its own minimal renderer that just applies the same `tok-link` class,
  // with no concealment (nothing to conceal).
  // ===================================================================
  describe('<https://example.com> (Autolink)', () => {
    it('at rest, conceals the < and > marks and classes the URL content tok-link', () => {
      const view = mountView('before <https://example.com> after');

      expect(visibleText(view)).toBe('before https://example.com after');
      expect(view.dom.querySelector('.tok-link')?.textContent).toBe('https://example.com');
    });

    it('reveals the full raw <...> source when engaged', () => {
      const doc = 'before <https://example.com> after';
      const inside = doc.indexOf('example');

      expect(visibleText(mountViewWithSelection(doc, inside))).toBe(doc);
    });

    it('collapses back once the caret leaves', () => {
      const doc = 'before <https://example.com> after';
      const inside = doc.indexOf('example');
      const view = mountView(doc);

      view.dispatch({ selection: { anchor: inside } });
      expect(visibleText(view)).toBe(doc);
      view.dispatch({ selection: { anchor: 0 } });
      expect(visibleText(view)).toBe('before https://example.com after');
    });

    it('is never registered in EditorView.atomicRanges — stays ordinary, character-editable text', () => {
      const view = mountView('before <https://example.com> after');
      expect(isAtomicAnywhere(view)).toBe(false);
    });
  });

  describe('bare https://example.com (URL)', () => {
    it('at rest, classes the whole URL tok-link with no concealment (nothing to conceal)', () => {
      const view = mountView('before https://example.com/a?b=1 after');

      expect(visibleText(view)).toBe('before https://example.com/a?b=1 after');
      expect(view.dom.querySelector('.tok-link')?.textContent).toBe('https://example.com/a?b=1');
    });

    it('reuses the exact tok-link class Link already uses — no second visual convention', () => {
      const linkClass = mountView('x [text](https://example.com) y').dom.querySelector('.tok-link')?.className;
      const urlClass = mountView('x https://example.com y').dom.querySelector('.tok-link')?.className;
      expect(linkClass).not.toBeUndefined();
      expect(urlClass).toBe(linkClass);
    });

    it('is never registered in EditorView.atomicRanges', () => {
      const view = mountView('before https://example.com/a after');
      expect(isAtomicAnywhere(view)).toBe(false);
    });

    it("a URL nested inside an explicit Link is not double-decorated — Link's own renderer owns it exclusively", () => {
      // Padded: a construct starting at document position 0 would
      // otherwise sit on the pre-existing default-(0,0)-selection edge
      // case (documented above under "known, deferred limitation") and
      // load engaged, defeating the at-rest assertion below.
      const view = mountView('x [Google](https://google.com) y');
      // Exactly one tok-link element for the whole construct — not a
      // second, nested one from the URL participant independently firing
      // on the same child node.
      expect(view.dom.querySelectorAll('.tok-link').length).toBe(1);
    });

    it("a URL nested inside an Autolink is not double-decorated — Autolink's own delimitedInlineRenderer owns it exclusively", () => {
      const view = mountView('x <https://example.com> y');
      expect(view.dom.querySelectorAll('.tok-link').length).toBe(1);
    });

    it('the underlying document never changes as it renders', () => {
      const text = 'before https://example.com after';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 10 } });
      expect(view.state.doc.toString()).toBe(text);
    });
  });

  // ===================================================================
  // Phase 3 — #tag (Tag), @date (Date) — the widget-replace family.
  // Construct-local resolver-contract coverage migrated from the retired
  // tagDecorations.test.ts/dateDecorations.test.ts; generic
  // engagement-boundary tests those files also had ("doesn't decorate
  // when selection contained", "re-decorates on leave", "spanning
  // selection stays collapsed", "document text never changes") are not
  // migrated — already proven structurally by the INVARIANT blocks above.
  //
  // WikiLink's own equivalent coverage moved to wikiLinkLivePreview.test.ts
  // — WikiLink is no longer a participant of this mechanism at all (see
  // inlineLivePreviewParticipants.ts's doc comment).
  // ===================================================================
  describe('#tag (Tag)', () => {
    it("renders an at-rest Tag as a widget showing the resolution's displayLabel, identical to the raw text when the tag has no separator", () => {
      const view = mountView('Text before #project after', {
        ...noResolvers,
        resolveTag: () => (name) => ({ status: 'resolved', displayLabel: name, activate: () => {} }),
      });

      const widget = view.dom.querySelector('[data-tag-status="resolved"]');
      expect(widget?.textContent).toBe('#project');
    });

    it('falls back to a separator-normalized display label with no resolver injected at all', () => {
      const view = mountView('Text before #Product_design after');

      const widget = view.dom.querySelector('[data-tag-status="unresolved"]');
      expect(widget?.textContent).toBe('#Product design');
    });

    it('calls the resolver with the identifier only, without the leading #', () => {
      const calls: string[] = [];
      const resolveTag: ResolveTag = (name) => {
        calls.push(name);
        return { status: 'resolved', displayLabel: name, activate: () => {} };
      };

      mountView('Text before #project after', { ...noResolvers, resolveTag: () => resolveTag });

      expect(calls).toEqual(['project']);
    });

    it('renders resolved and unresolved statuses on their own distinct data-tag-status hook', () => {
      const resolvedView = mountView('Text before #project after', {
        ...noResolvers,
        resolveTag: () => (name) => ({ status: 'resolved', displayLabel: name, activate: () => {} }),
      });
      expect(resolvedView.dom.querySelector('[data-tag-status="resolved"]')).not.toBeNull();

      const unresolvedView = mountView('Text before #newtag after');
      expect(unresolvedView.dom.querySelector('[data-tag-status="unresolved"]')).not.toBeNull();
    });
  });

  describe('@date (Date)', () => {
    it('renders an at-rest Date as a widget showing a computed label, not the raw @YYYY-MM-DD text — the @ prefix is kept', () => {
      const view = mountView('Text before @2026-08-20 after', {
        ...noResolvers,
        resolveDate: () => () => ({ activate: () => {} }),
      });

      const widget = view.dom.querySelector('[data-date-status="valid"]');
      expect(widget).not.toBeNull();
      expect(widget?.textContent?.startsWith('@')).toBe(true);
      expect(visibleText(view)).not.toContain('@2026-08-20');
    });

    it('falls back to activate-as-no-op when no resolver is provided, still renders a valid-looking widget', () => {
      const view = mountView('Text before @2026-08-20 after');

      expect(view.dom.querySelector('[data-date-status="valid"]')).not.toBeNull();
    });

    it('calls the resolver with the matched ISO date', () => {
      const calls: string[] = [];
      const resolveDate: ResolveDate = (isoDate) => {
        calls.push(isoDate);
        return { activate: () => {} };
      };

      mountView('Text before @2026-08-20 after', { ...noResolvers, resolveDate: () => resolveDate });

      expect(calls).toEqual(['2026-08-20']);
    });

    it('renders a calendar-invalid-but-shape-valid date with data-date-status="invalid" and its raw text as the label', () => {
      const view = mountView('Text before @2026-13-45 after', {
        ...noResolvers,
        resolveDate: () => () => ({ activate: () => {} }),
      });

      const widget = view.dom.querySelector('[data-date-status="invalid"]');
      expect(widget).not.toBeNull();
      expect(widget?.textContent).toBe('@2026-13-45');
    });
  });

  // ===================================================================
  // Widget participants must visually inherit the enclosing formatting
  // decoration's class — the content Decoration.mark() in
  // delimitedInlineRenderer must be inclusiveStart/inclusiveEnd so it
  // wraps a nested widget-replace participant (WikiLink/Tag/Date) whose
  // range exactly fills its content range, the ordinary zero-gap-nesting
  // case. Regression for a real bug found in manual review: without those
  // flags, `**[[Page]]**` rendered the WikiLink widget as a plain sibling
  // with no `tok-strong` wrapper at all (CM6 mark decorations default to
  // non-inclusive boundaries, which don't extend across a widget point).
  // ===================================================================
  describe('INVARIANT: widget participants visually inherit the enclosing formatting mark', () => {
    /** Asserts the widget's own element sits inside a `.contentClass` ancestor, not merely present somewhere in the DOM. */
    function expectWidgetWrappedBy(view: EditorView, widgetSelector: string, contentClass: string) {
      const widget = view.dom.querySelector(widgetSelector);
      expect(widget, `expected to find widget matching ${widgetSelector}`).not.toBeNull();
      expect(
        widget!.closest(`.${contentClass}`),
        `expected ${widgetSelector} to be wrapped by an ancestor with class ${contentClass}`
      ).not.toBeNull();
    }

    // WikiLink-specific inheritance coverage (**[[Page]]**, ~~[[Page]]~~,
    // ==[[Page]]==, etc.) moved to wikiLinkLivePreview.test.ts. WikiLink is
    // no longer a participant of this mechanism, so it can no longer be
    // exercised via mountView()/createInlineLivePreviewParticipants() —
    // Tag and Date remain unchanged and continue to prove this invariant
    // for the widget-replace family below.
    it('**x #tag**: tok-strong wraps the Tag widget (representative widget participant)', () => {
      const view = mountView('before **x #tag** after');
      expectWidgetWrappedBy(view, '[data-tag-status]', 'tok-strong');
    });

    it('**x @2026-01-01**: tok-strong wraps the Date widget (representative widget participant)', () => {
      const view = mountView('before **x @2026-01-01** after');
      expectWidgetWrappedBy(view, '[data-date-status]', 'tok-strong');
    });

    it('engaged: the whole region stays fully raw source, exactly as before this fix', () => {
      // Regression guard: the inclusivity fix must not change engagement
      // behavior. Sweeping every caret position within the region root
      // for **x #tag** — reusing the same invariant this ODR is built
      // on — is the strongest available proof it didn't.
      expectRegionRevealsAtomicallyThroughout('before **x #tag** after', '**x #tag**');
    });

    it('ordinary (non-widget) nested formatting is visually unaffected by the inclusivity change', () => {
      // ***Text***: purely marker-hiding participants nested in each
      // other, no widget involved — must render identically to before.
      const view = mountView('before ***Text*** after');

      expect(visibleText(view)).toBe('before Text after');
      const strong = view.dom.querySelector('.tok-strong');
      const emphasis = view.dom.querySelector('.tok-emphasis');
      expect(visibleText(strong)).toBe('Text');
      expect(visibleText(emphasis)).toBe('Text');
      expect(strong!.contains(emphasis) || emphasis!.contains(strong)).toBe(true);
    });
  });

  // ===================================================================
  // Phase 3 §8 — INVARIANT: atomic ranges are participant-owned facts,
  // produced by the same traversal as decorations, never derived by
  // inspecting the merged decoration set.
  // ===================================================================
  describe('INVARIANT: atomic ranges — widget family only, never ordinary marks, never while engaged', () => {
    // WikiLink's own atomic-range coverage (at rest, engaged, nested under
    // engaged formatting) moved to wikiLinkLivePreview.test.ts, since
    // WikiLink's atomic range is now contributed by its own standalone
    // extension rather than this mechanism. Tag proves this INVARIANT for
    // the participants that remain here, unchanged.
    it('an at-rest widget participant (Tag) registers in EditorView.atomicRanges', () => {
      const view = mountView('Text before #project after');
      expect(isAtomicAnywhere(view)).toBe(true);
    });

    it('an ordinary marker-hiding participant (Strikethrough) never registers as atomic, at rest or otherwise', () => {
      const view = mountView('Text before ~~struck~~ after');
      expect(isAtomicAnywhere(view)).toBe(false);
    });

    it('an engaged widget participant emits neither its decoration nor its atomic range', () => {
      const doc = 'Text before #project after';
      const nodeStart = 'Text before '.length;
      const view = mountViewWithSelection(doc, nodeStart + 3);

      expect(view.dom.querySelector('[data-tag-status]')).toBeNull();
      expect(visibleText(view)).toContain('#project');
      expect(isAtomicAnywhere(view)).toBe(false);
    });

    it('**x #tag**: the Tag is not atomic while the enclosing StrongEmphasis region is engaged — the generalized defect this ODR prevents, for the widget family', () => {
      const doc = 'before **x #tag** after';
      const outerFrom = 'before '.length; // caret at the StrongEmphasis boundary, outside Tag's own range
      const view = mountViewWithSelection(doc, outerFrom);

      expect(visibleText(view)).toBe(doc);
      expect(isAtomicAnywhere(view)).toBe(false);
    });
  });

  // ===================================================================
  // Phase 3 §9 — INVARIANT: resolver freshness — a stable getter closure,
  // never a captured snapshot; the extension is never rebuilt when the
  // resolver changes.
  // ===================================================================
  describe('INVARIANT: resolver freshness via getter indirection', () => {
    // WikiLink's own resolver-freshness coverage moved to
    // wikiLinkLivePreview.test.ts along with the rest of its behavior; Tag
    // proves the same getter-indirection fact for the participants that
    // remain in this shared mechanism.
    it('reflects a resolver change between two decoration passes without rebuilding the extension', () => {
      let current: ResolveTag = () => ({ status: 'resolved', displayLabel: 'first', activate: () => {} });
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const state = EditorState.create({
        doc: 'Text before #tag after',
        extensions: [
          markdownLanguageExtension(),
          inlineLivePreviewRegion(
            createInlineLivePreviewParticipants({ ...noResolvers, resolveTag: () => current })
          ),
        ],
      });
      const view = new EditorView({ state, parent });

      expect(view.dom.querySelector('[data-tag-status="resolved"]')?.textContent).toBe('#first');

      current = () => ({ status: 'resolved', displayLabel: 'second', activate: () => {} });
      // Force a decoration rebuild the same way engaging/disengaging does —
      // no extension reconstruction, just transactions. Engage (hides the
      // widget) then disengage (rebuilds and re-shows it), so the second
      // dispatch's rebuild reads the getter fresh while outside the node.
      view.dispatch({ selection: { anchor: 'Text before '.length + 1 } });
      view.dispatch({ selection: { anchor: 0 } });

      expect(view.dom.querySelector('[data-tag-status="resolved"]')?.textContent).toBe('#second');
    });
  });

  describe('bold, italic, and strikethrough together but not nested: each resolves separately', () => {
    it('renders separately, each with its own class', () => {
      const view = mountViewWithSelection('Text with **bold** and *italic* and ~~struck~~ together', 0);

      expect(visibleText(view)).toBe('Text with bold and italic and struck together');
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
        expect(visibleText(view)).toBe(doc);
        expect(view.dom.querySelector('.tok-strike')).toBeNull();
      }
    });

    it('~Text~ (single tilde) is never a Strikethrough delimiter', () => {
      const view = mountViewWithSelection('before ~Text~ after', 0);
      expect(visibleText(view)).toBe('before ~Text~ after');
      expect(view.dom.querySelector('.tok-strike')).toBeNull();
    });

    it('line-start tilde runs of 3+ are FencedCode, never Strikethrough', () => {
      for (const doc of ['~~~Text~~~', '~~~~Text~~~~', '~~~~~~Text~~~~~~']) {
        expect(mountView(doc).dom.querySelector('.tok-strike')).toBeNull();
      }
    });

    it('mid-line long tilde runs: leftover tildes stay literal on both sides', () => {
      const view = mountViewWithSelection('before ~~~~Text~~~~ after', 0);

      expect(visibleText(view)).toBe('before ~~Text~~ after');
      expect(view.dom.querySelector('.tok-strike')?.textContent).toBe('Text~~');
    });

    it('~~Text~~~~More~~: only "~~More~~" forms a node; the leading run stays unwrapped literal text', () => {
      const view = mountViewWithSelection('~~Text~~~~More~~', 0);

      expect(visibleText(view)).toBe('~~Text~~More');
      const spans = Array.from(view.dom.querySelectorAll('.tok-strike'));
      expect(spans).toHaveLength(1);
      expect(spans[0]?.textContent).toBe('More');
    });

    it('soft-wrapped ~~one\\ntwo~~ spans the line break within one paragraph', () => {
      const view = mountViewWithSelection('before ~~one\ntwo~~ after', 0);

      expect(visibleText(view)).toBe('before onetwo after');
      const spans = Array.from(view.dom.querySelectorAll('.tok-strike'));
      expect(spans.map((el) => el.textContent)).toEqual(['one', 'two']);
    });
  });

  describe('non-qualifying outer constructs: the inner construct still resolves on its own', () => {
    it('* **Text** * — leading "* " is a list item, not Emphasis', () => {
      const view = mountViewWithSelection('* **Text** *', 12);

      expect(view.dom.querySelector('.tok-strong')?.textContent).toBe('Text');
      expect(visibleText(view)).toContain('*');
    });

    it('** *Text* ** — outer ** fails flanking rules and stays literal', () => {
      const view = mountViewWithSelection('** *Text* **', 0);

      expect(view.dom.querySelector('.tok-emphasis')?.textContent).toBe('Text');
      expect(visibleText(view)).toContain('**');
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
      expect(visibleText(mountView('Just plain text, nothing to hide.'))).toBe(
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
        expect(visibleText(mountViewWithSelection(doc, doc.length))).toBe(doc);
        expect(visibleText(mountViewWithSelection(doc, 0))).toBe(doc);
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
        ['==marked==', 'Highlight', 'HighlightMark'],
        ['`code`', 'InlineCode', 'CodeMark'],
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
