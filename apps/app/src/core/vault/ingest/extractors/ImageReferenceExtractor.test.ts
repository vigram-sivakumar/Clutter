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
