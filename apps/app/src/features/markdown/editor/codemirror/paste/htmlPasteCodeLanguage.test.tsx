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
 * A top-level `<pre>` keeps its language: `class="language-js"` (or `lang-js`) on the `<pre>` or its `<code>` becomes the
 * fence's info string. The block case of the converter used to build the fence without reading any class; it now
 * uses the same `preCode` / `fenceFor` / `preLanguage` helpers as a `<pre>` inside a list item. Checked through the real
 * paste handler as the pasted Markdown and as the Clutter grammar's `FencedCode` / `CodeInfo` / `CodeText`, with the code
 * read back from the parse.
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

/** Every fenced block of `doc`: its info string ('' when none), and its code as the grammar reads it. */
function fences(doc: string): { info: string; code: string }[] {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  ensureSyntaxTree(state, doc.length, 5000);
  const found: { info: string; code: string }[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === 'FencedCode') {
        const info = node.node.getChild('CodeInfo');
        found.push({
          info: info ? doc.slice(info.from, info.to) : '',
          code: node.node
            .getChildren('CodeText')
            .map((text) => doc.slice(text.from, text.to))
            .join(''),
        });
      }
    },
  });
  return found;
}

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

describe('a top-level <pre> keeps its language', () => {
  it('the reported example: language-js on the <code>', async () => {
    const markdown = await pasteHtml('<pre><code class="language-js">const answer = 42;\nconsole.log(answer);</code></pre>');

    expect(markdown).toBe('```js\nconst answer = 42;\nconsole.log(answer);\n```');
    expect(fences(markdown)).toEqual([{ info: 'js', code: 'const answer = 42;\nconsole.log(answer);' }]);
  });

  it('lang-js on the <code>', async () => {
    const markdown = await pasteHtml('<pre><code class="lang-js">a()</code></pre>');

    expect(markdown).toBe('```js\na()\n```');
    expect(fences(markdown)).toEqual([{ info: 'js', code: 'a()' }]);
  });

  it('language-* and lang-* on the <pre> itself', async () => {
    expect(fences(await pasteHtml('<pre class="language-python">x = 1</pre>'))).toEqual([{ info: 'python', code: 'x = 1' }]);
    expect(fences(await pasteHtml('<pre class="lang-rust"><code>let x = 1;</code></pre>'))).toEqual([{ info: 'rust', code: 'let x = 1;' }]);
  });

  it('the <code> class wins over the <pre> class, and unrelated classes are ignored', async () => {
    expect(await pasteHtml('<pre class="language-text"><code class="hljs language-c++ other">x</code></pre>')).toBe('```c++\nx\n```');
    expect(await pasteHtml('<pre class="prettyprint lang-sh"><code class="hljs">make</code></pre>')).toBe('```sh\nmake\n```');
  });

  it('language names with + # . - and _ are kept whole', async () => {
    for (const language of ['c++', 'c#', 'objective-c', 'f#', 'text.html', 'shell_session']) {
      const markdown = await pasteHtml(`<pre><code class="language-${language}">x</code></pre>`);

      expect(markdown).toBe(`\`\`\`${language}\nx\n\`\`\``);
      expect(fences(markdown)).toEqual([{ info: language, code: 'x' }]);
    }
  });

  it('a class that only contains "language" is not a language', async () => {
    expect(await pasteHtml('<pre><code class="programming-language">x</code></pre>')).toBe('```\nx\n```');
    expect(await pasteHtml('<pre><code class="language-">x</code></pre>')).toBe('```\nx\n```');
  });
});

describe('a top-level <pre> without a language is unchanged', () => {
  it('<pre><code> and a plain <pre>', async () => {
    expect(await pasteHtml('<pre><code>a()</code></pre>')).toBe('```\na()\n```');
    expect(await pasteHtml('<pre>a()</pre>')).toBe('```\na()\n```');
    expect(fences('```\na()\n```')).toEqual([{ info: '', code: 'a()' }]);
  });

  it('a <pre> of only whitespace is still dropped', async () => {
    expect(await pasteHtml('<p><strong>x</strong></p><pre>  \n </pre>')).toBe('**x**');
  });
});

describe('the code and its fence are not altered by the language', () => {
  const CODE = ['function f() {', '    return 1;', '', '', '\tif (x) {}', '- not an item', '# not a heading', '> not a quote', '    - indented marker', '}'].join('\n');

  it('line breaks, blank lines, tabs and Markdown-looking lines come back exactly', async () => {
    const markdown = await pasteHtml(`<pre><code class="language-js">${escapeHtml(CODE)}</code></pre>`);

    expect(fences(markdown)).toEqual([{ info: 'js', code: CODE }]);
  });

  it('code with backticks gets a longer fence, and the language goes after it', async () => {
    const code = 'before\n```\ninner\n```\nafter';
    const markdown = await pasteHtml(`<pre><code class="language-md">${code}</code></pre>`);

    expect(markdown.split('\n')[0]).toBe('````md');
    expect(markdown.split('\n').at(-1)).toBe('````');
    expect(fences(markdown)).toEqual([{ info: 'md', code }]);
  });

  it('a longer run of backticks needs a longer fence still', async () => {
    const code = 'x `````` y';
    const markdown = await pasteHtml(`<pre><code class="language-md">${code}</code></pre>`);

    expect(markdown.split('\n')[0]).toBe('```````md');
    expect(fences(markdown)).toEqual([{ info: 'md', code }]);
  });

  it('tildes in the code need no special fence: a backtick fence is only closed by backticks', async () => {
    const code = '~~~\nnot a fence\n~~~';
    const markdown = await pasteHtml(`<pre><code class="language-sh">${code}</code></pre>`);

    expect(markdown).toBe('```sh\n~~~\nnot a fence\n~~~\n```');
    expect(fences(markdown)).toEqual([{ info: 'sh', code }]);
  });

  it('trailing blank lines after the code are not part of it', async () => {
    expect(fences(await pasteHtml('<pre><code class="language-js">x\n\n\n</code></pre>'))).toEqual([{ info: 'js', code: 'x' }]);
  });
});

describe('several blocks, and blocks among other content', () => {
  it('two blocks keep their own languages', async () => {
    const markdown = await pasteHtml('<pre class="language-js">a()</pre><pre><code class="language-sh">b</code></pre><pre>c</pre>');

    expect(fences(markdown)).toEqual([
      { info: 'js', code: 'a()' },
      { info: 'sh', code: 'b' },
      { info: '', code: 'c' },
    ]);
  });

  it('a block between a heading and a paragraph', async () => {
    const markdown = await pasteHtml('<h2>Title</h2><pre><code class="language-ts">let a = 1;</code></pre><p>After <strong>it</strong></p>');

    expect(markdown).toBe('## Title\n```ts\nlet a = 1;\n```\nAfter **it**');
    expect(fences(markdown)).toEqual([{ info: 'ts', code: 'let a = 1;' }]);
  });

  it('a block in a blockquote keeps its language too', async () => {
    const markdown = await pasteHtml('<blockquote><p>q</p><pre><code class="language-js">a()</code></pre></blockquote>');

    expect(markdown).toBe('> q\n>\n> ```js\n> a()\n> ```');
    expect(fences(markdown)).toEqual([{ info: 'js', code: 'a()' }]);
  });

  it('a block in a list item still goes through the list-item path, with its language', async () => {
    const markdown = await pasteHtml('<ul><li>Run:<pre><code class="language-js">a()</code></pre></li></ul>');

    expect(markdown).toBe('- Run:\n  ```js\n  a()\n  ```');
    expect(fences(markdown)).toEqual([{ info: 'js', code: 'a()' }]);
  });
});
