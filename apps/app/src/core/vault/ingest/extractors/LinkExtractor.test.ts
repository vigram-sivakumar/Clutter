import { describe, expect, it } from 'vitest';

import { EmbedExtractor } from './EmbedExtractor';
import { LinkExtractor } from './LinkExtractor';

describe('LinkExtractor', () => {
  const extractor = new LinkExtractor();

  it('extracts a wiki link with its exact source range', () => {
    const content = 'See [[Projects/Alpha]] for more.';
    const [link] = extractor.extract(content);

    expect(link).toMatchObject({ target: 'Projects/Alpha' });
    expect(content.slice(link!.startOffset, link!.endOffset)).toBe('[[Projects/Alpha]]');
  });

  it('gives every occurrence its own range, so identical links stay distinguishable', () => {
    const content = '[[A]] and again [[A]]';
    const links = extractor.extract(content);

    expect(links.map((link) => [link.startOffset, link.endOffset])).toEqual([
      [0, 5],
      [16, 21],
    ]);
  });

  it('keeps heading, block reference and alias parsing', () => {
    const [heading, block, alias] = extractor.extract('[[A#Intro]] [[B#^abc]] [[C|See C]]');

    expect(heading).toMatchObject({ target: 'A', heading: 'Intro' });
    expect(block).toMatchObject({ target: 'B', blockReference: 'abc' });
    expect(alias).toMatchObject({ target: 'C', alias: 'See C' });
  });

  it('does not report an embed as a link — `![[X]]` belongs to EmbedExtractor', () => {
    expect(extractor.extract('![[Alpha]]')).toEqual([]);
    expect(extractor.extract('![[Alpha]] and [[Beta]]').map((link) => link.target)).toEqual(['Beta']);
  });
});

describe('EmbedExtractor', () => {
  const extractor = new EmbedExtractor();

  it('extracts an embed with its exact source range, including the leading `!`', () => {
    const content = 'Before\n![[Projects/Alpha]]\nAfter';
    const [embed] = extractor.extract(content);

    expect(embed).toMatchObject({ target: 'Projects/Alpha' });
    expect(content.slice(embed!.startOffset, embed!.endOffset)).toBe('![[Projects/Alpha]]');
  });

  describe('code', () => {
    const links = new LinkExtractor();
    const embeds = new EmbedExtractor();

    it('ignores links and embeds inside fenced, tilde-fenced and indented code and inline spans', () => {
      const content = [
        '```',
        '[[Fenced]] ![[FencedEmbed]]',
        '```',
        '',
        '~~~',
        '[[Tilde]]',
        '~~~',
        '',
        '    [[Indented]]',
        '',
        'Inline `[[Span]]` and `![[SpanEmbed]]`.',
      ].join('\n');

      expect(links.extract(content)).toEqual([]);
      expect(embeds.extract(content)).toEqual([]);
    });

    it('still extracts links and embeds outside code, with their exact ranges', () => {
      const content = '`x` [[A]] ![[B]]\n\n```\n[[C]]\n```\n\n[[D]]';

      expect(links.extract(content).map((link) => link.target)).toEqual([
        'A',
        'D',
      ]);
      expect(embeds.extract(content).map((embed) => embed.target)).toEqual([
        'B',
      ]);
    });
  });
});
