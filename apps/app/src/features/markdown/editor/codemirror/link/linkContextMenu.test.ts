// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import { editorLinkAt } from './linkContextMenu';

function resolve(source: string, needle: string) {
  const state = EditorState.create({
    doc: source,
    extensions: [markdownLanguageExtension()],
  });
  return editorLinkAt(state, source.indexOf(needle) + 1);
}

describe('editor link context target', () => {
  it.each([
    [
      '[Display text](https://example.com/path)',
      'Display',
      'https://example.com/path',
    ],
    [
      '[**Formatted** label](https://example.com/a(b) "Title")',
      'Formatted',
      'https://example.com/a(b)',
    ],
    ['[Use `code`](https://example.com)', 'code', 'https://example.com'],
    ['[](https://example.com)', 'https', 'https://example.com'],
    [
      '[Domain](www.example.com/path)',
      'Domain',
      'https://www.example.com/path',
    ],
    [
      '[Angle](<https://example.com/path>)',
      'Angle',
      'https://example.com/path',
    ],
    [
      '[Escaped](https://example.com/a\\(b\\)?a=1&amp;b=2)',
      'Escaped',
      'https://example.com/a(b)?a=1&b=2',
    ],
    ['<https://example.com/path>', 'https', 'https://example.com/path'],
    ['<person@example.com>', 'person', 'mailto:person@example.com'],
  ])(
    'preserves the complete source of %s and resolves its destination',
    (source, needle, url) => {
      expect(resolve(source, needle)).toEqual({
        from: 0,
        to: source.length,
        url,
        markdown: source,
      });
    }
  );

  it('represents a bare URL as a Markdown autolink', () => {
    expect(
      resolve('before https://example.com/path after', 'https')
    ).toMatchObject({
      url: 'https://example.com/path',
      markdown: '<https://example.com/path>',
    });
  });

  it.each(['example.com/path', 'www.example.com/path'])(
    'uses a portable Markdown link for a scheme-less URL: %s',
    (source) => {
      expect(resolve(source, source)).toMatchObject({
        url: `https://${source}`,
        markdown: `[${source}](<https://${source}>)`,
      });
    }
  );

  it('finds the enclosing Markdown link when clicking its destination', () => {
    expect(
      resolve('[Different label](https://example.com)', 'https')?.markdown
    ).toBe('[Different label](https://example.com)');
  });

  it.each([
    ['ordinary text', 'ordinary'],
    ['![Alt](https://example.com/image.png)', 'https'],
    ['`https://example.com`', 'https'],
    ['```\nhttps://example.com\n```', 'https'],
    ['    https://example.com', 'https'],
    ['[[Other note]]', 'Other'],
    ['[Display][reference]\n\n[reference]: https://example.com', 'Display'],
  ])('does not treat non-link content as a URL link: %s', (source, needle) => {
    expect(resolve(source, needle)).toBeNull();
  });
});
