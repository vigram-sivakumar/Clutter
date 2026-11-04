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
 * A `<pre>` in an HTML list item stays a fenced code block of that item.
 *
 * `listItems` used to hand a `<pre>` to the inline converter, which collapsed its lines into the item's text
 * (`- stepnpm i npm test`). It is now its own part of the item, between the paragraphs and lists around it: a fence
 * indented to the item's content column, with the language from a `language-*` / `lang-*` class on the `<pre>` or its
 * `<code>`. The fence is indented, which `normalizeExternalPaste` has to recognise (see `openingFence`): without that it
 * would compact the code's blank lines and re-indent its `- x` lines as list items. Checked through the real paste
 * handler as the pasted Markdown and as the Clutter grammar's parse of it, with the code read back from the parse.
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
  FencedCode: 'fence',
  CodeBlock: 'INDENTED-CODE',
  Task: 'task',
};

function parse(doc: string) {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  ensureSyntaxTree(state, doc.length, 5000);
  return syntaxTree(state);
}

/** The block structure of `doc` as a nested string, e.g. `ul(li(p()fence()p()))`; a task shows `task`. */
function shape(doc: string): string {
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
  return walk(parse(doc).topNode as any);
}

/** The source text of every node called `name` in the parse of `doc`, in order. */
function nodeTexts(doc: string, name: string): string[] {
  const found: string[] = [];
  parse(doc).iterate({
    enter: (node) => {
      if (node.name === name) {
        found.push(doc.slice(node.from, node.to));
      }
    },
  });
  return found;
}

/** The code of each fenced block, as the grammar reads it (the item's indentation is not part of it). */
function fencedCode(doc: string): string[] {
  const blocks: string[] = [];
  parse(doc).iterate({
    enter: (node) => {
      if (node.name === 'FencedCode') {
        blocks.push(
          node.node
            .getChildren('CodeText')
            .map((text) => doc.slice(text.from, text.to))
            .join('')
        );
      }
    },
  });
  return blocks;
}

describe('a <pre> inside a list item', () => {
  it('the reported example: code between two paragraphs stays a fenced block of the same item', async () => {
    const markdown = await pasteHtml(`<ul>
      <li>
        <p>Run this command:</p>
        <pre><code class="language-js">const answer = 42;
console.log(answer);</code></pre>
        <p>Then continue.</p>
      </li>
    </ul>`);

    expect(markdown).toBe('- Run this command:\n  ```js\n  const answer = 42;\n  console.log(answer);\n  ```\n\n  Then continue.');
    expect(shape(markdown)).toBe('ul(li(p()fence()p()))');
    expect(nodeTexts(markdown, 'ListItem')).toHaveLength(1);
    expect(nodeTexts(markdown, 'CodeInfo')).toEqual(['js']);
    expect(fencedCode(markdown)).toEqual(['const answer = 42;\nconsole.log(answer);']);
  });

  it('a plain <pre> (no <code>, no language) is a fence with no info string', async () => {
    const markdown = await pasteHtml('<ul><li>step<pre>npm i\nnpm test</pre></li></ul>');

    expect(markdown).toBe('- step\n  ```\n  npm i\n  npm test\n  ```');
    expect(shape(markdown)).toBe('ul(li(p()fence()))');
    expect(nodeTexts(markdown, 'CodeInfo')).toEqual([]);
    expect(fencedCode(markdown)).toEqual(['npm i\nnpm test']);
  });

  it('a <pre><code> without a language class has no info string either', async () => {
    const markdown = await pasteHtml('<ul><li>a<pre><code>x = 1</code></pre></li></ul>');

    expect(markdown).toBe('- a\n  ```\n  x = 1\n  ```');
    expect(nodeTexts(markdown, 'CodeInfo')).toEqual([]);
  });

  it('the language is read from the <pre> class, from lang-*, and ignores unrelated classes', async () => {
    expect(await pasteHtml('<ul><li>a<pre class="language-python">x</pre></li></ul>')).toBe('- a\n  ```python\n  x\n  ```');
    expect(await pasteHtml('<ul><li>a<pre><code class="lang-ts">x</code></pre></li></ul>')).toBe('- a\n  ```ts\n  x\n  ```');
    expect(await pasteHtml('<ul><li>a<pre><code class="hljs language-c++ other">x</code></pre></li></ul>')).toBe('- a\n  ```c++\n  x\n  ```');
    expect(await pasteHtml('<ul><li>a<pre><code class="hljs">x</code></pre></li></ul>')).toBe('- a\n  ```\n  x\n  ```');
  });

  it('code before the paragraphs: an item that starts with code', async () => {
    const markdown = await pasteHtml('<ul><li><pre><code class="language-sh">make</code></pre><p>After</p></li></ul>');

    expect(markdown).toBe('-\n  ```sh\n  make\n  ```\n\n  After');
    expect(shape(markdown)).toBe('ul(li(fence()p()))');
    expect(fencedCode(markdown)).toEqual(['make']);
  });

  it('code after the paragraphs, at the end of the item', async () => {
    const markdown = await pasteHtml('<ul><li><p>One</p><p>Two</p><pre>code</pre></li></ul>');

    expect(markdown).toBe('- One\n\n  Two\n  ```\n  code\n  ```');
    expect(shape(markdown)).toBe('ul(li(p()p()fence()))');
  });

  it('the following item is a separate item', async () => {
    const markdown = await pasteHtml('<ul><li>a<pre>x</pre></li><li>b</li></ul>');

    expect(markdown).toBe('- a\n  ```\n  x\n  ```\n- b');
    expect(shape(markdown)).toBe('ul(li(p()fence())li(p()))');
  });
});

describe('code in ordered and nested items', () => {
  it('an ordered item indents the fence to its content column', async () => {
    const markdown = await pasteHtml('<ol><li><p>Run:</p><pre><code class="language-js">go()</code></pre></li><li>Next</li></ol>');

    expect(markdown).toBe('1. Run:\n   ```js\n   go()\n   ```\n2. Next');
    expect(shape(markdown)).toBe('ol(li(p()fence())li(p()))');
    expect(fencedCode(markdown)).toEqual(['go()']);
  });

  it('a wide marker (10.) indents to its wider content column', async () => {
    const markdown = await pasteHtml('<ol start="10"><li>Run:<pre>go()</pre></li></ol>');

    expect(markdown).toBe('10. Run:\n    ```\n    go()\n    ```');
    expect(shape(markdown)).toBe('ol(li(p()fence()))');
  });

  it('a nested item keeps its code inside the nested item, not the parent', async () => {
    const markdown = await pasteHtml('<ul><li>Parent<ul><li>Child<pre><code class="language-js">a()\n\nb()</code></pre></li></ul></li></ul>');

    expect(markdown).toBe('- Parent\n    - Child\n      ```js\n      a()\n\n      b()\n      ```');
    expect(shape(markdown)).toBe('ul(li(p()ul(li(p()fence()))))');
    expect(fencedCode(markdown)).toEqual(['a()\n\nb()']);
  });

  it('code followed by a nested list keeps both in the item, in order', async () => {
    const markdown = await pasteHtml('<ul><li>Run<pre>cmd</pre><ul><li>child</li></ul></li></ul>');

    expect(markdown).toBe('- Run\n  ```\n  cmd\n  ```\n    - child');
    expect(shape(markdown)).toBe('ul(li(p()fence()ul(li(p()))))');
  });

  it('a nested list followed by code', async () => {
    const markdown = await pasteHtml('<ul><li>Run<ul><li>child</li></ul><pre>cmd</pre></li></ul>');

    expect(markdown).toBe('- Run\n    - child\n  ```\n  cmd\n  ```');
    expect(shape(markdown)).toBe('ul(li(p()ul(li(p()))fence()))');
  });

  it('a task item can hold code', async () => {
    const markdown = await pasteHtml('<ul><li><input type="checkbox"> Run<pre>cmd</pre></li></ul>');

    expect(markdown).toBe('- [ ] Run\n  ```\n  cmd\n  ```');
    expect(nodeTexts(markdown, 'TaskMarker')).toEqual(['[ ]']);
    expect(nodeTexts(markdown, 'ListItem')).toHaveLength(1);
    expect(fencedCode(markdown)).toEqual(['cmd']);
  });
});

describe('several code blocks', () => {
  it('two code blocks with a paragraph between them', async () => {
    const markdown = await pasteHtml('<ul><li><p>First:</p><pre class="language-js">a()</pre><p>Then:</p><pre class="language-sh">b</pre></li></ul>');

    expect(markdown).toBe('- First:\n  ```js\n  a()\n  ```\n\n  Then:\n  ```sh\n  b\n  ```');
    expect(shape(markdown)).toBe('ul(li(p()fence()p()fence()))');
    expect(nodeTexts(markdown, 'CodeInfo')).toEqual(['js', 'sh']);
    expect(fencedCode(markdown)).toEqual(['a()', 'b']);
  });

  it('two code blocks back to back stay two blocks', async () => {
    const markdown = await pasteHtml('<ul><li>x<pre>one</pre><pre>two</pre></li></ul>');

    expect(shape(markdown)).toBe('ul(li(p()fence()fence()))');
    expect(fencedCode(markdown)).toEqual(['one', 'two']);
  });

  it('code blocks in different items stay in their own items', async () => {
    const markdown = await pasteHtml('<ol><li>a<pre>1</pre></li><li>b<pre>2</pre></li></ol>');

    expect(shape(markdown)).toBe('ol(li(p()fence())li(p()fence()))');
    expect(fencedCode(markdown)).toEqual(['1', '2']);
  });
});

describe('the code is not altered', () => {
  // Everything that would mean something as Markdown, or to the paste compaction, if it were not inside the fence.
  const CODE = [
    'function f() {',
    '    return 1;',
    '',
    '',
    '\tif (x) {}',
    '- not an item',
    '1. nor this',
    '# not a heading',
    '> not a quote',
    '- \\[ \\] not an unescaped task',
    '- [ ]  two spaces after a task marker',
    '| a | b |',
    '*star* _under_ [x](y) <b>',
    '    - indented marker',
    '}',
  ].join('\n');

  it('line breaks, blank lines, tabs, indentation and Markdown-looking lines come back exactly', async () => {
    const markdown = await pasteHtml(`<ul><li>Code:<pre><code class="language-js">${CODE.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code></pre></li></ul>`);

    expect(fencedCode(markdown)).toEqual([CODE]);
    expect(shape(markdown)).toBe('ul(li(p()fence()))');
  });

  // Fences indented 4+ columns (a nested item, a wide marker) are the ones `normalizeExternalPaste` must recognise on its own.
  const html = CODE.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  it.each([
    ['a nested bullet', `<ul><li>Parent<ul><li>Child<pre>${html}</pre></li></ul></li></ul>`, 'ul(li(p()ul(li(p()fence()))))'],
    ['a nested ordered item', `<ul><li>Parent<ol><li>Child<pre>${html}</pre></li></ol></li></ul>`, 'ul(li(p()ol(li(p()fence()))))'],
    ['a wide ordered marker', `<ol start="10"><li>Child<pre>${html}</pre></li></ol>`, 'ol(li(p()fence()))'],
    ['two levels down', `<ul><li>A<ul><li>B<ul><li>C<pre>${html}</pre></li></ul></li></ul></li></ul>`, 'ul(li(p()ul(li(p()ul(li(p()fence()))))))'],
  ])('the same holds in %s', async (_name, input, expectedShape) => {
    const markdown = await pasteHtml(input);

    expect(fencedCode(markdown)).toEqual([CODE]);
    expect(shape(markdown)).toBe(expectedShape);
  });

  it('code that contains a fence gets a longer fence and keeps it as text', async () => {
    const code = 'before\n```\ninner\n```\nafter';
    const markdown = await pasteHtml(`<ul><li>Code:<pre>${code}</pre></li></ul>`);

    expect(markdown.split('\n')[1]).toBe('  ````');
    expect(fencedCode(markdown)).toEqual([code]);
    expect(shape(markdown)).toBe('ul(li(p()fence()))');
  });

  it('trailing blank lines after the code are not part of it', async () => {
    const markdown = await pasteHtml('<ul><li>a<pre>x\n\n\n</pre></li></ul>');

    expect(fencedCode(markdown)).toEqual(['x']);
  });
});

describe('what was already working stays as it was', () => {
  it('a single paragraph, several paragraphs, nested lists and tasks', async () => {
    expect(await pasteHtml('<ul><li><p>only</p></li></ul>')).toBe('- only');
    expect(await pasteHtml('<ul><li><p>a</p><p>b</p></li></ul>')).toBe('- a\n\n  b');
    expect(await pasteHtml('<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>')).toBe('- a\n    - b\n        - c');
    expect(await pasteHtml('<ul><li><input type="checkbox" checked> done</li><li>[ ] literal</li></ul>')).toBe('- [x] done\n- \\[ \\] literal');
  });

  it('a top-level <pre> without a language is converted exactly as before (the compaction drops the blank line before a fence)', async () => {
    expect(await pasteHtml('<p><strong>x</strong></p><pre><code>a()</code></pre>')).toBe('**x**\n```\na()\n```');
  });
});
