// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ResolveTag, TagResolution } from '../editor/codemirror/tag/tagResolution';
import type { ResolveWikiLink, WikiLinkResolution } from '../editor/codemirror/wikilink/wikiLinkResolution';
import type { PageEmbedResolution, ResolvePageEmbed } from './blocks/pageEmbedResolution';
import { renderCompactMarkdown } from './renderCompactMarkdown';

describe('renderCompactMarkdown', () => {
  it('renders plain text verbatim', () => {
    const { container } = render(<>{renderCompactMarkdown('Ship the release notes')}</>);
    expect(container).toHaveTextContent('Ship the release notes');
    expect(container.querySelector('strong, em, s, code')).toBeNull();
  });

  it('renders bold text as a <strong> element', () => {
    const { container } = render(<>{renderCompactMarkdown('**Ship it**')}</>);
    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong).toHaveTextContent('Ship it');
  });

  it('renders italic text as an <em> element', () => {
    const { container } = render(<>{renderCompactMarkdown('*Ship it*')}</>);
    const em = container.querySelector('em');
    expect(em).not.toBeNull();
    expect(em).toHaveTextContent('Ship it');
  });

  it('renders strikethrough text as an <s> element', () => {
    const { container } = render(<>{renderCompactMarkdown('~~Ship it~~')}</>);
    const s = container.querySelector('s');
    expect(s).not.toBeNull();
    expect(s).toHaveTextContent('Ship it');
  });

  it('renders highlighted text as a <mark> element', () => {
    const { container } = render(<>{renderCompactMarkdown('==Ship it==')}</>);
    const mark = container.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark).toHaveTextContent('Ship it');
  });

  it('renders inline code as a <code> element', () => {
    const { container } = render(<>{renderCompactMarkdown('`npm run build`')}</>);
    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    expect(code).toHaveTextContent('npm run build');
    expect(code).toHaveClass('compact-markdown-code');
  });

  describe('WikiLink resolution', () => {
    it('uses the injected resolver display label and status', () => {
      const resolution: WikiLinkResolution = { status: 'resolved', icon: 'note', emoji: null, displayLabel: 'Project Alpha', activate: () => {} };
      const resolveWikiLink: ResolveWikiLink = vi.fn().mockReturnValue(resolution);

      const { container } = render(<>{renderCompactMarkdown('[[Projects/Alpha|Alpha]]', { resolveWikiLink })}</>);

      expect(resolveWikiLink).toHaveBeenCalledWith('Projects/Alpha', 'Alpha');
      const span = container.querySelector('.compact-markdown-wikilink');
      expect(span).toHaveTextContent('Project Alpha');
      expect(span).toHaveAttribute('data-wikilink-status', 'resolved');
    });

    it('falls back to the raw path when no resolver is injected', () => {
      const { container } = render(<>{renderCompactMarkdown('[[Project Alpha]]')}</>);

      const span = container.querySelector('.compact-markdown-wikilink');
      expect(span).toHaveTextContent('Project Alpha');
      expect(span).toHaveAttribute('data-wikilink-status', 'unresolved');
    });
  });

  describe('Tag resolution', () => {
    it('uses the injected resolver display label and status, with a # prefix', () => {
      const resolution: TagResolution = { status: 'resolved', displayLabel: 'Product design', activate: () => {} };
      const resolveTag: ResolveTag = vi.fn().mockReturnValue(resolution);

      const { container } = render(<>{renderCompactMarkdown('#Product_design', { resolveTag })}</>);

      expect(resolveTag).toHaveBeenCalledWith('Product_design');
      const span = container.querySelector('.compact-markdown-tag');
      expect(span).toHaveTextContent('#Product design');
      expect(span).toHaveAttribute('data-tag-status', 'resolved');
    });

    it('falls back to the formatted raw name when no resolver is injected', () => {
      const { container } = render(<>{renderCompactMarkdown('#urgent')}</>);

      const span = container.querySelector('.compact-markdown-tag');
      expect(span).toHaveTextContent('#urgent');
      expect(span).toHaveAttribute('data-tag-status', 'unresolved');
    });
  });

  describe('Date rendering', () => {
    it('renders a valid date via the shared compact formatter, with an @ prefix', () => {
      // A date far outside any plausible test-run week, so the formatter
      // deterministically takes its "full date" branch rather than a
      // relative day-identity label that would depend on the real clock.
      const { container } = render(<>{renderCompactMarkdown('@2020-01-15')}</>);

      const span = container.querySelector('.compact-markdown-date');
      expect(span).toHaveAttribute('data-date-status', 'valid');
      expect(span).toHaveTextContent('@15 January 2020');
    });

    it('renders a shape-valid but calendar-invalid date as its own raw text', () => {
      const { container } = render(<>{renderCompactMarkdown('@2026-13-45')}</>);

      const span = container.querySelector('.compact-markdown-date');
      expect(span).toHaveAttribute('data-date-status', 'invalid');
      expect(span).toHaveTextContent('@2026-13-45');
    });
  });

  describe('Link and image rendering', () => {
    it('renders a standard Markdown link in a styled .compact-markdown-link span, never an <a>, with no URL', () => {
      const { container } = render(<>{renderCompactMarkdown('[Clutter](https://clutter.app)')}</>);

      const link = container.querySelector('.compact-markdown-link');
      expect(link).toHaveTextContent('Clutter');
      expect(container).not.toHaveTextContent('https://clutter.app');
      expect(container.querySelector('a')).toBeNull();
    });

    it('renders an image as its alt text, with no URL', () => {
      const { container } = render(<>{renderCompactMarkdown('![diagram](https://img.example.com/a.png)')}</>);

      expect(container).toHaveTextContent('diagram');
      expect(container).not.toHaveTextContent('https://img.example.com/a.png');
    });

    it('renders an image/PDF embed as its target path, with no image/PDF display', () => {
      const { container } = render(<>{renderCompactMarkdown('![[Photos/beach.jpg]]')}</>);

      expect(container).toHaveTextContent('Photos/beach.jpg');
      expect(container.querySelector('img, canvas')).toBeNull();
    });

    it('renders an angle-bracket autolink as the bare URL in the same styled .compact-markdown-link span, stripping < >', () => {
      const { container } = render(<>{renderCompactMarkdown('<https://example.com>')}</>);

      const link = container.querySelector('.compact-markdown-link');
      expect(link).toHaveTextContent('https://example.com');
      expect(container).not.toHaveTextContent('<https://example.com>');
    });

    it('renders a bare URL autolink in the same styled .compact-markdown-link span as an explicit Markdown link', () => {
      const { container } = render(<>{renderCompactMarkdown('see https://example.com for details')}</>);

      const link = container.querySelector('.compact-markdown-link');
      expect(link).toHaveTextContent('https://example.com');
      expect(container).toHaveTextContent('see https://example.com for details');
    });
  });

  describe('Link/URL/Autolink compact styling parity with the editor', () => {
    it('a Markdown Link and a bare URL both use the same .compact-markdown-link class', () => {
      const linkResult = render(<>{renderCompactMarkdown('[Google](https://google.com)')}</>);
      const urlResult = render(<>{renderCompactMarkdown('https://google.com')}</>);

      const linkSpan = linkResult.container.querySelector('.compact-markdown-link');
      const urlSpan = urlResult.container.querySelector('.compact-markdown-link');
      expect(linkSpan).not.toBeNull();
      expect(urlSpan).not.toBeNull();
      expect(linkSpan!.tagName).toBe(urlSpan!.tagName);
      expect(linkSpan).toHaveTextContent('Google');
      expect(urlSpan).toHaveTextContent('https://google.com');
    });

    it('never renders an <a> element for any link/URL/autolink form', () => {
      for (const markdown of ['[Google](https://google.com)', 'https://google.com', '<https://google.com>']) {
        const { container } = render(<>{renderCompactMarkdown(markdown)}</>);
        expect(container.querySelector('a')).toBeNull();
        expect(container.querySelector('.compact-markdown-link')).not.toBeNull();
      }
    });
  });

  describe('Date compact styling parity with the editor', () => {
    it('renders through the shared .compact-markdown-date class (the same class the editor-parity CSS targets)', () => {
      const { container } = render(<>{renderCompactMarkdown('@2020-01-15')}</>);

      const span = container.querySelector('.compact-markdown-date');
      expect(span).not.toBeNull();
      expect(span).toHaveTextContent('@15 January 2020');
      // The color itself lives in CompactMarkdown.css (jsdom does not load
      // stylesheets), so this asserts the DOM contract the CSS rule keys
      // off — the actual `--md-date-foreground` value is asserted by
      // reading CompactMarkdown.css directly (see the co-located CSS test
      // below), the same split every other construct's styling test uses.
    });
  });

  describe('Tag badge chrome parity with the editor', () => {
    it('preserves the existing tag structure — prefix span, status attribute — unchanged by the new badge styling', () => {
      const { container } = render(<>{renderCompactMarkdown('#urgent')}</>);

      const tag = container.querySelector('.compact-markdown-tag');
      expect(tag).toHaveAttribute('data-tag-status', 'unresolved');
      expect(tag!.querySelector('.compact-markdown-tag-prefix')).not.toBeNull();
      expect(tag).toHaveTextContent('#urgent');
    });
  });

  describe('Embed resolution', () => {
    it('falls back to the raw target path when no resolver is injected', () => {
      const { container } = render(<>{renderCompactMarkdown('![[Photos/beach.jpg]]')}</>);

      expect(container).toHaveTextContent('Photos/beach.jpg');
      expect(container.querySelector('img, canvas')).toBeNull();
    });

    it('uses the resolved target title, never the raw path', () => {
      const resolution: PageEmbedResolution = {
        status: 'resolved',
        pageId: 'page-1',
        title: 'Project Alpha',
        markdown: 'irrelevant',
        icon: 'note',
        emoji: null,
      };
      const resolveEmbed: ResolvePageEmbed = vi.fn().mockReturnValue(resolution);

      const { container } = render(<>{renderCompactMarkdown('![[Projects/Alpha]]', { resolveEmbed })}</>);

      expect(resolveEmbed).toHaveBeenCalledWith('Projects/Alpha');
      expect(container).toHaveTextContent('Project Alpha');
      expect(container).not.toHaveTextContent('Projects/Alpha');
    });

    it('renders a heading-target embed\'s resolved "Page title › Heading" form', () => {
      const resolution: PageEmbedResolution = {
        status: 'resolved',
        pageId: 'page-1',
        title: 'Project Alpha › Risks',
        markdown: 'irrelevant',
        icon: 'note',
        emoji: null,
      };
      const resolveEmbed: ResolvePageEmbed = vi.fn().mockReturnValue(resolution);

      const { container } = render(<>{renderCompactMarkdown('![[Project Alpha#Risks]]', { resolveEmbed })}</>);

      expect(container).toHaveTextContent('Project Alpha › Risks');
    });

    it('uses the resolver\'s own basename display label for an unresolved target', () => {
      const resolution: PageEmbedResolution = { status: 'unresolved', displayLabel: 'Missing Page' };
      const resolveEmbed: ResolvePageEmbed = vi.fn().mockReturnValue(resolution);

      const { container } = render(<>{renderCompactMarkdown('![[Somewhere/Missing Page]]', { resolveEmbed })}</>);

      expect(container).toHaveTextContent('Missing Page');
      expect(container).not.toHaveTextContent('Somewhere/Missing Page');
    });

    it('uses the resolver\'s own display label for an ambiguous target', () => {
      const resolution: PageEmbedResolution = { status: 'ambiguous', displayLabel: 'Alpha' };
      const resolveEmbed: ResolvePageEmbed = vi.fn().mockReturnValue(resolution);

      const { container } = render(<>{renderCompactMarkdown('![[Alpha]]', { resolveEmbed })}</>);

      expect(container).toHaveTextContent('Alpha');
    });

    it('never exposes raw "![[...]]" syntax, regardless of resolution status or whether a resolver is injected', () => {
      const statuses: PageEmbedResolution[] = [
        { status: 'resolved', pageId: 'page-1', title: 'Project Alpha', markdown: '', icon: 'note', emoji: null },
        { status: 'unresolved', displayLabel: 'Missing Page' },
        { status: 'ambiguous', displayLabel: 'Alpha' },
        { status: 'unresolved-heading', pageId: 'page-1', displayLabel: 'Project Alpha › Missing Heading' },
      ];

      for (const resolution of statuses) {
        const resolveEmbed: ResolvePageEmbed = () => resolution;
        const { container } = render(<>{renderCompactMarkdown('![[Some/Target]]', { resolveEmbed })}</>);
        expect(container.textContent).not.toMatch(/!\[\[|\]\]/);
      }

      // No resolver injected at all — falls back to the raw path (a plain
      // basename-shaped string, not the `![[...]]` wrapper itself).
      const { container } = render(<>{renderCompactMarkdown('![[Some/Target]]')}</>);
      expect(container.textContent).not.toMatch(/!\[\[|\]\]/);
    });
  });

  describe('Link/Image fallback rendering', () => {
    it('renders a link with an empty label as the URL itself', () => {
      const { container } = render(<>{renderCompactMarkdown('[](https://google.com)')}</>);

      expect(container).toHaveTextContent('https://google.com');
    });

    it('renders an image with empty alt text as the URL basename, without its extension', () => {
      const { container } = render(<>{renderCompactMarkdown('![](architecture.png)')}</>);

      expect(container).toHaveTextContent('architecture');
      expect(container).not.toHaveTextContent('architecture.png');
    });
  });

  it('renders mixed content in document order with plain text gaps preserved', () => {
    const { container } = render(<>{renderCompactMarkdown('Ship **[[Project Alpha]]** by @2020-01-15 #urgent')}</>);

    expect(container).toHaveTextContent('Ship Project Alpha by @15 January 2020 #urgent');
    expect(container.querySelector('strong')).not.toBeNull();
    expect(container.querySelector('.compact-markdown-date')).not.toBeNull();
    expect(container.querySelector('.compact-markdown-tag')).not.toBeNull();
    // Since the nested-inline composition fix: a WikiLink nested inside
    // bold is recursed into and resolved through the real WikiLink span,
    // never left as literal raw text — the .compact-markdown-wikilink
    // element exists, and it is nested *inside* the <strong> (composing,
    // not replacing, the parent's own styling).
    const wikilink = container.querySelector('.compact-markdown-wikilink');
    expect(wikilink).not.toBeNull();
    expect(container.querySelector('strong')!.contains(wikilink)).toBe(true);
    expect(container).not.toHaveTextContent('[[Project Alpha]]');
  });

  describe('nested inline composition — parent styling wraps a resolved child span, never raw syntax', () => {
    it('~~`strike through`~~ — per the Strikethrough Rendering Contract, InlineCode owns its own strike; it is NOT nested inside an <s>', () => {
      const { container } = render(<>{renderCompactMarkdown('~~`strike through`~~')}</>);

      const code = container.querySelector('code.compact-markdown-code');
      expect(code).not.toBeNull();
      expect(code).toHaveTextContent('strike through');
      expect(container).not.toHaveTextContent('`strike through`');
      // No <s> at all: the code fills the entire strikethrough, so there
      // is no plain-text run left for a generic <s> to own.
      expect(container.querySelector('s')).toBeNull();
      expect((code as HTMLElement).style.textDecorationLine).toBe('line-through');
    });

    it('~~[Google](www.google.co.in)~~ — the Link owns its own strike; it is NOT nested inside an <s>', () => {
      const { container } = render(<>{renderCompactMarkdown('~~[Google](www.google.co.in)~~')}</>);

      const link = container.querySelector('.compact-markdown-link');
      expect(link).not.toBeNull();
      expect(link).toHaveTextContent('Google');
      expect(container).not.toHaveTextContent('[Google]');
      expect(container).not.toHaveTextContent('www.google.co.in');
      expect(container.querySelector('s')).toBeNull();
      // The strike lives on the outer (color-owning) element at the default
      // thickness/color; the underline lives separately on the inner
      // `.compact-markdown-link-title` span (see CompactMarkdown.css) so it
      // never shares `text-decoration-color`/`-thickness` with the strike.
      expect((link as HTMLElement).style.textDecorationLine).toBe('line-through');
      // The underline itself is declared in CompactMarkdown.css on this
      // inner element, not verifiable via jsdom's getComputedStyle (this
      // test environment doesn't apply imported stylesheet rules) — the
      // structural assertion here is that the title text sits inside its
      // own dedicated element, separate from the strike-owning outer span.
      const linkTitle = link!.querySelector('.compact-markdown-link-title');
      expect(linkTitle).not.toBeNull();
      expect(linkTitle).toHaveTextContent('Google');
    });

    it('**[[Project]]** renders a resolved WikiLink nested inside <strong>, no double-bracket syntax visible', () => {
      const resolveWikiLink = vi.fn().mockReturnValue({
        status: 'resolved' as const,
        icon: 'note' as const,
        emoji: null,
        displayLabel: 'Project',
        activate: () => {},
      });

      const { container } = render(<>{renderCompactMarkdown('**[[Project]]**', { resolveWikiLink })}</>);

      const strong = container.querySelector('strong');
      const wikilink = container.querySelector('.compact-markdown-wikilink');
      expect(strong).not.toBeNull();
      expect(wikilink).not.toBeNull();
      expect(strong!.contains(wikilink)).toBe(true);
      expect(wikilink).toHaveTextContent('Project');
      expect(container).not.toHaveTextContent('[[Project]]');
    });

    it('**[Google](www.google.co.in)** renders the link label, still in its own styled span, nested inside <strong>', () => {
      const { container } = render(<>{renderCompactMarkdown('**[Google](www.google.co.in)**')}</>);

      const strong = container.querySelector('strong');
      const link = container.querySelector('.compact-markdown-link');
      expect(strong).not.toBeNull();
      expect(link).not.toBeNull();
      expect(strong!.contains(link)).toBe(true);
      expect(link).toHaveTextContent('Google');
      expect(container).not.toHaveTextContent('[Google]');
    });

    it('==**important**== renders <strong> nested inside the highlight <mark>, composing both stylings', () => {
      const { container } = render(<>{renderCompactMarkdown('==**important**==')}</>);

      const mark = container.querySelector('mark.compact-markdown-highlight');
      const strong = container.querySelector('strong');
      expect(mark).not.toBeNull();
      expect(strong).not.toBeNull();
      expect(mark!.contains(strong)).toBe(true);
      expect(strong).toHaveTextContent('important');
      expect(container).not.toHaveTextContent('**important**');
    });

    it('~~**[Google](www.google.co.in)**~~ — StrongEmphasis (the Strikethrough\'s direct child) owns the strike; no <s> exists; the nested Link is a known, deliberately out-of-scope case (matches the editor\'s own documented limitation for this identical shape)', () => {
      const { container } = render(<>{renderCompactMarkdown('~~**[Google](www.google.co.in)**~~')}</>);

      const strong = container.querySelector('strong');
      const link = container.querySelector('.compact-markdown-link');
      expect(strong).not.toBeNull();
      expect(link).not.toBeNull();
      expect(strong!.contains(link)).toBe(true);
      expect(strong!.style.textDecorationLine).toBe('line-through');
      expect(container).not.toHaveTextContent('[Google]');
      expect(container).not.toHaveTextContent('www.google.co.in');
      expect(container.querySelector('s')).toBeNull();
      // Deliberately out of scope (see renderStruckChildren's own doc
      // comment): only the Strikethrough's direct child (StrongEmphasis)
      // owns a strike here — the Link nested inside it does not
      // additionally self-own one, so its own line-through color is not
      // preserved in this specific triple-nested shape. There is still no
      // ownership *violation* (no element contains another element that
      // also declares its own text-decoration-line) — just an accepted
      // visual gap, identical in scope to the editor's own.
      expect((link as HTMLElement).style.textDecorationLine).toBe('');
    });
  });

  /**
   * Strike-ownership elements — any element the renderer may give its own
   * `text-decoration-line: line-through` when struck (`SELF_STRIKING_KINDS`
   * in `renderCompactMarkdown.tsx`, plus the generic `<s>` itself). Used by
   * `hasStrikeOwner`/`countStrikeOwners` below to find every actual
   * decoration-declaring element in a rendered tree, independent of which
   * CSS class or inline style each one happens to use.
   */
  const STRIKE_OWNER_SELECTOR =
    's, strong, em, mark.compact-markdown-highlight, code.compact-markdown-code, ' +
    '.compact-markdown-wikilink, .compact-markdown-tag, .compact-markdown-date, .compact-markdown-link';

  /** True iff `el` actually declares its own line-through — a real strike owner, not merely a candidate element of a kind that sometimes is one (e.g. an unstruck <strong>). */
  function ownsStrike(el: Element): boolean {
    if (el.tagName === 'S') {
      return true;
    }
    return (el as HTMLElement).style.textDecorationLine.includes('line-through');
  }

  /**
   * The compact-renderer-native equivalent of the editor's
   * `hasBareStrikeAncestor`/`.tok-strike .tok-strike` check — per the
   * Strikethrough Rendering Contract's own §15, "no element with a strike
   * decoration may contain a descendant that also has one." Walks real DOM
   * descendants (this renderer has no decoration-range concept to inspect
   * instead), so it verifies the actual invariant, not an implementation
   * detail specific to either surface.
   */
  function hasNestedStrikeOwner(root: Element): boolean {
    const owners = Array.from(root.querySelectorAll(STRIKE_OWNER_SELECTOR)).filter(ownsStrike);
    return owners.some((owner) => owners.some((other) => other !== owner && owner.contains(other)));
  }

  describe('strikethrough ownership — the Strikethrough Rendering Contract applied to real nested DOM (a strike-owning element must never contain another)', () => {
    it('~~plain strike~~ — plain text is owned by a bare <s>, no styling to preserve', () => {
      const { container } = render(<>{renderCompactMarkdown('~~plain strike~~')}</>);

      const strike = container.querySelector('s');
      expect(strike).not.toBeNull();
      expect(strike).toHaveTextContent('plain strike');
      expect(strike!.className).toBe('');
      expect(hasNestedStrikeOwner(container)).toBe(false);
    });

    it('~~fix #urgent~~ — the Tag owns its own strike as a SIBLING of the <s> wrapping the plain-text run, never its descendant', () => {
      const { container } = render(<>{renderCompactMarkdown('~~fix #urgent~~')}</>);

      const strike = container.querySelector('s');
      const tag = container.querySelector('.compact-markdown-tag');
      expect(strike).not.toBeNull();
      expect(tag).not.toBeNull();
      expect(strike!.textContent).toBe('fix ');
      expect(strike!.contains(tag)).toBe(false);
      expect(tag).toHaveAttribute('data-tag-status', 'unresolved');
      expect(tag!.querySelector('.compact-markdown-tag-prefix')).not.toBeNull();
      expect((tag as HTMLElement).style.textDecorationLine).toBe('line-through');
      expect(hasNestedStrikeOwner(container)).toBe(false);
    });

    it('~~[Google](url)~~ — the Link owns its own strike; no <s> exists at all (the link fills the whole strikethrough)', () => {
      const { container } = render(<>{renderCompactMarkdown('~~[Google](https://google.com)~~')}</>);

      const link = container.querySelector('.compact-markdown-link');
      expect(link).not.toBeNull();
      expect(link).toHaveTextContent('Google');
      expect(container.querySelector('s')).toBeNull();
      // Strike lives on the outer element at the default thickness/color;
      // the underline lives on the separate inner `.compact-markdown-link-title`
      // element (CompactMarkdown.css) so the two never share a
      // `text-decoration-color`/`-thickness`.
      expect((link as HTMLElement).style.textDecorationLine).toBe('line-through');
      expect(link!.querySelector('.compact-markdown-link-title')).not.toBeNull();
      expect(hasNestedStrikeOwner(container)).toBe(false);
    });

    it('~~`code`~~ — the InlineCode owns its own strike; no <s> exists at all', () => {
      const { container } = render(<>{renderCompactMarkdown('~~`code`~~')}</>);

      const code = container.querySelector('.compact-markdown-code');
      expect(code).not.toBeNull();
      expect(code).toHaveTextContent('code');
      expect(container.querySelector('s')).toBeNull();
      expect((code as HTMLElement).style.textDecorationLine).toBe('line-through');
      expect(hasNestedStrikeOwner(container)).toBe(false);
    });

    it('~~**bold**~~ — <strong> owns its own strike (self-applied, not inherited from an ancestor <s>); no Markdown markers leak', () => {
      const { container } = render(<>{renderCompactMarkdown('~~**bold**~~')}</>);

      const strong = container.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong).toHaveTextContent('bold');
      expect(container).not.toHaveTextContent('**bold**');
      expect(container.querySelector('s')).toBeNull();
      expect(strong!.style.textDecorationLine).toBe('line-through');
      expect(hasNestedStrikeOwner(container)).toBe(false);
    });

    it('~~*italic*~~ — <em> owns its own strike, same as <strong>', () => {
      const { container } = render(<>{renderCompactMarkdown('~~*italic*~~')}</>);

      const em = container.querySelector('em');
      expect(em).not.toBeNull();
      expect(em).toHaveTextContent('italic');
      expect(container.querySelector('s')).toBeNull();
      expect(em!.style.textDecorationLine).toBe('line-through');
      expect(hasNestedStrikeOwner(container)).toBe(false);
    });

    it('~~==highlight==~~ — <mark> owns its own strike, same pattern', () => {
      const { container } = render(<>{renderCompactMarkdown('~~==highlight==~~')}</>);

      const mark = container.querySelector('mark.compact-markdown-highlight');
      expect(mark).not.toBeNull();
      expect(mark).toHaveTextContent('highlight');
      expect(container).not.toHaveTextContent('==highlight==');
      expect(container.querySelector('s')).toBeNull();
      expect((mark as HTMLElement).style.textDecorationLine).toBe('line-through');
      expect(hasNestedStrikeOwner(container)).toBe(false);
    });

    it('~~word @2026-09-28~~ — the Date owns its own strike, as a sibling of the <s> wrapping the plain-text run', () => {
      const { container } = render(<>{renderCompactMarkdown('~~word @2026-09-28~~')}</>);

      const strike = container.querySelector('s');
      const date = container.querySelector('.compact-markdown-date');
      expect(strike).not.toBeNull();
      expect(date).not.toBeNull();
      expect(strike!.contains(date)).toBe(false);
      expect((date as HTMLElement).style.textDecorationLine).toBe('line-through');
      expect(hasNestedStrikeOwner(container)).toBe(false);
    });

    it('~~word [[Architecture]]~~ — the WikiLink owns its own strike, as a sibling of the <s> wrapping the plain-text run', () => {
      const { container } = render(<>{renderCompactMarkdown('~~word [[Architecture]]~~')}</>);

      const strike = container.querySelector('s');
      const wikilink = container.querySelector('.compact-markdown-wikilink');
      expect(strike).not.toBeNull();
      expect(wikilink).not.toBeNull();
      expect(strike!.contains(wikilink)).toBe(false);
      // Strike lives on the outer element at the default thickness/color;
      // the underline lives on the separate inner
      // `.compact-markdown-wikilink-title` element (CompactMarkdown.css).
      expect((wikilink as HTMLElement).style.textDecorationLine).toBe('line-through');
      expect(wikilink!.querySelector('.compact-markdown-wikilink-title')).not.toBeNull();
      expect(hasNestedStrikeOwner(container)).toBe(false);
    });

    it('~~plain `code` #tag [Google](url) text~~ — every construct is a sibling strike owner, none nested inside another', () => {
      const { container } = render(
        <>{renderCompactMarkdown('~~plain `code` #tag [Google](https://google.com) text~~')}</>
      );

      const code = container.querySelector('.compact-markdown-code');
      const tag = container.querySelector('.compact-markdown-tag');
      const link = container.querySelector('.compact-markdown-link');
      const strikeSpans = container.querySelectorAll('s');
      expect(code).not.toBeNull();
      expect(tag).not.toBeNull();
      expect(link).not.toBeNull();
      expect(strikeSpans.length).toBeGreaterThan(0);
      // "plain "/" "/" "/" text" — each plain-text gap between the three
      // self-owning constructs (before code, between code and tag, between
      // tag and link, after link) gets its own generic <s>; code/tag/link
      // are siblings, each self-owning.
      expect(Array.from(strikeSpans).map((s) => s.textContent)).toEqual(['plain ', ' ', ' ', ' text']);
      for (const el of [code, tag, link]) {
        expect((el as HTMLElement).style.textDecorationLine).toMatch(/line-through/);
        for (const strike of strikeSpans) {
          expect(strike.contains(el)).toBe(false);
        }
      }
      expect(hasNestedStrikeOwner(container)).toBe(false);
      expect(container).not.toHaveTextContent('`code`');
      expect(container).not.toHaveTextContent('[Google]');
    });

    it('~~plain [Google](url) #tag `code` [[Architecture]] text~~ — Link and WikiLink both own their strike at the default thickness, separate from their own underline', () => {
      const { container } = render(
        <>
          {renderCompactMarkdown('~~plain [Google](https://google.com) #tag `code` [[Architecture]] text~~')}
        </>
      );

      const link = container.querySelector('.compact-markdown-link');
      const tag = container.querySelector('.compact-markdown-tag');
      const code = container.querySelector('.compact-markdown-code');
      const wikilink = container.querySelector('.compact-markdown-wikilink');
      const strikeSpans = container.querySelectorAll('s');
      expect(link).not.toBeNull();
      expect(tag).not.toBeNull();
      expect(code).not.toBeNull();
      expect(wikilink).not.toBeNull();

      // Every self-owning construct's strike is the *bare* `line-through`
      // value — never `underline line-through` — because the underline (for
      // Link/WikiLink) lives on a separate inner `-title` element, per the
      // CSS decoration-sharing fix (CompactMarkdown.css).
      for (const el of [link, tag, code, wikilink]) {
        expect((el as HTMLElement).style.textDecorationLine).toBe('line-through');
      }
      expect(link!.querySelector('.compact-markdown-link-title')).not.toBeNull();
      expect(wikilink!.querySelector('.compact-markdown-wikilink-title')).not.toBeNull();

      for (const el of [link, tag, code, wikilink]) {
        for (const strike of strikeSpans) {
          expect(strike.contains(el)).toBe(false);
        }
      }
      expect(hasNestedStrikeOwner(container)).toBe(false);
      expect(container).not.toHaveTextContent('[Google]');
      expect(container).not.toHaveTextContent('[[Architecture]]');
    });

    it('never introduces a CodeMirror .tok-* class anywhere in compact-rendered DOM', () => {
      const inputs = [
        '~~plain strike~~',
        '~~fix #urgent~~',
        '~~[Google](https://google.com)~~',
        '~~`code`~~',
        '~~**bold**~~',
        '~~**[Google](https://google.com)**~~',
        '~~plain `code` #tag [Google](https://google.com) text~~',
      ];
      for (const markdown of inputs) {
        const { container } = render(<>{renderCompactMarkdown(markdown)}</>);
        expect(container.innerHTML).not.toMatch(/\btok-[a-z-]+/);
      }
    });
  });
});
