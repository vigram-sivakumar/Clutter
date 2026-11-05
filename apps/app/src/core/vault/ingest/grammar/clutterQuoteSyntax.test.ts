import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../../../../features/markdown/editor/codemirror/markdownLanguage';

/** Pure parser-level tests: the tree shapes the `ClutterQuote` grammar produces, confirmed against real parse output. */

function parse(text: string, options?: { emojiLists?: boolean }) {
  return markdownLanguageExtension(options).language.parser.parse(text);
}

/** Top-level block names, in order. */
function blocks(text: string, options?: { emojiLists?: boolean }): string[] {
  const names: string[] = [];
  for (let node = parse(text, options).topNode.firstChild; node; node = node.nextSibling) {
    names.push(node.name);
  }
  return names;
}

function allNames(text: string): string[] {
  const names: string[] = [];
  parse(text).iterate({ enter: (node) => void names.push(node.name) });
  return names;
}

function slice(text: string, name: string): string[] {
  const found: string[] = [];
  parse(text).iterate({
    enter: (node) => {
      if (node.name === name) {
        found.push(text.slice(node.from, node.to));
      }
    },
  });
  return found;
}

describe('clutterQuoteSyntax — what is a quote', () => {
  it('parses `" text` as ClutterQuote > [QuoteMark, Paragraph]', () => {
    const quote = parse('" This is quoted').topNode.getChild('ClutterQuote');
    expect(quote?.firstChild?.name).toBe('QuoteMark');
    expect(quote?.getChild('Paragraph')).not.toBeNull();
  });

  it('the marker is only the quotation mark; the space after it is not part of the quoted text', () => {
    expect(slice('" Quoted', 'QuoteMark')).toEqual(['"']);
    expect(slice('" Quoted', 'Paragraph')).toEqual(['Quoted']);
  });

  it('treats `" ` with nothing after it as an (empty) quote line', () => {
    expect(blocks('" ')).toEqual(['ClutterQuote']);
  });

  it('does not treat ordinary text starting with a quotation mark as a quote', () => {
    expect(blocks('"Hello" she said')).toEqual(['Paragraph']);
    expect(blocks('"')).toEqual(['Paragraph']);
    expect(blocks('""')).toEqual(['Paragraph']);
    expect(blocks('"quoted"')).toEqual(['Paragraph']);
    expect(blocks('Say " hello')).toEqual(['Paragraph']);
    expect(blocks('“ curly ”')).toEqual(['Paragraph']);
  });

  it('is always on, with or without emoji lists', () => {
    expect(blocks('" a', { emojiLists: false })).toEqual(['ClutterQuote']);
    expect(blocks('" a', { emojiLists: true })).toEqual(['ClutterQuote']);
  });
});

describe('clutterQuoteSyntax — multiple lines', () => {
  it('consecutive marked lines are one quote, and its range covers every line', () => {
    const text = '" one\n" two\n" three';
    expect(blocks(text)).toEqual(['ClutterQuote']);
    expect(slice(text, 'ClutterQuote')).toEqual([text]);
    expect(slice(text, 'QuoteMark')).toEqual(['"', '"', '"']);
  });

  it('marked lines form one multi-line paragraph (its text spans the second line\'s marker, as a `>` paragraph does)', () => {
    expect(slice('" one\n" two', 'Paragraph')).toEqual(['one\n" two']);
  });

  it('a blank line ends a quote; the next marked line starts another', () => {
    expect(blocks('" a\n\n" b')).toEqual(['ClutterQuote', 'ClutterQuote']);
  });
});

describe('clutterQuoteSyntax — leaving a quote needs no blank line', () => {
  it('an unmarked line after a quote is a plain paragraph, not a lazy continuation', () => {
    expect(blocks('" a\nplain')).toEqual(['ClutterQuote', 'Paragraph']);
  });

  it('a standard `>` quote still continues lazily (unchanged)', () => {
    expect(blocks('> a\nplain')).toEqual(['Blockquote']);
  });

  it('an empty line after the quote line is just the caret line, and typing there stays outside the quote', () => {
    expect(blocks('" a\ntyped')).toEqual(['ClutterQuote', 'Paragraph']);
  });
});

describe('clutterQuoteSyntax — interrupting and nesting', () => {
  it('a marked line interrupts a paragraph, as `>` does', () => {
    expect(blocks('before\n" quote')).toEqual(['Paragraph', 'ClutterQuote']);
    expect(blocks('before\n> quote')).toEqual(['Paragraph', 'Blockquote']);
  });

  it('nests with `" "`', () => {
    const quote = parse('" " inner').topNode.getChild('ClutterQuote');
    expect(quote?.getChild('ClutterQuote')?.getChild('Paragraph')).not.toBeNull();
    expect(slice('" " inner', 'QuoteMark')).toEqual(['"', '"']);
  });

  it('a nested quote ends at the outer quote\'s next line without losing the outer quote', () => {
    expect(blocks('" " inner\n" outer')).toEqual(['ClutterQuote']);
    expect(slice('" " inner\n" outer', 'ClutterQuote')).toHaveLength(2);
  });

  it('mixes with standard quotes in either order', () => {
    expect(allNames('" > inner')).toContain('Blockquote');
    expect(allNames('> " inner')).toContain('ClutterQuote');
  });

  it('a `>` quote directly followed by a `"` quote are two separate quotes', () => {
    expect(blocks('> a\n" b')).toEqual(['Blockquote', 'ClutterQuote']);
  });

  it('holds lists and headings like any quote', () => {
    expect(allNames('" - item')).toContain('BulletList');
    expect(allNames('" # Title')).toContain('ATXHeading1');
  });

  it('works inside a list item', () => {
    expect(allNames('- " quoted')).toEqual(expect.arrayContaining(['BulletList', 'ClutterQuote']));
  });
});

describe('clutterQuoteSyntax — what it leaves alone', () => {
  it('does not match inside a fenced code block', () => {
    expect(allNames('```\n" code\n```')).not.toContain('ClutterQuote');
  });

  it('does not match inside indented code', () => {
    expect(allNames('para\n\n    " code')).not.toContain('ClutterQuote');
  });

  it('does not match inline', () => {
    expect(allNames('say `" x` and " y')).not.toContain('ClutterQuote');
  });

  it('leaves standard Markdown blockquotes exactly as they parsed', () => {
    expect(blocks('> a')).toEqual(['Blockquote']);
    expect(slice('> a\n> b', 'Blockquote')).toEqual(['> a\n> b']);
    expect(slice('> a', 'QuoteMark')).toEqual(['>']);
    expect(allNames('> a')).not.toContain('ClutterQuote');
  });
});
