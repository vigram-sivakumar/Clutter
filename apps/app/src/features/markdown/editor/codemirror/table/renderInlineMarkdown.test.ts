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

  it('renders bold, italic and bold-italic', () => {
    expect(renderInlineMarkdown('**b** *i* ***bi***')).toBe('<strong>b</strong> <em>i</em> <em><strong>bi</strong></em>');
  });

  it('renders highlight as <mark>', () => {
    expect(renderInlineMarkdown('==hot==')).toBe('<mark class="cm-table-cell-highlight">hot</mark>');
  });

  it('renders mixed formatting and plain text in one cell, nesting valid combinations', () => {
    expect(renderInlineMarkdown('plain **bold ==marked==** and `code` *it*')).toBe(
      'plain <strong>bold <mark class="cm-table-cell-highlight">marked</mark></strong> and <code class="cm-table-cell-code">code</code> <em>it</em>'
    );
  });

  it('does not format inside inline code', () => {
    expect(renderInlineMarkdown('`**x**`')).toBe('<code class="cm-table-cell-code">**x**</code>');
  });

  it('adds the editor tok-* classes only when styled, so cells match paragraphs', () => {
    expect(renderInlineMarkdown('**b** *i* ~~s~~ ==h== `c`', { styled: true })).toBe(
      '<strong class="tok-strong">b</strong> <em class="tok-emphasis">i</em> <s class="tok-strike">s</s> <mark class="tok-highlight cm-table-cell-highlight">h</mark> <code class="tok-code cm-table-cell-code">c</code>'
    );
    expect(renderInlineMarkdown('**b**')).toBe('<strong>b</strong>');
  });
});
