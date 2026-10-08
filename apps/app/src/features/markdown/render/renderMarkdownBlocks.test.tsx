// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';

import type { CompactMarkdownResolvers } from './renderCompactMarkdown';
import { renderMarkdownBlocks } from './renderMarkdownBlocks';

afterEach(() => {
  cleanup();
});

function renderBlocks(markdown: string, resolvers: CompactMarkdownResolvers = {}) {
  return render(<div data-testid="root">{renderMarkdownBlocks(markdown, resolvers)}</div>).container
    .firstElementChild as HTMLElement;
}

/**
 * Maps parsed blocks -> elements. Tokenization/inline-styling behavior is
 * already covered by tokenizeCompactMarkdown.test.ts / renderCompactMarkdown.test.tsx;
 * these tests only pin the block mapping and what the surface refuses to emit.
 */
describe('renderMarkdownBlocks — block mapping', () => {
  it('maps ATX and Setext headings to h1–h6 without their markers', () => {
    const root = renderBlocks('# One\n\n### Three\n\nTwo\n---\n\nSetext\n======');

    expect(root.querySelector('h1')?.textContent).toBe('One');
    expect(root.querySelector('h3')?.textContent).toBe('Three');
    expect(root.querySelectorAll('h1')).toHaveLength(2);
    expect(root.querySelector('h1:last-of-type')?.textContent).toBe('Setext');
    expect(root.textContent).not.toContain('#');
    expect(root.textContent).not.toContain('=');
  });

  it('maps paragraphs, keeping each as its own <p>', () => {
    const root = renderBlocks('first para\n\nsecond para');

    expect([...root.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['first para', 'second para']);
  });

  it('maps bullet and ordered lists, honoring an ordered list\'s start number', () => {
    const root = renderBlocks('- a\n- b\n\n3. three\n4. four');

    expect([...root.querySelectorAll('ul > li')].map((li) => li.textContent)).toEqual(['a', 'b']);
    const ol = root.querySelector('ol')!;
    expect(ol.getAttribute('start')).toBe('3');
    expect([...ol.querySelectorAll(':scope > li')].map((li) => li.textContent)).toEqual(['three', 'four']);
    expect(root.textContent).not.toMatch(/[-]\s|3\./);
  });

  it('nests lists inside their parent item', () => {
    const root = renderBlocks('- parent\n  - child\n    - grandchild\n- sibling');

    const topItems = root.querySelectorAll(':scope > ul > li');
    expect(topItems).toHaveLength(2);
    expect(topItems[0]!.querySelector(':scope > p')?.textContent).toBe('parent');
    expect(topItems[0]!.querySelector(':scope > ul > li > p')?.textContent).toBe('child');
    expect(topItems[0]!.querySelector(':scope > ul > li > ul > li > p')?.textContent).toBe('grandchild');
  });

  it('renders task items with a non-interactive box carrying the checked state', () => {
    const root = renderBlocks('- [ ] todo\n- [x] done');

    const tasks = root.querySelectorAll('.markdown-blocks__task');
    expect(tasks[0]).toHaveAttribute('data-checked', 'false');
    expect(tasks[1]).toHaveAttribute('data-checked', 'true');
    expect(tasks[1]!.textContent).toBe('done');
    expect(root.querySelector('input')).toBeNull();
  });

  it('keeps a task\'s text (all its inline spans and lines) in one text column beside the box, so wrapped lines never flow under it', () => {
    const root = renderBlocks('- [ ] a **bold** and `code` task\n- [ ] first line\n  second line');

    for (const task of root.querySelectorAll('.markdown-blocks__task')) {
      expect(task.children).toHaveLength(2);
      expect(task.children[0]).toHaveClass('markdown-blocks__task-box');
      expect(task.children[1]).toHaveClass('markdown-blocks__task-text');
    }
    expect(root.querySelector('.markdown-blocks__task-text strong')).not.toBeNull();
  });

  it('draws the task box as the editor\'s circle checkbox glyphs: outline when open, filled with a tick when done', () => {
    const root = renderBlocks('- [ ] todo\n- [x] done');

    const [open, done] = [...root.querySelectorAll('.markdown-blocks__task-box')];
    expect(open!.tagName.toLowerCase()).toBe('svg');
    expect(open!.querySelector('circle')?.getAttribute('r')).toBe('7.5');
    expect(open!.querySelector('path')).toBeNull();
    expect(done!.querySelector('circle')?.getAttribute('r')).toBe('8');
    expect(done!.querySelector('path')?.getAttribute('d')).toBe('M5 8.42857L6.8 11L11 5');
  });

  it('marks task items so the preview can drop their bullet dot (plain items are not marked)', () => {
    const root = renderBlocks('- [ ] todo\n- plain');

    const items = root.querySelectorAll('li');
    expect(items[0]).toHaveClass('markdown-blocks__list-item--task');
    expect(items[1]).not.toHaveClass('markdown-blocks__list-item--task');
  });

  it('maps a blockquote to <blockquote> with its blocks inside, markers removed', () => {
    const root = renderBlocks('> quoted line\n> second line\n>\n> - inside list');

    const quote = root.querySelector('blockquote')!;
    expect(quote.querySelector('p')?.textContent).toContain('quoted line');
    expect(quote.querySelector('ul > li')?.textContent).toBe('inside list');
    expect(quote.textContent).not.toContain('>');
  });

  it('maps fenced code to <pre><code> verbatim, including blank lines, without fences or info string', () => {
    const root = renderBlocks('```ts\nconst a = 1;\n\nconst **b** = 2;\n```');

    const code = root.querySelector('pre > code')!;
    expect(code.textContent).toBe('const a = 1;\n\nconst **b** = 2;');
    expect(root.querySelector('pre strong')).toBeNull();
  });

  it('maps a table to thead/tbody with column alignment and inline content in cells', () => {
    const root = renderBlocks('| A | B |\n|:--|--:|\n| **1** | 2 |\n| x | y |');

    expect([...root.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['A', 'B']);
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(root.querySelector('tbody td strong')?.textContent).toBe('1');
    const headers = root.querySelectorAll<HTMLElement>('thead th');
    expect(headers[0]!.style.textAlign).toBe('left');
    expect(headers[1]!.style.textAlign).toBe('right');
  });

  it('does not leak a table\'s {table-col-widths} attribute line as a paragraph', () => {
    const root = renderBlocks('| A |\n|---|\n| 1 |\n\n{table-col-widths="200"}\n\nafter');

    expect([...root.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['after']);
  });

  it('maps horizontal rules, including labeled variants, to separators', () => {
    const root = renderBlocks('before\n\n---\n\nafter');
    expect(root.querySelector('[role="separator"]')).toHaveAttribute('data-variant', 'plain');

    const labeled = renderBlocks('before\n\n--- Part Two ---\n\nafter');
    expect(labeled.querySelector('[role="separator"] .markdown-blocks__rule-label')?.textContent).toBe('Part Two');
  });

  it('renders inline formatting through the shared inline renderer', () => {
    const root = renderBlocks('plain **bold** *it* ~~gone~~ ==hi== `code` #tag @2026-01-02');

    const p = root.querySelector('p')!;
    expect(p.querySelector('strong')?.textContent).toBe('bold');
    expect(p.querySelector('em')?.textContent).toBe('it');
    expect(p.querySelector('s')?.textContent).toBe('gone');
    expect(p.querySelector('mark')?.textContent).toBe('hi');
    expect(p.querySelector('code')?.textContent).toBe('code');
    expect(p.querySelector('.compact-markdown-tag')).toBeInTheDocument();
    expect(p.querySelector('.compact-markdown-date')).toBeInTheDocument();
  });

  it('omits constructs it does not support rather than exposing their source', () => {
    const root = renderBlocks('<div>raw html</div>\n\nkept');

    expect(root.textContent).toBe('kept');
  });

  it('renders an empty document as nothing', () => {
    expect(renderBlocks('').childElementCount).toBe(0);
  });

  it('is deterministic — the same input renders identical markup', () => {
    const md = '# T\n\n- a\n  - b\n\n| A |\n|---|\n| 1 |';

    expect(renderBlocks(md).innerHTML).toBe(renderBlocks(md).innerHTML);
  });
});

describe('renderMarkdownBlocks — soft line breaks', () => {
  const lineTexts = (root: HTMLElement) =>
    [...root.querySelectorAll('.markdown-blocks__line')].map((l) => l.textContent);

  it('renders each source line of a paragraph as its own line, like the note', () => {
    const root = renderBlocks('Line one\nLine two\nLine three');

    expect(root.querySelectorAll('p')).toHaveLength(1);
    expect(lineTexts(root)).toEqual(['Line one', 'Line two', 'Line three']);
  });

  it('keeps inline formatting inside the line it belongs to', () => {
    const root = renderBlocks('plain **bold** here\nsecond *line*');

    const lines = root.querySelectorAll('.markdown-blocks__line');
    expect(lines[0]!.querySelector('strong')?.textContent).toBe('bold');
    expect(lines[1]!.querySelector('em')?.textContent).toBe('line');
  });

  it('adds no line wrappers to a single-line paragraph', () => {
    expect(renderBlocks('just one line').querySelector('.markdown-blocks__line')).toBeNull();
  });

  it('adds no spacer or margin elements of its own — spacing is the preview stylesheet\'s', () => {
    const root = renderBlocks('# H\n\npara\n\n\nlast\n\n- a\n\n- b');

    expect(root.querySelector('.markdown-blocks__gap')).toBeNull();
    expect(root.querySelector('[style*="margin"]')).toBeNull();
  });
});

describe('renderMarkdownBlocks — safety', () => {
  it('never emits anchors or focusable/interactive elements for links of any kind', () => {
    const root = renderBlocks('[md](https://example.com) <https://auto.example> https://bare.example [[Wiki Page]] #tag');

    expect(root.querySelector('a')).toBeNull();
    expect(root.querySelector('[href]')).toBeNull();
    expect(root.querySelector('[tabindex]')).toBeNull();
    expect(root.querySelector('button, input, [role="link"]')).toBeNull();
    expect(root.querySelector('.compact-markdown-link')).toBeInTheDocument();
    expect(root.querySelector('.compact-markdown-wikilink')).toBeInTheDocument();
  });

  it('does not render frontmatter when given the body the vault parser produces', () => {
    const file = '---\ntitle: Secret Title\ntags:\n  - alpha\ncover: Assets/x.png\n---\n# Real heading\n\nbody';
    const { body } = new FrontmatterParser().parse(file);

    const root = renderBlocks(body);

    expect(root.textContent).toBe('Real headingbody');
    expect(root.textContent).not.toContain('Secret Title');
    expect(root.textContent).not.toContain('cover');
  });
});

describe('renderMarkdownBlocks — images and resolvers', () => {
  it('renders no <img> without an image resolver (compact behavior preserved: alt text only)', () => {
    const root = renderBlocks('![alt text](pic.png) ![[hero.png]]');

    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('alt text');
  });

  it('resolves an embedded image through the injected embed-image resolver', () => {
    const resolveEmbedImage = vi.fn(() => ({
      status: 'image' as const,
      url: 'app://vault/hero.png',
      copyUrl: 'hero.png',
      alt: 'hero',
    }));

    const root = renderBlocks('![[hero.png]]', { resolveEmbedImage });

    expect(resolveEmbedImage).toHaveBeenCalledWith('hero.png', null);
    const img = root.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('app://vault/hero.png');
    expect(img.getAttribute('alt')).toBe('hero');
  });

  it('shows the alt placeholder (not a page-embed lookup, not a broken <img>) for an unresolved image embed', () => {
    const resolveEmbedImage = vi.fn(() => ({ status: 'unresolved' as const, alt: 'missing' }));
    const resolveEmbed = vi.fn();

    const root = renderBlocks('![[missing.png]]', { resolveEmbedImage, resolveEmbed });

    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('.compact-markdown-image-missing')?.textContent).toBe('missing');
    expect(resolveEmbed).not.toHaveBeenCalled();
  });

  it('does not treat a note embed (no image extension) as an image', () => {
    const resolveEmbedImage = vi.fn();
    const resolveEmbed = vi.fn(() => ({ status: 'unresolved' as const, displayLabel: 'Some Note' }));

    const root = renderBlocks('![[Some Note]]', { resolveEmbedImage, resolveEmbed });

    expect(resolveEmbedImage).not.toHaveBeenCalled();
    expect(root.textContent).toBe('Some Note');
  });

  it('resolves a standard Markdown image through the injected src resolver, passing external URLs through', () => {
    const resolveImageSrc = vi.fn((path: string) =>
      path === 'Assets/a.png'
        ? { status: 'resolved' as const, url: 'app://vault/Assets/a.png', copyUrl: path }
        : { status: 'unresolved' as const }
    );

    const root = renderBlocks('![local](Assets/a.png)\n\n![remote](https://cdn.example/b.png)', { resolveImageSrc });

    const srcs = [...root.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs).toEqual(['app://vault/Assets/a.png', 'https://cdn.example/b.png']);
  });

  it('routes WikiLink and Tag display through the injected resolvers', () => {
    const resolveWikiLink = vi.fn(() => ({ status: 'resolved' as const, displayLabel: 'Resolved Title' }));
    const resolveTag = vi.fn(() => ({ status: 'resolved' as const, displayLabel: 'Real Tag' }));

    const root = renderBlocks('[[raw-target]] #raw', {
      resolveWikiLink: resolveWikiLink as never,
      resolveTag: resolveTag as never,
    });

    expect(root.querySelector('.compact-markdown-wikilink')?.textContent).toBe('Resolved Title');
    expect(root.querySelector('.compact-markdown-tag')?.textContent).toContain('Real Tag');
  });
});
