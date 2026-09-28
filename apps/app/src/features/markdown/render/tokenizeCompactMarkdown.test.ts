import { describe, expect, it } from 'vitest';

import type { CompactSpan } from './tokenizeCompactMarkdown';
import { tokenizeCompactMarkdown } from './tokenizeCompactMarkdown';

/** Recursively concatenates every span's own authored text, regardless of nesting depth — for asserting "no Markdown marker survives" independent of exact tree shape. */
function flattenText(spans: readonly CompactSpan[]): string {
  return spans
    .map((span) => {
      switch (span.kind) {
        case 'text':
        case 'code':
          return span.value;
        case 'bold':
        case 'italic':
        case 'strikethrough':
        case 'highlight':
          return flattenText(span.children);
        case 'wikilink':
          return span.path;
        case 'tag':
          return span.name;
        case 'date':
          return span.isoDate;
        case 'link':
          return span.label;
        case 'image':
          return span.alt;
        case 'embed':
          return span.path;
      }
    })
    .join('');
}

describe('tokenizeCompactMarkdown', () => {
  it('returns a single text span for plain text', () => {
    expect(tokenizeCompactMarkdown('Ship the release notes')).toEqual([
      { kind: 'text', value: 'Ship the release notes' },
    ]);
  });

  it('returns an empty array for empty text', () => {
    expect(tokenizeCompactMarkdown('')).toEqual([]);
  });

  it('tokenizes bold text, stripping the ** markers', () => {
    expect(tokenizeCompactMarkdown('**Ship it**')).toEqual([
      { kind: 'bold', children: [{ kind: 'text', value: 'Ship it' }] },
    ]);
  });

  it('tokenizes italic text, stripping the * markers', () => {
    expect(tokenizeCompactMarkdown('*Ship it*')).toEqual([
      { kind: 'italic', children: [{ kind: 'text', value: 'Ship it' }] },
    ]);
  });

  it('tokenizes strikethrough text, stripping the ~~ markers', () => {
    expect(tokenizeCompactMarkdown('~~Ship it~~')).toEqual([
      { kind: 'strikethrough', children: [{ kind: 'text', value: 'Ship it' }] },
    ]);
  });

  it('tokenizes highlighted text, stripping the == markers', () => {
    expect(tokenizeCompactMarkdown('==Ship it==')).toEqual([
      { kind: 'highlight', children: [{ kind: 'text', value: 'Ship it' }] },
    ]);
  });

  it('tokenizes inline code, stripping the backtick markers', () => {
    expect(tokenizeCompactMarkdown('`npm run build`')).toEqual([{ kind: 'code', value: 'npm run build' }]);
  });

  it('tokenizes a WikiLink with no alias', () => {
    expect(tokenizeCompactMarkdown('[[Project Alpha]]')).toEqual([
      { kind: 'wikilink', path: 'Project Alpha', alias: null },
    ]);
  });

  it('tokenizes a WikiLink with an alias', () => {
    expect(tokenizeCompactMarkdown('[[Projects/Alpha|Alpha]]')).toEqual([
      { kind: 'wikilink', path: 'Projects/Alpha', alias: 'Alpha' },
    ]);
  });

  it('tokenizes an Embed as its own span, distinct from a WikiLink', () => {
    expect(tokenizeCompactMarkdown('![[photo.png]]')).toEqual([
      { kind: 'embed', path: 'photo.png', alias: null },
    ]);
  });

  it('tokenizes a tag', () => {
    expect(tokenizeCompactMarkdown('#urgent')).toEqual([{ kind: 'tag', name: 'urgent' }]);
  });

  it('tokenizes a bare date', () => {
    expect(tokenizeCompactMarkdown('@2026-08-22')).toEqual([{ kind: 'date', isoDate: '2026-08-22' }]);
  });

  it('does not tokenize a # immediately following non-whitespace as a tag', () => {
    expect(tokenizeCompactMarkdown('foo#tag')).toEqual([{ kind: 'text', value: 'foo#tag' }]);
  });

  it('tokenizes mixed content in document order with plain text gaps preserved', () => {
    expect(tokenizeCompactMarkdown('Ship **[[Project Alpha]]** by @2026-08-22 #urgent')).toEqual([
      { kind: 'text', value: 'Ship ' },
      { kind: 'bold', children: [{ kind: 'wikilink', path: 'Project Alpha', alias: null }] },
      { kind: 'text', value: ' by ' },
      { kind: 'date', isoDate: '2026-08-22' },
      { kind: 'text', value: ' ' },
      { kind: 'tag', name: 'urgent' },
    ]);
  });

  it('tokenizes several independent inline constructs sequentially', () => {
    expect(tokenizeCompactMarkdown('**bold** and *italic* and `code` and ~~gone~~')).toEqual([
      { kind: 'bold', children: [{ kind: 'text', value: 'bold' }] },
      { kind: 'text', value: ' and ' },
      { kind: 'italic', children: [{ kind: 'text', value: 'italic' }] },
      { kind: 'text', value: ' and ' },
      { kind: 'code', value: 'code' },
      { kind: 'text', value: ' and ' },
      { kind: 'strikethrough', children: [{ kind: 'text', value: 'gone' }] },
    ]);
  });

  it('composes nested emphasis (***bold italic***) instead of flattening it to raw text', () => {
    const spans = tokenizeCompactMarkdown('***bold italic***');

    expect(spans).toHaveLength(1);
    const [outer] = spans;
    expect(outer!.kind === 'bold' || outer!.kind === 'italic').toBe(true);
    // Nested, not flattened: the outer span's own children still carry a
    // real, typed inner span (the other emphasis kind), never a raw
    // '*'-wrapped string — no Markdown marker survives at any depth.
    expect(flattenText(spans)).toBe('bold italic');
    expect(flattenText(spans)).not.toMatch(/[*]/);
  });

  it('composes a WikiLink nested inside bold — resolved through the WikiLink span, never raw text', () => {
    expect(tokenizeCompactMarkdown('**[[Note]]**')).toEqual([
      { kind: 'bold', children: [{ kind: 'wikilink', path: 'Note', alias: null }] },
    ]);
  });

  it('tokenizes a standard Markdown link, discarding the URL', () => {
    expect(tokenizeCompactMarkdown('[Clutter](https://clutter.app)')).toEqual([
      { kind: 'link', label: 'Clutter' },
    ]);
  });

  it('tokenizes an image, keeping only the alt text', () => {
    expect(tokenizeCompactMarkdown('![alt text](https://img.example.com/a.png)')).toEqual([
      { kind: 'image', alt: 'alt text' },
    ]);
  });

  it('tokenizes an angle-bracket autolink, stripping the < > marks', () => {
    expect(tokenizeCompactMarkdown('<https://example.com>')).toEqual([
      { kind: 'link', label: 'https://example.com' },
    ]);
  });

  it('tokenizes an angle-bracket email autolink', () => {
    expect(tokenizeCompactMarkdown('<hello@example.com>')).toEqual([
      { kind: 'link', label: 'hello@example.com' },
    ]);
  });

  it('tokenizes a bare URL autolink with no surrounding syntax', () => {
    expect(tokenizeCompactMarkdown('see https://example.com for details')).toEqual([
      { kind: 'text', value: 'see ' },
      { kind: 'link', label: 'https://example.com' },
      { kind: 'text', value: ' for details' },
    ]);
  });

  it('tokenizes a bare email autolink', () => {
    expect(tokenizeCompactMarkdown('foo@bar.com')).toEqual([{ kind: 'link', label: 'foo@bar.com' }]);
  });

  it('a bracketed WikiLink-shaped link label still parses as an ordinary Link, not a WikiLink', () => {
    // The continuation-lookahead that keeps `[[Project A]](url)` from being
    // claimed by WikiLink (see markdownLanguage.regression.test.ts) only
    // guarantees a `Link` node exists somewhere in the tree, not that it
    // spans the outer brackets — here the base parser resolves the doubled
    // `[` as literal text and the inner `[Project A]` as the ordinary Link.
    expect(tokenizeCompactMarkdown('[[Project A]](url)')).toEqual([
      { kind: 'text', value: '[' },
      { kind: 'link', label: 'Project A' },
      { kind: 'text', value: '](url)' },
    ]);
  });

  it('tokenizes mixed link/image/autolink content in document order', () => {
    expect(tokenizeCompactMarkdown('[Docs](https://docs.example.com) and ![diagram](img.png) — see https://example.com')).toEqual([
      { kind: 'link', label: 'Docs' },
      { kind: 'text', value: ' and ' },
      { kind: 'image', alt: 'diagram' },
      { kind: 'text', value: ' — see ' },
      { kind: 'link', label: 'https://example.com' },
    ]);
  });

  describe('a Markdown table (approved compact-rendering policy: skip entirely, never a partial leak)', () => {
    it('skips a table with no other content, contributing nothing — never exposes raw pipes/dashes', () => {
      expect(tokenizeCompactMarkdown('| a | b |\n| - | - |\n| 1 | 2 |')).toEqual([]);
    });

    it('skips the whole table even when a cell contains a WikiLink/Tag — never inspects cell content, per "skip the entire table"', () => {
      expect(tokenizeCompactMarkdown('| a | b |\n| - | - |\n| [[Page]] | #tag |')).toEqual([]);
    });

    it('falls through past a leading table to the next meaningful block, never concatenating', () => {
      expect(tokenizeCompactMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n\nUseful text.')).toEqual([
        { kind: 'text', value: 'Useful text.' },
      ]);
    });
  });

  describe('block-aware selection — first meaningful block wins, structural blocks are skipped', () => {
    it('selects a heading over a later table and paragraph, matching the approved example', () => {
      expect(
        tokenizeCompactMarkdown('---\n# Architecture\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nUseful text.')
      ).toEqual([{ kind: 'text', value: 'Architecture' }]);
    });

    it('strips a heading marker of any level, with no preference by level', () => {
      expect(tokenizeCompactMarkdown('## Architecture')).toEqual([{ kind: 'text', value: 'Architecture' }]);
    });

    it('strips a blockquote marker', () => {
      expect(tokenizeCompactMarkdown('> Important decision')).toEqual([{ kind: 'text', value: 'Important decision' }]);
    });

    it('flattens a nested blockquote, stripping every level of quote marker', () => {
      expect(tokenizeCompactMarkdown('> > Important')).toEqual([{ kind: 'text', value: 'Important' }]);
    });

    it('skips an empty blockquote, falling through to the next meaningful block', () => {
      expect(tokenizeCompactMarkdown('>\n\nReal content')).toEqual([{ kind: 'text', value: 'Real content' }]);
    });

    it('uses the first non-empty bullet list item, stripping the marker', () => {
      expect(tokenizeCompactMarkdown('- Design sidebar\n- Fix table')).toEqual([
        { kind: 'text', value: 'Design sidebar' },
      ]);
    });

    it('uses the first non-empty ordered list item, stripping the marker (no "1.")', () => {
      expect(tokenizeCompactMarkdown('1. Finished sidebar\n2. Fixed table')).toEqual([
        { kind: 'text', value: 'Finished sidebar' },
      ]);
    });

    it('continues to the next list item when the first is empty', () => {
      expect(tokenizeCompactMarkdown('-   \n- Fix table')).toEqual([{ kind: 'text', value: 'Fix table' }]);
    });

    it('skips a list whose every item is empty', () => {
      expect(tokenizeCompactMarkdown('-   \n-   \n\nReal content')).toEqual([{ kind: 'text', value: 'Real content' }]);
    });

    it('conceals task-list checkbox syntax without exposing "[ ]"/"[x]"', () => {
      expect(tokenizeCompactMarkdown('- [ ] Design sidebar\n- [x] Fix table')).toEqual([
        { kind: 'text', value: 'Design sidebar' },
      ]);
    });

    it('treats an emoji list marker as content, not disposable punctuation', () => {
      expect(tokenizeCompactMarkdown('🍎 Apple\n🍊 Orange')).toEqual([{ kind: 'text', value: '🍎 Apple' }]);
    });

    it('shows a bare emoji list item with no trailing text', () => {
      expect(tokenizeCompactMarkdown('🍎\n🍊 Orange')).toEqual([{ kind: 'text', value: '🍎' }]);
    });

    it('skips the entire fenced code block, continuing to the next meaningful block', () => {
      expect(tokenizeCompactMarkdown('```ts\nconst x = 1\n```\n\nUseful text.')).toEqual([
        { kind: 'text', value: 'Useful text.' },
      ]);
    });

    it('contributes nothing when a fenced code block is the only content', () => {
      expect(tokenizeCompactMarkdown('```ts\nconst x = 1\n```')).toEqual([]);
    });

    it('skips an unlabeled native thematic rule', () => {
      expect(tokenizeCompactMarkdown('---\n\nReal content')).toEqual([{ kind: 'text', value: 'Real content' }]);
    });

    it('skips unlabeled Clutter wavy/double/dotted thematic rules', () => {
      expect(tokenizeCompactMarkdown('~---~\n\nReal content')).toEqual([{ kind: 'text', value: 'Real content' }]);
      expect(tokenizeCompactMarkdown('=---=\n\nReal content')).toEqual([{ kind: 'text', value: 'Real content' }]);
      expect(tokenizeCompactMarkdown('.---.\n\nReal content')).toEqual([{ kind: 'text', value: 'Real content' }]);
    });

    it('renders a labeled straight thematic rule\'s label as meaningful content', () => {
      expect(tokenizeCompactMarkdown('--- Chapter 1 ---')).toEqual([{ kind: 'text', value: 'Chapter 1' }]);
    });

    it('renders a labeled wavy/double/dotted thematic rule\'s label as meaningful content', () => {
      expect(tokenizeCompactMarkdown('~--- Chapter 1 ---~')).toEqual([{ kind: 'text', value: 'Chapter 1' }]);
      expect(tokenizeCompactMarkdown('=--- Chapter 1 ---=')).toEqual([{ kind: 'text', value: 'Chapter 1' }]);
      expect(tokenizeCompactMarkdown('.--- Chapter 1 ---.')).toEqual([{ kind: 'text', value: 'Chapter 1' }]);
    });

    it('conceals TaskCompletionMetadata rather than leaking it as text', () => {
      expect(tokenizeCompactMarkdown('Ship it @completed:2026-08-31')).toEqual([{ kind: 'text', value: 'Ship it' }]);
    });

    it('returns nothing when the entire document is only structural blocks', () => {
      expect(tokenizeCompactMarkdown('---\n\n```ts\ncode\n```')).toEqual([]);
    });

    it('returns nothing when an unlabeled thematic rule is the only content', () => {
      expect(tokenizeCompactMarkdown('---')).toEqual([]);
    });

    it('returns nothing when a blockquote is empty and is the only content', () => {
      expect(tokenizeCompactMarkdown('>')).toEqual([]);
    });

    it('returns nothing when a list is the only content and every item is empty', () => {
      expect(tokenizeCompactMarkdown('-   \n-   ')).toEqual([]);
    });
  });

  describe('Link empty-label/empty-URL fallback policy', () => {
    it('falls back to the URL as plain text when the link label is empty', () => {
      expect(tokenizeCompactMarkdown('[](https://google.com)')).toEqual([
        { kind: 'link', label: 'https://google.com' },
      ]);
    });

    it('keeps the label when only the URL is empty', () => {
      expect(tokenizeCompactMarkdown('[Google]()')).toEqual([{ kind: 'link', label: 'Google' }]);
    });
  });

  describe('Image empty-alt fallback policy', () => {
    it('falls back to the URL basename without extension when alt text is empty', () => {
      expect(tokenizeCompactMarkdown('![](architecture.png)')).toEqual([{ kind: 'image', alt: 'architecture' }]);
    });

    it('keeps a real alt text unaffected', () => {
      expect(tokenizeCompactMarkdown('![Architecture diagram](architecture.png)')).toEqual([
        { kind: 'image', alt: 'Architecture diagram' },
      ]);
    });
  });

  describe('nested inline composition — a styled container recurses into its own children instead of flattening them to raw text', () => {
    it('composes strikethrough + inline code: ~~`strike through`~~', () => {
      const spans = tokenizeCompactMarkdown('~~`strike through`~~');

      expect(spans).toEqual([
        { kind: 'strikethrough', children: [{ kind: 'code', value: 'strike through' }] },
      ]);
      expect(flattenText(spans)).toBe('strike through');
      expect(flattenText(spans)).not.toMatch(/[`~]/);
    });

    it('composes strikethrough + link: ~~[Google](www.google.co.in)~~', () => {
      const spans = tokenizeCompactMarkdown('~~[Google](www.google.co.in)~~');

      expect(spans).toEqual([
        { kind: 'strikethrough', children: [{ kind: 'link', label: 'Google' }] },
      ]);
      expect(flattenText(spans)).toBe('Google');
      expect(flattenText(spans)).not.toMatch(/[[\]()~]/);
    });

    it('composes strong + WikiLink: **[[Project]]**', () => {
      const spans = tokenizeCompactMarkdown('**[[Project]]**');

      expect(spans).toEqual([
        { kind: 'bold', children: [{ kind: 'wikilink', path: 'Project', alias: null }] },
      ]);
      expect(flattenText(spans)).toBe('Project');
      expect(flattenText(spans)).not.toMatch(/[[\]*]/);
    });

    it('composes strong + link: **[Google](www.google.co.in)**', () => {
      const spans = tokenizeCompactMarkdown('**[Google](www.google.co.in)**');

      expect(spans).toEqual([
        { kind: 'bold', children: [{ kind: 'link', label: 'Google' }] },
      ]);
      expect(flattenText(spans)).toBe('Google');
      expect(flattenText(spans)).not.toMatch(/[[\]()*]/);
    });

    it('composes highlight + strong: ==**important**==', () => {
      const spans = tokenizeCompactMarkdown('==**important**==');

      expect(spans).toEqual([
        { kind: 'highlight', children: [{ kind: 'bold', children: [{ kind: 'text', value: 'important' }] }] },
      ]);
      expect(flattenText(spans)).toBe('important');
      expect(flattenText(spans)).not.toMatch(/[*=]/);
    });

    it('composes strikethrough + strong + link, three levels deep: ~~**[Google](www.google.co.in)**~~', () => {
      const spans = tokenizeCompactMarkdown('~~**[Google](www.google.co.in)**~~');

      expect(spans).toEqual([
        {
          kind: 'strikethrough',
          children: [{ kind: 'bold', children: [{ kind: 'link', label: 'Google' }] }],
        },
      ]);
      expect(flattenText(spans)).toBe('Google');
      expect(flattenText(spans)).not.toMatch(/[[\]()*~]/);
    });

    it('composes the opposite nesting direction too: **~~[Google](www.google.co.in)~~**', () => {
      const spans = tokenizeCompactMarkdown('**~~[Google](www.google.co.in)~~**');

      expect(spans).toEqual([
        {
          kind: 'bold',
          children: [{ kind: 'strikethrough', children: [{ kind: 'link', label: 'Google' }] }],
        },
      ]);
      expect(flattenText(spans)).toBe('Google');
    });

    it('composes emphasis + inline code, opposite direction from the code+strike example: *`code`*', () => {
      const spans = tokenizeCompactMarkdown('*`code`*');

      expect(spans).toEqual([{ kind: 'italic', children: [{ kind: 'code', value: 'code' }] }]);
      expect(flattenText(spans)).toBe('code');
      expect(flattenText(spans)).not.toMatch(/[`*]/);
    });

    it('composes strong + tag and strong + date — every semantic construct type stays typed under a styled container', () => {
      // A `#` immediately after the opening `**` mark fails both the Tag
      // scanner's own "preceded by whitespace" gate AND CommonMark's own
      // left-flanking-delimiter rule (an opening `**` can never be
      // immediately followed by whitespace) — unrelated to this fix, so a
      // real word before the space+tag is what makes `**` a valid opening
      // delimiter here and `#urgent` a genuine Tag occurrence.
      expect(tokenizeCompactMarkdown('**fix #urgent**')).toEqual([
        { kind: 'bold', children: [{ kind: 'text', value: 'fix ' }, { kind: 'tag', name: 'urgent' }] },
      ]);
      // Same reasoning as the Tag case above — Date's own scanner requires
      // whitespace/start-of-line immediately before `@` too, so a bare
      // `**@date**` fails the same way `**#tag**` does; a real word first
      // is what makes this a genuine Date occurrence.
      expect(tokenizeCompactMarkdown('**due @2026-08-22**')).toEqual([
        { kind: 'bold', children: [{ kind: 'text', value: 'due ' }, { kind: 'date', isoDate: '2026-08-22' }] },
      ]);
    });

    it('composes strong + embed — the embed target stays a real embed span, not raw text, under a styled container', () => {
      expect(tokenizeCompactMarkdown('**![[photo.png]]**')).toEqual([
        { kind: 'bold', children: [{ kind: 'embed', path: 'photo.png', alias: null }] },
      ]);
    });
  });
});
