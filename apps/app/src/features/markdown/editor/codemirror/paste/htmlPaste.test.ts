// @vitest-environment jsdom
import { history, undo, redo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { tableCreatePaste } from '../table/tableCreatePaste';
import { pasteAssets, type PasteAssets } from './assetPaste';
import { decodeDataImage, hasRichHtml, htmlToPieces } from './htmlToMarkdown';

// 1x1 transparent PNG, and a different one (so "same bytes" and "different bytes" are both real).
const PNG_A = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG_B = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function mount(doc: string, assets: PasteAssets | undefined, cursor = doc.length) {
  const parent = document.body.appendChild(document.createElement('div'));
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [markdown({ extensions: GFM }), tableCreatePaste(), pasteAssets(() => assets), history()],
    }),
    parent,
  });
}

function paste(view: EditorView, html: string, text = '', files: File[] = []) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { files, getData: (type: string) => (type === 'text/html' ? html : type === 'text/plain' ? text : '') },
  });
  view.contentDOM.dispatchEvent(event);
  return event;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeAssets() {
  const imported: string[] = [];
  const onFailed = vi.fn();
  let n = 0;
  const importFile = vi.fn(async (f: { name: string }) => {
    n += 1;
    imported.push(f.name);
    return `Assets/${f.name}-${n}.png`;
  });
  return { assets: { importFile, onFailed } satisfies PasteAssets, imported, onFailed, importFile };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('htmlToPieces', () => {
  const md = (html: string) => htmlToPieces(html).map((piece) => (piece.kind === 'markdown' ? piece.text : `<img ${piece.src}>`));

  it('keeps bold, italic, strike, links, code and headings', () => {
    expect(md('<h2>Title</h2><p>a <strong>b</strong> <em>c</em> <del>d</del> <a href="https://x.com/a">e</a> <code>f</code></p>')).toEqual([
      '## Title\n\na **b** *c* ~~d~~ [e](https://x.com/a) `f`',
    ]);
  });

  it('converts nested lists, ordered lists and tasks', () => {
    expect(md('<ul><li>one<ul><li>two</li></ul></li></ul><ol><li>x</li><li>y</li></ol><ul><li><input type="checkbox" checked> done</li></ul>')).toEqual([
      '- one\n    - two\n\n1. x\n2. y\n\n- [x] done',
    ]);
  });

  it('indents a list nested in an ordered item far enough to stay nested', () => {
    expect(md('<ol><li>Parent<ol><li>Nested</li></ol></li></ol>')).toEqual(['1. Parent\n    1. Nested']);
  });

  it('keeps images where they were, between the text around them', () => {
    expect(md('<p>before</p><img src="data:image/png;base64,AAAA"><p>middle <img src="https://x.com/i.png"> after</p>')).toEqual([
      'before',
      '<img data:image/png;base64,AAAA>',
      'middle',
      '<img https://x.com/i.png>',
      'after',
    ]);
  });

  it('an image inside a list item keeps the item text and comes right after the list', () => {
    expect(md('<ul><li>a <img src="https://x/y.png"> b</li><li>c</li></ul><p>after</p>')).toEqual(['- a b\n- c', '<img https://x/y.png>', 'after']);
  });

  it('an image inside a quote keeps the whole quote together and comes right after it', () => {
    expect(md('<blockquote><p>q1</p><img src="https://x/y.png"><p>q2</p></blockquote><p>z</p>')).toEqual(['> q1\n>\n> q2', '<img https://x/y.png>', 'z']);
  });

  it('literal angle brackets stay text, and link addresses with parentheses or spaces stay one link', () => {
    expect(md('<p>&lt;b&gt;x</p><p><a href="https://x.com/(a b)">l</a></p>')).toEqual(['\\<b>x\n\n[l](https://x.com/%28a%20b%29)']);
  });

  it('drops scripts, handlers and unsafe links, keeping the link text', () => {
    expect(md('<p onclick="x()">hi <a href="javascript:alert(1)">there</a><script>alert(1)</script></p>')).toEqual(['hi there']);
  });

  it('escapes text that would otherwise become Markdown', () => {
    expect(md('<p>2 * 3 _x_</p><p>- not a list</p>')).toEqual(['2 \\* 3 \\_x\\_\n\n\\- not a list']);
  });

  describe('WikiLink brackets are preserved', () => {
    it('keeps a WikiLink in an ordinary paragraph', () => {
      expect(md('<p>[[Page]]</p>')).toEqual(['[[Page]]']);
    });

    it('keeps WikiLinks in an ordered list — the reported corruption case', () => {
      expect(md('<ol><li>[[Inline styles]]</li><li>[[Lists]]</li></ol>')).toEqual(['1. [[Inline styles]]\n2. [[Lists]]']);
    });

    it('keeps a WikiLink in an unordered list', () => {
      expect(md('<ul><li>[[Page]]</li></ul>')).toEqual(['- [[Page]]']);
    });

    it('keeps a WikiLink alias', () => {
      expect(md('<p>[[Page|Alias]]</p>')).toEqual(['[[Page|Alias]]']);
    });

    it('still escapes an unpaired or malformed bracket', () => {
      expect(md('<p>a [b</p>')).toEqual(['a \\[b']);
      expect(md('<p>a ]b</p>')).toEqual(['a \\]b']);
      expect(md('<p>[[no close</p>')).toEqual(['\\[\\[no close']);
    });

    it('still escapes WikiLink-shaped text inside a real link label, so the outer link is not corrupted', () => {
      expect(md('<p><a href="https://x.com">See [[here]]</a></p>')).toEqual(['[See \\[\\[here\\]\\]](https://x.com)']);
    });

    it('leaves WikiLink-shaped text inside code untouched and inert (a code span, not a live WikiLink)', () => {
      expect(md('<p><code>[[Page]]</code></p>')).toEqual(["`[[Page]]`"]);
    });

    it('keeps a WikiLink inside a table cell', () => {
      expect(md('<table><tr><td>[[Page]]</td><td>plain</td></tr></table>')).toEqual(['| [[Page]] | plain |\n| --- | --- |']);
    });

    it('still preserves a WikiLink nested inside bold/italic composition', () => {
      expect(md('<p><strong>[[Page]]</strong></p>')).toEqual(['**[[Page]]**']);
    });
  });

  it('survives malformed HTML', () => {
    expect(() => htmlToPieces('<p><b>unclosed <i>mess</p></div><<>')).not.toThrow();
    expect(htmlToPieces('')).toEqual([]);
  });

  it('only calls HTML rich when it has structure or an image', () => {
    expect(hasRichHtml('<div><span style="color:red">plain code</span></div>')).toBe(false);
    expect(hasRichHtml('<p>a <b>b</b></p>')).toBe(true);
    expect(hasRichHtml('<img src="x">')).toBe(true);
  });

  it('decodes only base64 image data URLs', () => {
    expect(decodeDataImage(PNG_A)?.type).toBe('image/png');
    expect(decodeDataImage('data:text/html;base64,AAAA')).toBeNull();
    expect(decodeDataImage('https://x.com/a.png')).toBeNull();
  });
  it('converts a table to a GFM table, keeping inline formatting and escaping pipes', () => {
    expect(
      md('<p>Before</p><table><thead><tr><th>Query</th><th>Fields</th></tr></thead><tbody><tr><td><code>T</code></td><td>a | <strong>b</strong></td></tr><tr><td>x</td></tr></tbody></table><p>After</p>')
    ).toEqual(['Before\n\n| Query | Fields |\n| --- | --- |\n| `T` | a \\| **b** |\n| x |  |\n\nAfter']);
  });

  it('leaves a layout table (block content in a cell) as plain blocks', () => {
    expect(md('<table><tr><td><ul><li>a</li></ul></td></tr></table>')).toEqual(['- a']);
  });
});

describe('pasting rich HTML', () => {
  it('formatted text becomes Markdown at the caret', async () => {
    const { assets, importFile } = fakeAssets();
    const view = mount('Hi ', assets);

    const event = paste(view, '<p>a <strong>b</strong></p>', 'a b');
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe('Hi a **b**');
    expect(importFile).not.toHaveBeenCalled();
  });

  it('pastes WikiLinks from rich HTML without corrupting their brackets — the reported corruption, through the real paste event', async () => {
    const { assets } = fakeAssets();
    const view = mount('', assets);

    const event = paste(view, '<ol><li>[[Inline styles]]</li><li>[[Lists]]</li></ol>', 'plain fallback that must not be used');
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe('1. [[Inline styles]]\n2. [[Lists]]');
  });

  it('text and an embedded image: the image is stored and embedded in order', async () => {
    const { assets, imported } = fakeAssets();
    const view = mount('', assets);

    paste(view, `<p>one</p><img src="${PNG_A}" alt="shot"><p>two</p>`);
    await settle();

    expect(imported).toEqual(['shot']);
    expect(view.state.doc.toString()).toBe('one\n![[Assets/shot-1.png]]\ntwo');
  });

  it('several images interspersed with text keep their positions; identical images are stored once', async () => {
    const { assets, importFile } = fakeAssets();
    const view = mount('', assets);

    paste(view, `<p>a</p><img src="${PNG_A}"><p>b</p><img src="${PNG_B}"><p>c</p><img src="${PNG_A}">`);
    await settle();

    expect(importFile).toHaveBeenCalledTimes(2);
    expect(view.state.doc.toString()).toBe('a\n![[Assets/image-1.png]]\nb\n![[Assets/image-2.png]]\nc\n![[Assets/image-1.png]]');
  });

  it('an external image URL stays a Markdown image; nothing is stored or fetched', async () => {
    const { assets, importFile, onFailed } = fakeAssets();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const view = mount('', assets);

    paste(view, '<p>see</p><img src="https://example.com/a.png" alt="A">');
    await settle();

    expect(view.state.doc.toString()).toBe('see\n![A](https://example.com/a.png)');
    expect(importFile).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onFailed).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('an image that cannot be recovered is reported; the text and other images still go in', async () => {
    const { assets, onFailed } = fakeAssets();
    const view = mount('', assets);

    paste(view, `<p>keep</p><img src="blob:abc" alt="lost"><img src="${PNG_A}"><img src="data:image/png;base64,@@@">`);
    await settle();

    expect(view.state.doc.toString()).toBe('keep\n![[Assets/image-1.png]]');
    expect(onFailed).toHaveBeenCalledWith(['lost', 'image']);
  });

  it('one undo removes the whole paste, redo restores it', async () => {
    const { assets } = fakeAssets();
    const view = mount('Hi', assets);

    paste(view, `<p>x</p><img src="${PNG_A}">`);
    await settle();
    undo(view);
    expect(view.state.doc.toString()).toBe('Hi');
    redo(view);
    expect(view.state.doc.toString()).toBe('Hix\n![[Assets/image-1.png]]');
  });

  it('inserts nothing once the editor is gone, and says the images were kept', async () => {
    const { assets } = fakeAssets();
    const onNotInserted = vi.fn();
    const view = mount('ab', { ...assets, onNotInserted }, 1);

    paste(view, `<p>x</p><img src="${PNG_A}">`);
    view.destroy();
    await settle();

    expect(view.state.doc.toString()).toBe('ab');
    expect(onNotInserted).toHaveBeenCalledWith(1);
  });

  it('keeps a table row on one line', async () => {
    const { assets } = fakeAssets();
    const view = mount('| a |\n| - |\n| x |', assets, 16);

    paste(view, `<p>t</p><img src="${PNG_A}">`);
    await settle();

    expect(view.state.doc.toString().split('\n')).toHaveLength(3);
  });
  it('a longer rendered document keeps its tables as tables, with the surrounding content', async () => {
    const { assets } = fakeAssets();
    const view = mount('', assets);
    const table = (rows: string) => `<table><thead><tr><th>Query</th><th>Search fields</th></tr></thead><tbody>${rows}</tbody></table>`;
    const row = (a: string, b: string) => `<tr><td><code>${a}</code></td><td>${b}</td></tr>`;

    paste(
      view,
      `<h2>1. Clarify query length</h2><p>Count <strong>non-whitespace</strong> characters.</p>${table(row('T', 'Titles only') + row('Tes', 'All fields'))}` +
        `<ul><li>Words of 1–2 characters: no fuzzy matching.</li><li>Words of 3–5 characters: one edit.</li></ul>` +
        `<p>Then rank:</p>${table(row('1', 'Exact title'))}<p>Done.</p>`,
      'plain fallback that must not be used'
    );
    await settle();

    const doc = view.state.doc.toString();
    const tables: string[] = [];
    ensureSyntaxTree(view.state, doc.length, 5000)!.iterate({
      enter: (node) => {
        if (node.name === 'Table') tables.push(doc.slice(node.from, node.to));
      },
    });

    expect(tables).toEqual(['| Query | Search fields |\n| --- | --- |\n| `T` | Titles only |\n| `Tes` | All fields |', '| Query | Search fields |\n| --- | --- |\n| `1` | Exact title |']);
    expect(doc).toContain('## 1. Clarify query length');
    expect(doc).toContain('Count **non-whitespace** characters.');
    expect(doc).toContain('- Words of 3–5 characters: one edit.');
    expect(doc.endsWith('Done.')).toBe(true);
    view.destroy();
  });
});

describe('everything else is left alone', () => {
  it.each([
    ['plain text', '', 'just text'],
    ['HTML with no structure (an editor or terminal copy)', '<div><span style="color:red">const a = 1</span></div>', 'const a = 1'],
    ['no HTML at all', '', ''],
  ])('%s', async (_label, html, text) => {
    const { assets } = fakeAssets();
    const view = mount('', assets);

    paste(view, html, text);
    await settle();

    // The default paste ran: the plain text went in as it was.
    expect(view.state.doc.toString()).toBe(text);
  });

  it('a spreadsheet table is still created as a table, before any HTML conversion', async () => {
    const { assets, importFile } = fakeAssets();
    const view = mount('', assets);

    const event = paste(view, '<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>', 'a\tb\nc\td');
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toContain('| a | b |');
    expect(importFile).not.toHaveBeenCalled();
  });

  it('pasted files win over HTML that came with them', async () => {
    const { assets, importFile } = fakeAssets();
    const view = mount('', assets);
    const bytes = new TextEncoder().encode('PNG');
    const f = new File([bytes], 'a.png', { type: 'image/png' });
    Object.defineProperty(f, 'arrayBuffer', { value: async () => bytes.buffer });

    paste(view, '<p><b>html</b></p>', '', [f]);
    await settle();

    expect(importFile).toHaveBeenCalledTimes(1);
    expect(view.state.doc.toString()).toBe('![[Assets/a.png-1.png]]');
  });
});
