import { parser } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';

import { markdownGrammarExtensions } from './markdownGrammarExtensions';
import { toStandardMarkdown } from './toStandardMarkdown';

const clutter = parser.configure(markdownGrammarExtensions);
const base = parser;

function names(tree: ReturnType<typeof parser.parse>): string[] {
  const found: string[] = [];
  tree.iterate({ enter: (node) => void found.push(node.name) });
  return found;
}

describe('toStandardMarkdown — quotes', () => {
  it('turns `" text` into `> text`, keeping the text and the space', () => {
    expect(toStandardMarkdown('" This is quoted')).toBe('> This is quoted');
  });

  it('converts every line of a multi-line quote', () => {
    expect(toStandardMarkdown('" one\n" two\n" three')).toBe('> one\n> two\n> three');
  });

  it('converts an empty quote line', () => {
    expect(toStandardMarkdown('" one\n" \n" two')).toBe('> one\n> \n> two');
  });

  it('converts nested quotes', () => {
    expect(toStandardMarkdown('" " inner')).toBe('> > inner');
    expect(toStandardMarkdown('" > mixed')).toBe('> > mixed');
    expect(toStandardMarkdown('> " mixed')).toBe('> > mixed');
  });

  it('keeps everything around the quote byte for byte', () => {
    expect(toStandardMarkdown('# Title\n\n" a quote with **bold**, [[Link]] and #tag\n\nafter')).toBe(
      '# Title\n\n> a quote with **bold**, [[Link]] and #tag\n\nafter'
    );
  });
});

describe('toStandardMarkdown — leaving a quote', () => {
  it('adds the blank line standard Markdown needs before a plain line that follows the quote', () => {
    expect(toStandardMarkdown('" a\nplain')).toBe('> a\n\nplain');
  });

  it('adds no line when the quote is followed by a blank line, or by nothing', () => {
    expect(toStandardMarkdown('" a\n\nplain')).toBe('> a\n\nplain');
    expect(toStandardMarkdown('" a')).toBe('> a');
    expect(toStandardMarkdown('" a\n')).toBe('> a\n');
  });

  it('separates a quote from a following block too', () => {
    expect(toStandardMarkdown('" a\n# Heading')).toBe('> a\n\n# Heading');
  });

  it('keeps two quotes separated by a plain line apart (a `>` line interrupts a paragraph, so only the first needs a blank line)', () => {
    expect(toStandardMarkdown('" a\nmiddle\n" b')).toBe('> a\n\nmiddle\n> b');
  });

  it('keeps a native quote and an adjacent standard quote two separate quotes, in either order', () => {
    expect(toStandardMarkdown('" a\n> b')).toBe('> a\n\n> b');
    expect(toStandardMarkdown('> a\n" b')).toBe('> a\n\n> b');
  });

  it('separates where a nested quote ends inside an outer quote, using the outer markers alone', () => {
    expect(toStandardMarkdown('" " in\n" out')).toBe('> > in\n>\n> out');
    expect(toStandardMarkdown('" " " deep\n" " mid')).toBe('> > > deep\n> >\n> > mid');
  });

  it('does not separate an outer quote that ends on the same line as the nested one', () => {
    expect(toStandardMarkdown('" " in\nplain')).toBe('> > in\n\nplain');
  });

  it('adds no separator inside a list item (a blank line would loosen the list)', () => {
    expect(toStandardMarkdown('- " a\n- b')).toBe('- > a\n- b');
  });
});

describe('toStandardMarkdown — what it must not touch', () => {
  it('returns text without a native quote unchanged (the same string)', () => {
    const text = '# Title\n\n> standard quote\n\n- list\n\n"Hello" she said\n';
    expect(toStandardMarkdown(text)).toBe(text);
  });

  it('leaves ordinary text beginning with a quotation mark alone', () => {
    for (const text of ['"Hello" she said', '"', '""', 'Say " hello', '“ curly ”', 'a\n"b"\nc']) {
      expect(toStandardMarkdown(text)).toBe(text);
    }
  });

  it('leaves fenced code alone', () => {
    const text = '```\n" not a quote\n" still code\n```\n\n~~~js\n" tilde\n~~~';
    expect(toStandardMarkdown(text)).toBe(text);
  });

  it('leaves indented code alone', () => {
    const text = 'para\n\n    " indented code\n';
    expect(toStandardMarkdown(text)).toBe(text);
  });

  it('leaves inline code alone', () => {
    const text = 'use `" x` and `a " b` inline\n\nand ``" y`` too';
    expect(toStandardMarkdown(text)).toBe(text);
  });

  it('converts a real quote beside code without touching the code', () => {
    expect(toStandardMarkdown('" quote\n\n```\n" code\n```\n\n    " also code\n\n`" inline`')).toBe(
      '> quote\n\n```\n" code\n```\n\n    " also code\n\n`" inline`'
    );
  });

  it('leaves frontmatter alone', () => {
    expect(toStandardMarkdown('---\ntitle: x\nnote: |\n" odd\n---\n" quote')).toBe('---\ntitle: x\nnote: |\n" odd\n---\n> quote');
  });

  it('keeps Windows line endings', () => {
    expect(toStandardMarkdown('" a\r\nplain')).toBe('> a\r\n\r\nplain');
  });
});

describe('toStandardMarkdown — the result is standard Markdown', () => {
  const samples = [
    '" a',
    '" one\n" two',
    '" a\nplain',
    '" a\n> b',
    '> a\n" b',
    '" " in\n" out',
    '" a\nmiddle\n" b',
    '" quote\n\nafter\n\n" another',
    '# H\n\n" a\n# H2\n" b',
  ];

  it('contains no native quote any more, and parses the same shapes with CommonMark alone', () => {
    for (const sample of samples) {
      const out = toStandardMarkdown(sample);
      expect(names(clutter.parse(out))).not.toContain('ClutterQuote');
      // A parser that has never heard of `" ` quotes reads the output as the quotes the source meant.
      expect(names(base.parse(out))).not.toContain('ClutterQuote');
    }
  });

  it('reads as the same blocks a native parse produced, quote for quote', () => {
    const topLevel = (tree: ReturnType<typeof parser.parse>) => {
      const found: string[] = [];
      for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
        found.push(node.name === 'ClutterQuote' ? 'Blockquote' : node.name);
      }
      return found;
    };
    for (const sample of samples) {
      expect(topLevel(base.parse(toStandardMarkdown(sample)))).toEqual(topLevel(clutter.parse(sample)));
    }
  });

  it('keeps every quoted character: only markers and separators differ', () => {
    for (const sample of samples) {
      const strip = (text: string) => text.replace(/^[ \t]*(?:(?:>|") ?)+/gm, '').replace(/\n+/g, '\n').trim();
      expect(strip(toStandardMarkdown(sample))).toBe(strip(sample));
    }
  });

  it('is idempotent', () => {
    for (const sample of samples) {
      const once = toStandardMarkdown(sample);
      expect(toStandardMarkdown(once)).toBe(once);
    }
  });
});
