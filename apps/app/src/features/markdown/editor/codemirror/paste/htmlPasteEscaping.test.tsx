// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';

import { markdownLanguageExtension } from '../markdownLanguage';
import { normalizeExternalPaste } from './externalPaste';
import { htmlToPieces } from './htmlToMarkdown';

/**
 * Text that merely looks like Markdown stays text when HTML is pasted: marker-looking text at the start of a list
 * item (or paragraph) is escaped so it cannot open a nested list, heading or quote, and an ordered marker is escaped
 * at its delimiter (`1\.`), since a backslash before the digits is not an escape (the old `\1.` was literal text with a
 * visible backslash). Checked as the Markdown itself and as the Clutter grammar's parse of it: one flat item, an
 * `Escape` node on exactly the escaped character, and no nested list, heading or quote.
 *
 * Not covered here, and not new: Clutter's own editor and read-only renderer do not process backslash escapes at all
 * (`a \* b` also shows its backslash), so any escaped character, the converter's existing `\*`, `\[` and `\_`
 * included, shows its backslash there. Recorded as a follow-up.
 */
const markdownOf = (html: string): string =>
  htmlToPieces(html)
    .map((piece) => (piece.kind === 'markdown' ? piece.text : ''))
    .join('\n');

const SHAPE_NAMES: Record<string, string> = {
  BulletList: 'ul',
  OrderedList: 'ol',
  ListItem: 'li',
  Paragraph: 'p',
  InlineCode: 'code',
  Blockquote: 'quote',
  ATXHeading1: 'h1',
  Task: 'task',
};

/** The block structure of `doc` as a nested string, e.g. `ul(li(p()))`. */
function shape(doc: string): string {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  ensureSyntaxTree(state, doc.length, 5000);
  const walk = (node: { name: string; firstChild: any; nextSibling: any }): string => {
    const parts: string[] = [];
    for (let child = node.firstChild; child; child = child.nextSibling) {
      const inner = walk(child);
      if (inner) {
        parts.push(inner);
      }
    }
    const name = SHAPE_NAMES[node.name];
    return name ? `${name}(${parts.join('')})` : parts.join('');
  };
  return walk(syntaxTree(state).topNode as any);
}

/** The source text of every node called `name` in the parse of `doc`, in order. */
function nodeTexts(doc: string, name: string): string[] {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  ensureSyntaxTree(state, doc.length, 5000);
  const found: string[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === name) {
        found.push(doc.slice(node.from, node.to));
      }
    },
  });
  return found;
}

const list = (...items: string[]) => `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;

/** [name, the item's text, the Markdown for it as a list item, the characters the grammar must read as escapes]. */
const MARKER_TEXTS = [
  ['a bullet', '- Buy groceries', '- \\- Buy groceries', ['\\-']],
  ['a plus bullet', '+ Buy groceries', '- \\+ Buy groceries', ['\\+']],
  ['an ordered marker', '1. Buy groceries', '- 1\\. Buy groceries', ['\\.']],
  ['an ordered marker with a paren', '2) Buy groceries', '- 2\\) Buy groceries', ['\\)']],
  ['a multi-digit ordered marker', '12. Buy groceries', '- 12\\. Buy groceries', ['\\.']],
  ['a task marker', '- [ ] Buy groceries', '- \\- \\[ \\] Buy groceries', ['\\-', '\\[', '\\]']],
  ['a heading marker', '# Heading', '- \\# Heading', ['\\#']],
  ['a quote marker', '> Blockquote', '- \\> Blockquote', ['\\>']],
] as const;

describe('marker-looking text inside a list item (plain text in the <li>)', () => {
  it.each(MARKER_TEXTS)('%s stays literal text in a single item', (_name, text, expected, escapes) => {
    const markdown = markdownOf(list(text));

    expect(markdown).toBe(expected);
    expect(shape(markdown)).toBe('ul(li(p()))');
    expect(nodeTexts(markdown, 'Escape')).toEqual(escapes);
  });

  it('the escaped output is left as it is by the external-paste compaction', () => {
    for (const [, text] of MARKER_TEXTS) {
      const markdown = markdownOf(list(text));
      expect(normalizeExternalPaste(markdown)).toBe(markdown);
    }
  });

  it('the report\'s example: four marker-looking items and two plain ones are six flat items', () => {
    const markdown = markdownOf(
      list('- |Buy groceries', '1. |Buy groceries', '- [ ] |Buy groceries', '- Parent - |Child', 'A list item following a paragraph.', 'A list item following another list item.')
    );

    expect(markdown.split('\n')).toEqual([
      '- \\- |Buy groceries',
      '- 1\\. |Buy groceries',
      '- \\- \\[ \\] |Buy groceries',
      '- \\- Parent - |Child',
      '- A list item following a paragraph.',
      '- A list item following another list item.',
    ]);
    expect(shape(markdown)).toBe('ul(li(p())li(p())li(p())li(p())li(p())li(p()))');
  });

  it('only the start of the item text is escaped: the same characters later in the text are untouched', () => {
    expect(markdownOf(list('Buy - milk, 1. eggs and # tags'))).toBe('- Buy - milk, 1. eggs and # tags');
  });

  it('works the same under an ordered list, and for an item inside a task', () => {
    expect(markdownOf('<ol><li>- Buy groceries</li><li>1. Buy groceries</li></ol>')).toBe('1. \\- Buy groceries\n2. 1\\. Buy groceries');
    expect(shape(markdownOf('<ol><li>- Buy groceries</li></ol>'))).toBe('ol(li(p()))');
  });
});

describe('the same text inside <code> elements', () => {
  it.each(MARKER_TEXTS)('%s becomes inline code, escaped by the backticks', (_name, text) => {
    const markdown = markdownOf(list(`<code>${text}</code>`));

    expect(markdown).toBe(`- \`${text}\``);
    expect(shape(markdown)).toBe('ul(li(p(code())))');
    // Verbatim inside the span, and nothing escaped: a backslash would show there.
    expect(nodeTexts(markdown, 'InlineCode')).toEqual([`\`${text}\``]);
    expect(nodeTexts(markdown, 'Escape')).toEqual([]);
  });

  it('with ChatGPT-style wrappers (<p> inside <li>, data attributes) it is the same', () => {
    const html = '<ul data-start="0"><li data-start="1"><p data-start="2"><code>1. |Buy groceries</code></p></li></ul>';

    expect(markdownOf(html)).toBe('- `1. |Buy groceries`');
  });
});

describe('ordinary paragraphs that begin with a marker', () => {
  it.each([
    ['1. Buy groceries', '1\\. Buy groceries'],
    ['2) Buy groceries', '2\\) Buy groceries'],
    ['10. Buy groceries', '10\\. Buy groceries'],
    ['- Buy groceries', '\\- Buy groceries'],
    ['+ Buy groceries', '\\+ Buy groceries'],
    ['# Heading', '\\# Heading'],
    ['> Quote', '\\> Quote'],
  ])('"%s" is escaped without a stray backslash before the digits', (text, expected) => {
    const markdown = markdownOf(`<p>${text}</p><p><strong>bold</strong> follows</p>`).split('\n\n')[0]!;

    expect(markdown).toBe(expected);
    expect(shape(markdown)).toBe('p()');
    // Exactly one escape, and it is the marker's punctuation: `\1.` would be literal text with a visible backslash.
    expect(nodeTexts(markdown, 'Escape')).toHaveLength(1);
    expect(nodeTexts(markdown, 'Escape')[0]).toMatch(/^\\[#>+\-.)]$/);
  });

  it('a number in the middle of a paragraph, or without a delimiter and space, is untouched', () => {
    expect(markdownOf('<p>Step 1. Buy</p><p><b>x</b></p>').split('\n\n')[0]).toBe('Step 1. Buy');
    expect(markdownOf('<p>1.5 liters</p><p><b>x</b></p>').split('\n\n')[0]).toBe('1.5 liters');
  });

  it('each line of a multi-line paragraph is escaped on its own', () => {
    const markdown = markdownOf('<p>first<br>1. second<br>- third</p>');

    expect(markdown.split('\n').map((line) => line.trim())).toEqual(['first', '1\\. second', '\\- third']);
    expect(shape(markdown)).toBe('p()');
  });
});

describe('legitimate nested lists keep their structure', () => {
  it('nested <ul> elements become nested items, four spaces per level', () => {
    const markdown = markdownOf('<ul><li>Parent<ul><li>Child<ul><li>Grandchild</li></ul></li></ul></li></ul>');

    expect(markdown).toBe('- Parent\n    - Child\n        - Grandchild');
    expect(shape(markdown)).toBe('ul(li(p()ul(li(p()ul(li(p()))))))');
  });

  it('nested ordered and mixed lists are kept', () => {
    expect(markdownOf('<ol><li>One<ol><li>Inner</li></ol></li><li>Two</li></ol>')).toBe('1. One\n    1. Inner\n2. Two');
    expect(shape(markdownOf('<ul><li>a<ol><li>b</li></ol></li></ul>'))).toBe('ul(li(p()ol(li(p()))))');
  });

  it('literal marker text inside a real nested item is escaped without breaking the nesting', () => {
    const markdown = markdownOf('<ul><li>Parent<ul><li>- literal</li><li>1. also literal</li></ul></li></ul>');

    expect(markdown).toBe('- Parent\n    - \\- literal\n    - 1\\. also literal');
    expect(shape(markdown)).toBe('ul(li(p()ul(li(p())li(p()))))');
    expect(nodeTexts(markdown, 'Escape')).toEqual(['\\-', '\\.']);
  });
});

describe('existing rich HTML paste behavior is unchanged', () => {
  it('emphasis, links, code and strikethrough inside items', () => {
    expect(markdownOf(list('<strong>Bold</strong> and <em>italic</em>', '<a href="https://example.com">a link</a>', 'text with <code>code</code>', '<del>gone</del>'))).toBe(
      '- **Bold** and *italic*\n- [a link](https://example.com)\n- text with `code`\n- ~~gone~~'
    );
  });

  it('checkbox items become tasks, and ordered lists keep their start number', () => {
    expect(markdownOf('<ul><li><input type="checkbox" checked> done</li><li><input type="checkbox"> todo</li></ul>')).toBe('- [x] done\n- [ ] todo');
    expect(markdownOf('<ol start="3"><li>c</li><li>d</li></ol>')).toBe('3. c\n4. d');
  });

  it('special characters other than a leading marker are escaped exactly as before', () => {
    expect(markdownOf(list('a * b _ c [d] &lt;e&gt;'))).toBe('- a \\* b \\_ c \\[d\\] \\<e>');
  });

  it('headings, quotes and code blocks are converted as before', () => {
    expect(markdownOf('<h2>Title</h2><blockquote><p>quoted</p></blockquote><pre>code line</pre>')).toBe('## Title\n\n> quoted\n\n```\ncode line\n```');
  });
});
