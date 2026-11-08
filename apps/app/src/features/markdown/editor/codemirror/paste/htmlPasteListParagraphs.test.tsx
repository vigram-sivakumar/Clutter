// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import type { PasteAssets } from './assetPaste';
import { pasteRouting } from './pasteRouting';
import { externalPasteNormalization } from './externalPaste';

/**
 * Several paragraphs in one HTML list item stay several paragraphs of that item.
 *
 * `listItems` used to send everything in an `<li>` through the inline converter into one buffer, so `<p>a</p><p>b</p>`
 * became `ab` and text after a nested list was glued onto the marker's line. A `<p>`/`<div>` now ends the paragraph being
 * collected: the first one shares the marker's line, each later one follows a blank line and is indented to the item's
 * content column (`- ` is 2, `1. ` is 3, `10. ` is 4). Without the blank line the two lines would be one paragraph with a
 * soft break, which is a different document. Checked through the real paste handler as the pasted Markdown and as the
 * Clutter grammar's parse of it.
 */
const assets: PasteAssets = { importFile: async () => 'Assets/x.png', onFailed: () => undefined };

async function pasteHtml(html: string): Promise<string> {
  const parent = document.body.appendChild(document.createElement('div'));
  const view = new EditorView({
    state: EditorState.create({ doc: '', extensions: [markdownLanguageExtension(), pasteRouting(() => assets), externalPasteNormalization()] }),
    parent,
  });
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { files: [], getData: (type: string) => (type === 'text/html' ? html : '') },
  });
  view.contentDOM.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return view.state.doc.toString();
}

afterEach(() => {
  document.body.innerHTML = '';
});

const SHAPE_NAMES: Record<string, string> = {
  BulletList: 'ul',
  OrderedList: 'ol',
  ListItem: 'li',
  Paragraph: 'p',
  InlineCode: 'code',
  Link: 'a',
  Task: 'task',
};

/** The block structure of `doc` as a nested string, e.g. `ul(li(p()p()))`; a task shows `task`. */
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

describe('paragraphs inside one list item', () => {
  it('two <p> are two paragraphs of one item, not "First paragraphSecond paragraph"', async () => {
    const markdown = await pasteHtml(`<ul><li>
      <p>First paragraph</p>
      <p>Second paragraph</p>
    </li></ul>`);

    expect(markdown).toBe('- First paragraph\n\n  Second paragraph');
    expect(shape(markdown)).toBe('ul(li(p()p()))');
  });

  it('three paragraphs, and <div> paragraphs the same way', async () => {
    expect(await pasteHtml('<ul><li><p>a</p><p>b</p><p>c</p></li></ul>')).toBe('- a\n\n  b\n\n  c');
    expect(shape('- a\n\n  b\n\n  c')).toBe('ul(li(p()p()p()))');
    expect(await pasteHtml('<ul><li><div>a</div><div>b</div></li></ul>')).toBe('- a\n\n  b');
  });

  it('a single paragraph, with or without <p>, is unchanged', async () => {
    expect(await pasteHtml('<ul><li><p>only</p></li></ul>')).toBe('- only');
    expect(await pasteHtml('<ul><li>only <strong>one</strong></li></ul>')).toBe('- only **one**');
    expect(shape('- only')).toBe('ul(li(p()))');
  });

  it('later items stay separate items', async () => {
    const markdown = await pasteHtml('<ul><li><p>a</p><p>b</p></li><li><p>c</p></li></ul>');

    expect(markdown).toBe('- a\n\n  b\n- c');
    expect(shape(markdown)).toBe('ul(li(p()p())li(p()))');
  });

  it('an ordered item indents to its content column', async () => {
    const markdown = await pasteHtml('<ol><li><p>First</p><p>Second</p></li><li><p>Next</p></li></ol>');

    expect(markdown).toBe('1. First\n\n   Second\n2. Next');
    expect(shape(markdown)).toBe('ol(li(p()p())li(p()))');
  });

  it('a wide ordered marker (10.) indents to its wider content column', async () => {
    const markdown = await pasteHtml('<ol start="10"><li><p>First</p><p>Second</p></li></ol>');

    expect(markdown).toBe('10. First\n\n    Second');
    expect(shape(markdown)).toBe('ol(li(p()p()))');
  });
});

describe('paragraphs combined with nested lists', () => {
  it('paragraphs followed by a nested list', async () => {
    const markdown = await pasteHtml('<ul><li><p>First</p><p>Second</p><ul><li>child</li></ul></li></ul>');

    expect(markdown).toBe('- First\n\n  Second\n    - child');
    expect(shape(markdown)).toBe('ul(li(p()p()ul(li(p()))))');
  });

  it('a nested list followed by another paragraph', async () => {
    const markdown = await pasteHtml('<ul><li><p>First</p><ul><li>child</li></ul><p>After</p></li></ul>');

    expect(markdown).toBe('- First\n    - child\n\n  After');
    expect(shape(markdown)).toBe('ul(li(p()ul(li(p()))p()))');
  });

  it('text after a nested list is no longer glued onto the first line', async () => {
    const markdown = await pasteHtml('<ul><li>Intro<ul><li>child</li></ul>tail</li></ul>');

    expect(markdown).toBe('- Intro\n    - child\n\n  tail');
    expect(shape(markdown)).toBe('ul(li(p()ul(li(p()))p()))');
  });

  it('an item that starts with a nested list stays as it was', async () => {
    const markdown = await pasteHtml('<ul><li><ul><li>child</li></ul></li></ul>');

    expect(markdown).toBe('-\n    - child');
    expect(shape(markdown)).toBe('ul(li(ul(li(p()))))');
  });

  it('a nested item with two paragraphs indents to its own content column', async () => {
    const markdown = await pasteHtml('<ul><li>Parent<ul><li><p>One</p><p>Two</p></li></ul></li></ul>');

    expect(markdown).toBe('- Parent\n    - One\n\n      Two');
    expect(shape(markdown)).toBe('ul(li(p()ul(li(p()p()))))');
  });

  it('a nested list in a <div> wrapper is still a nested list', async () => {
    const markdown = await pasteHtml('<ul><li><div>Parent</div><div><ul><li>child</li></ul></div></li></ul>');

    expect(markdown).toBe('- Parent\n    - child');
    expect(shape(markdown)).toBe('ul(li(p()ul(li(p()))))');
  });
});

describe('paragraphs with tasks, literal text and inline content', () => {
  it('a task item with two paragraphs is one task with a second paragraph', async () => {
    const markdown = await pasteHtml('<ul><li><input type="checkbox" checked><p>First</p><p>Second</p></li></ul>');

    expect(markdown).toBe('- [x] First\n\n  Second');
    expect(nodeTexts(markdown, 'TaskMarker')).toEqual(['[x]']);
    expect(nodeTexts(markdown, 'ListItem')).toHaveLength(1);
    // The grammar makes a task item's first paragraph the `Task` node itself, so the second is the only `Paragraph`.
    expect(nodeTexts(markdown, 'Task')).toEqual(['[x] First']);
    expect(nodeTexts(markdown, 'Paragraph')).toEqual(['Second']);
  });

  it('literal checkbox text in a later paragraph stays literal text', async () => {
    const markdown = await pasteHtml('<ul><li><p>First</p><p>[ ] Second</p></li></ul>');

    expect(markdown).toBe('- First\n\n  \\[ \\] Second');
    expect(nodeTexts(markdown, 'TaskMarker')).toEqual([]);
    expect(shape(markdown)).toBe('ul(li(p()p()))');
  });

  it('a later paragraph that looks like a list marker stays a paragraph', async () => {
    const markdown = await pasteHtml('<ul><li><p>First</p><p>- not an item</p><p>1. nor this</p></li></ul>');

    expect(markdown).toBe('- First\n\n  \\- not an item\n\n  1\\. nor this');
    expect(shape(markdown)).toBe('ul(li(p()p()p()))');
  });

  it('links and code inside paragraphs are kept', async () => {
    const markdown = await pasteHtml(
      '<ul><li><p>See <a href="https://example.com">the docs</a></p><p>Run <code>npm test</code> and <strong>wait</strong></p></li></ul>'
    );

    expect(markdown).toBe('- See [the docs](https://example.com)\n\n  Run `npm test` and **wait**');
    expect(shape(markdown)).toBe('ul(li(p(a())p(code())))');
  });
});
