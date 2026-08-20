// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ResolveTag, TagResolution } from '../editor/codemirror/tag/tagResolution';
import type { ResolveWikiLink, WikiLinkResolution } from '../editor/codemirror/wikilink/wikiLinkResolution';
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

  it('renders inline code as a <code> element', () => {
    const { container } = render(<>{renderCompactMarkdown('`npm run build`')}</>);
    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    expect(code).toHaveTextContent('npm run build');
    expect(code).toHaveClass('compact-markdown-code');
  });

  describe('WikiLink resolution', () => {
    it('uses the injected resolver display label and status', () => {
      const resolution: WikiLinkResolution = { status: 'resolved', displayLabel: 'Project Alpha', activate: () => {} };
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
    it('renders a standard Markdown link as its label text, with no element wrapper and no URL', () => {
      const { container } = render(<>{renderCompactMarkdown('[Clutter](https://clutter.app)')}</>);

      expect(container).toHaveTextContent('Clutter');
      expect(container).not.toHaveTextContent('https://clutter.app');
      expect(container.querySelector('a')).toBeNull();
    });

    it('renders an image as its alt text, with no URL', () => {
      const { container } = render(<>{renderCompactMarkdown('![diagram](https://img.example.com/a.png)')}</>);

      expect(container).toHaveTextContent('diagram');
      expect(container).not.toHaveTextContent('https://img.example.com/a.png');
    });

    it('renders an angle-bracket autolink as the bare URL, stripping < >', () => {
      const { container } = render(<>{renderCompactMarkdown('<https://example.com>')}</>);

      expect(container).toHaveTextContent('https://example.com');
      expect(container).not.toHaveTextContent('<https://example.com>');
    });

    it('renders a bare URL autolink verbatim', () => {
      const { container } = render(<>{renderCompactMarkdown('see https://example.com for details')}</>);

      expect(container).toHaveTextContent('see https://example.com for details');
    });
  });

  it('renders mixed content in document order with plain text gaps preserved', () => {
    const { container } = render(<>{renderCompactMarkdown('Ship **[[Project Alpha]]** by @2020-01-15 #urgent')}</>);

    expect(container).toHaveTextContent('Ship [[Project Alpha]] by @15 January 2020 #urgent');
    expect(container.querySelector('strong')).not.toBeNull();
    expect(container.querySelector('.compact-markdown-date')).not.toBeNull();
    expect(container.querySelector('.compact-markdown-tag')).not.toBeNull();
    // The WikiLink is nested inside bold, so per tokenizeCompactMarkdown's
    // documented v1 scope it stays literal raw text within the <strong>,
    // not a separately resolved .compact-markdown-wikilink span.
    expect(container.querySelector('.compact-markdown-wikilink')).toBeNull();
  });
});
