// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { wikiLinkLivePreview } from '../wikilink/wikiLinkLivePreview';
import { markdownLanguageExtension } from '../markdownLanguage';
import { createInlineLivePreviewParticipants, type ParticipantResolvers } from './inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from './inlineLivePreviewRegion';

/**
 * Coverage for the final `Strikethrough`/`Link`/`URL`/`Autolink` decoration
 * architecture: `.tok-link` mirrors `.tok-wikilink`'s own outer/inner split
 * — the link's own root composes `tok-strike` onto itself when struck
 * (owning `color`), an inner `.tok-link-title` owns the underline
 * exclusively (mirroring `.tok-wikilink__title`) — and `strikethroughRenderer`
 * (`inlineLivePreviewParticipants.ts`) never lets an *ancestor* `.tok-strike`
 * wrap a link in the first place (splits its own ranges around
 * `Link`/`Autolink`/`URL` descendants instead of one mark spanning them).
 * Both fixes are needed together: composing `tok-strike` onto the link's
 * own root only avoids the WKWebView compositing bug if there is no
 * *second*, ancestor-owned `.tok-strike` decorating box also touching the
 * same text — see `linkContentDecorations`'s and `strikethroughRenderer`'s
 * own doc comments for the full mechanism.
 *
 * These are DOM-structure tests only — jsdom has no real layout engine, so
 * "does a long link fragment across visual lines" (`getClientRects()`)
 * cannot be meaningfully asserted here; that's verified separately against
 * a real mounted `EditorView` in a real browser.
 *
 * Every doc below is given real leading text ("Lead. ") before its `~~...~~`
 * — the default cursor sits at document position 0, and a doc that starts
 * with `~~` directly would put that default cursor right at the
 * construct's own boundary, making `inlineLivePreviewRegion` treat it as
 * *engaged* (raw, unconcealed) rather than at-rest, same as every other
 * test in this codebase that mounts a bare `~~...~~` doc without a
 * separate `mountViewWithSelection` call.
 */
const noResolvers: ParticipantResolvers = {
  resolveWikiLink: () => undefined,
  resolveTag: () => undefined,
  resolveDate: () => undefined,
};

/** Every construct that legitimately composes `tok-strike` onto its own root when nested inside a Strikethrough — none of these declare a conflicting `text-decoration` on that same element, so self-composing it is correct and harmless. */
const SELF_COMPOSING_STRIKE_CLASSES = ['tok-strong', 'tok-emphasis', 'tok-highlight', 'tok-wikilink', 'tok-tag', 'tok-code', 'tok-link'];

function mountView(doc: string, resolvers: ParticipantResolvers = noResolvers, includeWikiLink = false): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const extensions: Extension[] = [
    markdownLanguageExtension(),
    inlineLivePreviewRegion(createInlineLivePreviewParticipants(resolvers)),
  ];
  if (includeWikiLink) {
    extensions.push(wikiLinkLivePreview(() => undefined));
  }
  const state = EditorState.create({ doc, extensions });
  return new EditorView({ state, parent });
}

/**
 * True iff `el` sits *inside* a bare Strikethrough-owned `.tok-strike`
 * wrapper — i.e. an ancestor whose only reason for existing is
 * `strikethroughRenderer`'s own gap-mark, not any other construct's
 * legitimate self-composition (`SELF_COMPOSING_STRIKE_CLASSES`). This is
 * the actual bug this file's Strikethrough-side coverage exists to catch:
 * a link (or anything else) ending up as a *descendant* of such a wrapper
 * would mean the gap computation failed to exclude it. Deliberately does
 * NOT check `el` itself — a link legitimately carries `tok-strike` on its
 * own root now (self-composed, not inherited from an ancestor), which is
 * the whole point of this architecture, not the bug.
 */
function hasBareStrikeAncestor(el: Element | null): boolean {
  let node: Element | null = el?.parentElement ?? null;
  while (node && !node.classList.contains('cm-content')) {
    const isBareStrike =
      node.classList.contains('tok-strike') &&
      !SELF_COMPOSING_STRIKE_CLASSES.some((cls) => node!.classList.contains(cls));
    if (isBareStrike) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

describe('Strikethrough + Link/URL/Autolink: link is always a sibling of any ancestor-owned .tok-strike gap span, and self-composes tok-strike onto its own root exactly like WikiLink', () => {
  it('1. plain struck text: still classed tok-strike, no links involved', () => {
    const view = mountView('Lead. ~~plain text~~');
    const strike = view.dom.querySelector('.tok-strike');
    expect(strike?.textContent).toBe('plain text');
  });

  it('2. ~~before [Google](url) after~~ — struck link composes tok-strike onto its own root (not an ancestor), plain text still gets its own separate tok-strike spans', () => {
    const view = mountView('Lead. ~~before [Google](url) after~~');
    const link = view.dom.querySelector('.tok-link');
    expect(link?.textContent).toBe('Google');
    expect(link?.classList.contains('tok-strike')).toBe(true);
    expect(hasBareStrikeAncestor(link)).toBe(false);

    const title = link?.querySelector('.tok-link-title');
    expect(title?.textContent).toBe('Google');

    // Non-link content still gets its own tok-strike spans, split into "before"/"after".
    const bareStrikeSpans = Array.from(view.dom.querySelectorAll('.tok-strike')).filter(
      (s) => !SELF_COMPOSING_STRIKE_CLASSES.some((cls) => s.classList.contains(cls))
    );
    expect(bareStrikeSpans.map((s) => s.textContent)).toEqual(['before ', ' after']);
  });

  it('3. ~~[Google](url) after~~ — link at the very start, only a trailing bare gap', () => {
    const view = mountView('Lead. ~~[Google](url) after~~');
    const link = view.dom.querySelector('.tok-link');
    expect(link?.classList.contains('tok-strike')).toBe(true);
    expect(hasBareStrikeAncestor(link)).toBe(false);
  });

  it('4. ~~before [Google](url)~~ — link at the very end, only a leading bare gap', () => {
    const view = mountView('Lead. ~~before [Google](url)~~');
    const link = view.dom.querySelector('.tok-link');
    expect(link?.classList.contains('tok-strike')).toBe(true);
    expect(hasBareStrikeAncestor(link)).toBe(false);
  });

  it('5. ~~[Google](url)~~ — link fills the entire strikethrough; it self-composes tok-strike, no separate bare wrapper is needed at all', () => {
    const view = mountView('Lead. ~~[Google](url)~~');
    const link = view.dom.querySelector('.tok-link');
    expect(link?.textContent).toBe('Google');
    expect(link?.classList.contains('tok-strike')).toBe(true);
    expect(hasBareStrikeAncestor(link)).toBe(false);
  });

  it('6. ~~[Google](url) middle [Apple](url) after~~ — two links, both self-compose tok-strike, gaps between/after preserved as bare spans', () => {
    const view = mountView('Lead. ~~[Google](url) middle [Apple](url) after~~');
    const links = Array.from(view.dom.querySelectorAll('.tok-link'));
    expect(links.map((l) => l.textContent)).toEqual(['Google', 'Apple']);
    for (const link of links) {
      expect(link.classList.contains('tok-strike')).toBe(true);
      expect(hasBareStrikeAncestor(link)).toBe(false);
    }
    const bareStrikeSpans = Array.from(view.dom.querySelectorAll('.tok-strike')).filter(
      (s) => !SELF_COMPOSING_STRIKE_CLASSES.some((cls) => s.classList.contains(cls))
    );
    expect(bareStrikeSpans.map((s) => s.textContent)).toEqual([' middle ', ' after']);
  });

  it('7. ~~**[Google](url)**~~ — link excluded from any bare tok-strike wrapper; StrongEmphasis itself still legitimately self-composes tok-strike (no text-decoration conflict there)', () => {
    const view = mountView('Lead. ~~**[Google](url)**~~');
    const link = view.dom.querySelector('.tok-link');
    expect(link?.classList.contains('tok-strike')).toBe(true);
    const strong = view.dom.querySelector('.tok-strong');
    expect(strong?.classList.contains('tok-strike')).toBe(true);
    expect(strong?.contains(link)).toBe(true);
  });

  it('8. ~~==[Google](url)==~~ — same, for Highlight', () => {
    const view = mountView('Lead. ~~==[Google](url)==~~');
    const link = view.dom.querySelector('.tok-link');
    expect(link?.classList.contains('tok-strike')).toBe(true);
    const highlight = view.dom.querySelector('.tok-highlight');
    expect(highlight?.classList.contains('tok-strike')).toBe(true);
    expect(highlight?.contains(link)).toBe(true);
  });

  it('9. ~~[a](u)[b](u)~~ — two links with zero characters between them, each independently self-composes tok-strike', () => {
    const view = mountView('Lead. ~~[a](u)[b](u)~~');
    const links = Array.from(view.dom.querySelectorAll('.tok-link'));
    expect(links.map((l) => l.textContent)).toEqual(['a', 'b']);
    for (const link of links) {
      expect(link.classList.contains('tok-strike')).toBe(true);
      expect(hasBareStrikeAncestor(link)).toBe(false);
    }
  });

  it('10. ~~<https://example.com>~~ — Autolink also self-composes tok-strike onto its own root (the pre-existing gap this fix closes) rather than relying on an ancestor', () => {
    const view = mountView('Lead. ~~<https://example.com>~~');
    const link = view.dom.querySelector('.tok-link');
    expect(link?.textContent).toBe('https://example.com');
    expect(link?.classList.contains('tok-strike')).toBe(true);
    expect(hasBareStrikeAncestor(link)).toBe(false);
  });

  it('11. ~~[https://example.com](https://example.com)~~ — a link whose label is itself a URL string behaves like any other link', () => {
    const view = mountView('Lead. ~~[https://example.com](https://example.com)~~');
    const link = view.dom.querySelector('.tok-link');
    expect(link?.textContent).toBe('https://example.com');
    expect(link?.classList.contains('tok-strike')).toBe(true);
    expect(hasBareStrikeAncestor(link)).toBe(false);
  });

  it('12. long Markdown link inside strikethrough — structurally identical to the short case (geometry verified separately in a real browser)', () => {
    const view = mountView(
      'Lead. ~~before ' +
        '[a really long link label containing many words that should wrap naturally across lines](url)' +
        ' after~~'
    );
    const link = view.dom.querySelector('.tok-link');
    expect(link?.classList.contains('tok-strike')).toBe(true);
    expect(hasBareStrikeAncestor(link)).toBe(false);
  });

  it('13. long raw URL inside strikethrough — structurally identical to the short case', () => {
    const view = mountView(
      'Lead. ~~before https://example.com/a/really/long/path/segment/that/should/wrap/naturally/across/lines after~~'
    );
    const link = view.dom.querySelector('.tok-link');
    expect(link?.classList.contains('tok-strike')).toBe(true);
    expect(hasBareStrikeAncestor(link)).toBe(false);
  });

  it('regression: struck WikiLink/Tag/InlineCode are unaffected — still self-compose tok-strike onto their own root, exactly as before', () => {
    const view = mountView('Lead. ~~[[Page]] #tag `code`~~', noResolvers, true);
    const wikilink = view.dom.querySelector('.tok-wikilink');
    const tag = view.dom.querySelector('.tok-tag');
    const code = view.dom.querySelector('.tok-code');
    expect(wikilink?.classList.contains('tok-strike')).toBe(true);
    expect(tag?.classList.contains('tok-strike')).toBe(true);
    expect(code?.classList.contains('tok-strike')).toBe(true);
  });

  it('regression: an UNSTRUCK link never carries tok-strike and still has a .tok-link-title inner span', () => {
    const view = mountView('Lead. [Google](url) plain.');
    const link = view.dom.querySelector('.tok-link');
    expect(link?.classList.contains('tok-strike')).toBe(false);
    expect(link?.querySelector('.tok-link-title')?.textContent).toBe('Google');
  });

  it('there is no .tok-link-strike (retired per-construct strike class) anywhere', () => {
    const view = mountView(
      'Lead. ~~[Google](url) <https://example.com> https://bare.example.com~~'
    );
    expect(view.dom.querySelector('.tok-link-strike')).toBeNull();
  });
});
