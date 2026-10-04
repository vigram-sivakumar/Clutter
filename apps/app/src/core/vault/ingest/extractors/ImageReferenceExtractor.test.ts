import { describe, expect, it } from 'vitest';

import { ImageReferenceExtractor } from './ImageReferenceExtractor';

const extract = (content: string) => new ImageReferenceExtractor().extract(content);

describe('ImageReferenceExtractor', () => {
  it('finds local and remote image sources in document order, exactly as written', () => {
    expect(
      extract('Intro ![Photo](assets/photo.png)\n\n![Mountain](https://example.com/mountain.jpg)')
    ).toEqual(['assets/photo.png', 'https://example.com/mountain.jpg']);
  });

  it('keeps a raw space in a destination, drops a title, and unwraps <...>', () => {
    expect(extract('![a](my photo.png) ![b](pic.png "A title") ![c](<with space.png>) ![d](x.png \'t\')')).toEqual([
      'my photo.png',
      'pic.png',
      'with space.png',
      'x.png',
    ]);
  });

  it('ignores wikilink embeds, plain links and an empty destination', () => {
    expect(extract('![[note]] ![[pic.png]] [link](a.png) ![alt]() ![alt]')).toEqual([]);
  });

  it('ignores images inside fenced code, indented code and inline code', () => {
    const content = ['```md', '![x](in-fence.png)', '```', '', '    ![y](indented.png)', '', 'Use `![z](inline.png)` here', '', '![real](real.png)'].join('\n');

    expect(extract(content)).toEqual(['real.png']);
  });

  it('keeps the presentation segment out of the source (it lives in the alt bracket)', () => {
    expect(extract('![Mountain view|6,center,fit](photo.jpg)')).toEqual(['photo.jpg']);
  });

  it('returns nothing for content without an image', () => {
    expect(extract('')).toEqual([]);
    expect(extract('just text')).toEqual([]);
  });
});

describe('ImageReferenceExtractor.replaceSource', () => {
  const extractor = new ImageReferenceExtractor();
  const url = 'https://example.com/a.png';

  it('replaces only the destination, keeping alt text and a title', () => {
    expect(extractor.replaceSource(`![sea](${url} "A sea")`, url, 'Assets/a.png')).toBe(
      '![sea](Assets/a.png "A sea")'
    );
  });

  it('keeps angle brackets and replaces every matching image', () => {
    expect(
      extractor.replaceSource(`![](<${url}>)\n\n![x](${url})`, url, 'Assets/a.png')
    ).toBe('![](<Assets/a.png>)\n\n![x](Assets/a.png)');
  });

  it('leaves other images, links and code alone', () => {
    const content = [
      `![other](https://example.com/b.png)`,
      `[link](${url})`,
      '`![in code](' + url + ')`',
      '```',
      `![fenced](${url})`,
      '```',
    ].join('\n');

    expect(extractor.replaceSource(content, url, 'Assets/a.png')).toBe(content);
  });

  it('returns the content unchanged when nothing matches', () => {
    expect(extractor.replaceSource('plain text', url, 'Assets/a.png')).toBe('plain text');
  });
});

describe('ImageReferenceExtractor.extractImages', () => {
  const extractor = new ImageReferenceExtractor();

  it('returns the display text and source of every image, in order', () => {
    expect(
      extractor.extractImages('![One](a.png) text ![ Two words ](<b c.png> "title") ![](d.png)')
    ).toEqual([
      { alt: 'One', src: 'a.png' },
      { alt: 'Two words', src: 'b c.png' },
      { alt: '', src: 'd.png' },
    ]);
  });

  it('ignores code, links and wiki embeds', () => {
    expect(extractor.extractImages('`![x](a.png)` [l](b.png) ![[c.png]]\n```\n![f](d.png)\n```')).toEqual([]);
  });
});
