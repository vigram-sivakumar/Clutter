import { describe, expect, it } from 'vitest';
import { VisibleView, buildVisibleText, normalizeLineEndings, visibleRangeToSource } from './visibleText';

const visible = (markdown: string): string => buildVisibleText(normalizeLineEndings(markdown)).text;

/** The Markdown a match of `needle` in the visible text covers. */
function sourceOf(markdown: string, needle: string): string {
  const normalized = normalizeLineEndings(markdown);
  const built = buildVisibleText(normalized);
  const at = built.text.indexOf(needle);

  expect(at).toBeGreaterThanOrEqual(0);

  const range = visibleRangeToSource(built, at, at + needle.length);

  return normalized.slice(range.from, range.to);
}

describe('buildVisibleText — what is removed', () => {
  it('removes formatting delimiters and keeps the words', () => {
    expect(visible('**bold** and *italic* and ~~gone~~ and ==marked== and `code`')).toBe(
      'bold and italic and gone and marked and code'
    );
  });

  it('removes block markers: headings, quotes, lists and tasks', () => {
    expect(visible('# Title\n\n> quoted\n\n- item\n\n1. first\n\n- [ ] todo\n- [x] done')).toBe(
      ' Title\n\n quoted\n\n item\n\n first\n\n  todo\n  done'
    );
  });

  it('removes link and image destinations and titles, keeps the link text and alt text', () => {
    expect(visible('[docs](https://example.com/secret "Title") ![alt text](img/pic.png)')).toBe('docs  alt text');
    expect(visible('[text][ref]\n\n[ref]: https://hidden.example')).toBe('text\n\n');
  });

  it('keeps a bare URL and an <autolink> — they are what the reader sees', () => {
    expect(visible('see https://example.com/a and <https://b.example>')).toBe(
      'see https://example.com/a and https://b.example'
    );
  });

  it('keeps code content but not the fence or its language tag', () => {
    expect(visible('```typescript\nconst answer = 42;\n```')).toBe('\nconst answer = 42;\n');
    expect(visible('~~~\nplain\n~~~')).toBe('\nplain\n');
  });

  it('removes HTML tags, comments, dividers and table pipes', () => {
    expect(visible('a<br>b <!-- note --> c')).toBe('ab  c');
    expect(visible('before\n\n---\n\nafter')).toBe('before\n\n\n\nafter');
    expect(visible('| a | b |\n|---|---|\n| c | d |')).toBe(' a  b \n\n c  d ');
  });

  it('shows a backslash-escaped character without its backslash', () => {
    expect(visible('1 \\* 2 \\[x\\]')).toBe('1 * 2 [x]');
  });

  it('shows a wiki link as its alias, or its target without brackets', () => {
    expect(visible('[[Project Plan]]')).toBe('Project Plan');
    expect(visible('[[folder/Project Plan|the plan]]')).toBe('the plan');
    expect(visible('![[diagram.png]]')).toBe('diagram.png');
  });

  it('shows a tag as its word, without the #', () => {
    expect(visible('filed under #design today')).toBe('filed under design today');
  });

  it('removes nothing from plain text', () => {
    expect(visible('just words')).toBe('just words');
    expect(visible('')).toBe('');
  });
});

describe('buildVisibleText — source ranges', () => {
  it('maps a match in plain text to itself', () => {
    expect(sourceOf('hello brave world', 'brave')).toBe('brave');
  });

  it('maps a match inside formatting to the text, not the delimiters', () => {
    expect(sourceOf('say **loudly** now', 'loudly')).toBe('loudly');
  });

  it('maps a word split by formatting delimiters, covering the delimiters between', () => {
    const markdown = 'a bo**ld** word';

    expect(visible(markdown)).toBe('a bold word');
    expect(sourceOf(markdown, 'bold')).toBe('bo**ld');
  });

  it('maps a phrase spanning several segments', () => {
    expect(sourceOf('the **quick** [brown](http://x) fox', 'quick brown fox')).toBe(
      'quick** [brown](http://x) fox'
    );
  });

  it('maps a match after removed syntax earlier on the line', () => {
    const markdown = '> - [ ] **Buy** milk';

    expect(sourceOf(markdown, 'milk')).toBe('milk');
    expect(sourceOf(markdown, 'Buy')).toBe('Buy');
  });

  it('maps matches after escapes, wiki links and tags', () => {
    expect(sourceOf('a \\* b [[x|alias]] #tag end', 'end')).toBe('end');
    expect(sourceOf('a \\* b [[x|alias]] #tag end', 'alias')).toBe('alias');
    expect(sourceOf('a \\* b [[x|alias]] #tag end', 'tag')).toBe('tag');
    expect(sourceOf('a \\* b', '* b')).toBe('* b');
  });

  it('maps a match in a fenced code block', () => {
    expect(sourceOf('intro\n\n```js\nlet needle = 1;\n```\n', 'needle')).toBe('needle');
  });

  it('maps every match correctly in a mixed document', () => {
    const markdown = [
      '# Heading **one**',
      '',
      'Paragraph with [a link](https://x.example/very/long/url) and `inline code`.',
      '',
      '- [ ] task about ==highlight==',
      '',
      '```python',
      'print("hello")',
      '```',
    ].join('\n');

    for (const word of ['Heading', 'one', 'Paragraph', 'link', 'inline code', 'task', 'highlight', 'hello']) {
      const covered = sourceOf(markdown, word);

      expect(covered.replace(/[*`=]/g, '')).toContain(word);
    }
  });
});

describe('line endings', () => {
  it('normalizes CRLF and CR the way the editor document does', () => {
    expect(normalizeLineEndings('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
    expect(normalizeLineEndings('no carriage returns')).toBe('no carriage returns');
  });

  it('gives ranges that are offsets into the normalized (editor) text, not the CRLF source', () => {
    const crlf = 'first line\r\nsecond **line**\r\nthird needle here\r\n';
    const editorDocument = normalizeLineEndings(crlf);
    const built = buildVisibleText(editorDocument);
    const at = built.text.indexOf('needle');
    const range = visibleRangeToSource(built, at, at + 'needle'.length);

    expect(editorDocument.slice(range.from, range.to)).toBe('needle');
    // The raw CRLF string would put the same offsets two characters too early.
    expect(crlf.slice(range.from, range.to)).not.toBe('needle');
  });
});

describe('VisibleView — the visible text without keeping it', () => {
  const MARKDOWN = [
    '# Heading **one**',
    '',
    'Para with [a link](https://x.example/long) and `code` and \\* escaped and [[x|alias]] #tag.',
    '',
    '```ts',
    'const 😀 = 1;',
    '```',
  ].join('\n');

  it('reads exactly the characters of the visible text, at every index', () => {
    const built = buildVisibleText(MARKDOWN);
    const view = new VisibleView(MARKDOWN, built.segments);

    expect(view.length).toBe(built.text.length);

    for (let index = 0; index < built.text.length; index++) {
      expect(view.charCodeAt(index)).toBe(built.text.charCodeAt(index));
    }

    expect(Number.isNaN(view.charCodeAt(built.text.length))).toBe(true);
  });

  it('slices exactly like the visible string, for every range', () => {
    const built = buildVisibleText(MARKDOWN);
    const view = new VisibleView(MARKDOWN, built.segments);

    for (let from = 0; from <= built.text.length; from += 3) {
      for (let to = from; to <= built.text.length + 2; to += 5) {
        expect(view.slice(from, to)).toBe(built.text.slice(from, to));
      }
    }
  });

  it('copes with a note that has no visible text', () => {
    const built = buildVisibleText('---');
    const view = new VisibleView('---', built.segments);

    expect(view.length).toBe(0);
    expect(view.slice(0, 5)).toBe('');
  });

  it('keeps one pair of integers per slice plus the end marker, and no text', () => {
    const built = buildVisibleText('a **b** c');

    // slices: "a ", "b", " c" → 3 pairs + the end pair
    expect(built.segments.length).toBe((3 + 1) * 2);
  });
});
