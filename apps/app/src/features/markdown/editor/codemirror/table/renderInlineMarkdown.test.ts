import { describe, expect, it } from 'vitest';

import { renderInlineMarkdown } from './renderInlineMarkdown';

describe('renderInlineMarkdown', () => {
  it('renders plain text unchanged', () => {
    expect(renderInlineMarkdown('hello')).toBe('hello');
  });

  it('escapes HTML-significant characters in plain text', () => {
    expect(renderInlineMarkdown('a < b & c')).toBe('a &lt; b &amp; c');
  });

  it('renders bold text as <strong>', () => {
    expect(renderInlineMarkdown('**Bold**')).toBe('<strong>Bold</strong>');
  });

  it('renders italic text as <em>', () => {
    expect(renderInlineMarkdown('*Italic*')).toBe('<em>Italic</em>');
  });

  it('renders inline code as <code>', () => {
    expect(renderInlineMarkdown('`code`')).toBe('<code class="cm-table-cell-code">code</code>');
  });

  it('renders a link as its label text', () => {
    expect(renderInlineMarkdown('[label](https://example.com)')).toBe('label');
  });

  it('renders a WikiLink as its raw path (no resolver injected)', () => {
    expect(renderInlineMarkdown('[[Page]]')).toBe('<span class="cm-table-cell-wikilink">Page</span>');
  });

  it('renders a WikiLink alias as the raw path, matching fallbackWikiLinkResolution', () => {
    expect(renderInlineMarkdown('[[Page|Alias]]')).toBe('<span class="cm-table-cell-wikilink">Page</span>');
  });

  it('composes multiple spans in document order', () => {
    expect(renderInlineMarkdown('a **b** c')).toBe('a <strong>b</strong> c');
  });
});
