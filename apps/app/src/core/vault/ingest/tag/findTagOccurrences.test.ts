import { describe, expect, it } from 'vitest';

import { findTagOccurrences } from './findTagOccurrences';

const names = (markdown: string) => findTagOccurrences(markdown).map((span) => span.name);

describe('findTagOccurrences — what is a tag', () => {
  it('finds inline tags with exact offsets', () => {
    const markdown = 'Working on #design today, and #research.';
    const spans = findTagOccurrences(markdown);

    expect(spans.map((s) => s.name)).toEqual(['design', 'research']);
    expect(spans.map((s) => markdown.slice(s.startOffset, s.endOffset))).toEqual([
      '#design',
      '#research',
    ]);
  });

  it('keeps Unicode tags whole', () => {
    expect(names('#café and #日本語 and #naïve-design')).toEqual(['café', '日本語', 'naïve-design']);
  });

  it('an ATX heading is not a tag, and neither is its text', () => {
    expect(names('# Heading')).toEqual([]);
    expect(names('## Heading\n\n### Another one')).toEqual([]);
  });

  it('a hash with no space is a tag, not a heading', () => {
    expect(names('#Heading')).toEqual(['Heading']);
  });

  it('a tag inside a heading is still a tag', () => {
    expect(names('## Plan #design')).toEqual(['design']);
  });

  it('inline code is not a tag', () => {
    expect(names('use `#design` here')).toEqual([]);
    expect(names('`#design` and #real')).toEqual(['real']);
  });

  it('fenced code is not a tag (backtick and tilde fences, any language)', () => {
    expect(names('```text\n#design\n```')).toEqual([]);
    expect(names('~~~\n#design\n~~~')).toEqual([]);
    expect(names('```markdown\n# Heading\n#tag\n```\n#after')).toEqual(['after']);
  });

  it('an escaped hash is not a tag', () => {
    expect(names('\\#design')).toEqual([]);
    expect(names('\\#design but #design')).toEqual(['design']);
  });

  it('a hash glued to a word, or inside a URL, is not a tag', () => {
    expect(names('foo#bar')).toEqual([]);
    expect(names('see https://example.com/page#section for more')).toEqual([]);
    expect(names('[link](https://example.com/#anchor)')).toEqual([]);
  });

  it('numbers-only and nested-looking runs are not tags', () => {
    expect(names('issue #123 and #foo/bar')).toEqual([]);
  });

  it('sentence punctuation does not become part of the tag', () => {
    expect(names('#design, #design. #design!')).toEqual(['design', 'design', 'design']);
    // Boundary rule: only start-of-line or whitespace may precede the '#'.
    expect(names('(#design)')).toEqual([]);
  });

  it('a tag in link text, a list item, a blockquote and a table cell is a tag', () => {
    expect(names('[see #design](note.md)')).toEqual(['design']);
    expect(names('- item #a\n- item #b')).toEqual(['a', 'b']);
    expect(names('> quoted #q')).toEqual(['q']);
    expect(names('| a | b |\n| - | - |\n| #x | y |')).toEqual(['x']);
  });

  it('a four-space indented line is ordinary text here, exactly as in the editor (IndentedCode is removed)', () => {
    expect(names('para\n\n    #indented')).toEqual(['indented']);
  });

  it('a tag at the start of every line is found', () => {
    expect(names('#a\n#b\n#c')).toEqual(['a', 'b', 'c']);
  });

  it('a # inside a WikiLink or embed is part of the link, never a tag — exactly as in the editor', () => {
    expect(names('[[Note #x]] #real')).toEqual(['real']);
    expect(names('![[Note #x]] #real')).toEqual(['real']);
  });

  it('preserves the exact spelling', () => {
    expect(names('#Project #project #PRODUCT-design')).toEqual(['Project', 'project', 'PRODUCT-design']);
  });
});
