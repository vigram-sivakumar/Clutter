// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_PREVIEW_LIMITS, extractPreviewBlocks, type PreviewLimits } from './extractPreviewBlocks';
import { renderMarkdownBlocks } from './renderMarkdownBlocks';
import { sharedMarkdownParser } from './sharedMarkdownParser';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Effectively unbounded unless a test overrides the limit it is about. */
const limits = (overrides: Partial<PreviewLimits> = {}): PreviewLimits => ({
  maxChars: 1_000_000,
  maxLines: 1_000_000,
  maxBlocks: 1_000_000,
  minFillChars: 0,
  ...overrides,
});

const paragraphs = (count: number, chars = 44) =>
  Array.from({ length: count }, (_, i) => `P${i} ${'x'.repeat(Math.max(0, chars - 4 - String(i).length))}`).join('\n\n');
const list = (items: number) => Array.from({ length: items }, (_, i) => `- item ${i}`).join('\n');
const code = (lines: number) => '```ts\n' + Array.from({ length: lines }, (_, i) => `const a${i} = ${i};`).join('\n') + '\n```';
const table = (rows: number) =>
  '| A | B |\n|---|---|\n' + Array.from({ length: rows }, (_, i) => `| ${i} | y |`).join('\n');

const names = (markdown: string, l: PreviewLimits = DEFAULT_PREVIEW_LIMITS) =>
  extractPreviewBlocks(markdown, l).blocks.map((b) => b.name);

describe('extractPreviewBlocks — the note shapes a collection contains', () => {
  it('empty body: no blocks, not truncated', () => {
    expect(extractPreviewBlocks('')).toMatchObject({ blocks: [], truncated: false, text: '' });
    expect(extractPreviewBlocks('\n\n  \n').blocks).toEqual([]);
  });

  it('very short note: returned whole', () => {
    const result = extractPreviewBlocks('just a line');
    expect(result).toMatchObject({ text: 'just a line', truncated: false });
    expect(names('just a line')).toEqual(['Paragraph']);
  });

  it('normal note (within every limit): whole, untruncated, nothing dropped', () => {
    const md = '# Title\n\nintro paragraph\n\n- a\n- b\n\n> quote\n\n```ts\ncode\n```\n\n| A |\n|---|\n| 1 |';
    const result = extractPreviewBlocks(md);

    expect(result.truncated).toBe(false);
    expect(result.text).toBe(md);
    expect(names(md)).toEqual(['ATXHeading1', 'Paragraph', 'BulletList', 'Blockquote', 'FencedCode', 'Table']);
  });

  it('very long note: bounded text, bounded blocks, complete blocks only', () => {
    const md = paragraphs(20_000);
    const result = extractPreviewBlocks(md);

    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(DEFAULT_PREVIEW_LIMITS.maxChars);
    expect(result.blocks.length).toBeLessThanOrEqual(DEFAULT_PREVIEW_LIMITS.maxBlocks);
    for (const b of result.blocks) {
      expect(result.text.slice(b.from, b.to)).toMatch(/^P\d+ x+$/);
    }
  });

  it('one extremely long paragraph: bounded to the budget and kept (shortened), not dropped to nothing', () => {
    const result = extractPreviewBlocks('word '.repeat(300_000));

    expect(result.text.length).toBeLessThanOrEqual(DEFAULT_PREVIEW_LIMITS.maxChars);
    expect(result.blocks.map((b) => b.name)).toEqual(['Paragraph']);
  });

  it('long list: bounded by source lines, so the card never gets hundreds of list items', () => {
    const result = extractPreviewBlocks(list(5000));
    const items = result.blocks[0]!.getChildren('ListItem');

    expect(result.blocks.map((b) => b.name)).toEqual(['BulletList']);
    expect(items.length).toBeLessThanOrEqual(DEFAULT_PREVIEW_LIMITS.maxLines);
  });

  it('long code block: bounded, kept as one well-formed FencedCode', () => {
    const result = extractPreviewBlocks(code(50_000));

    expect(result.text.length).toBeLessThanOrEqual(DEFAULT_PREVIEW_LIMITS.maxChars);
    expect(result.blocks.map((b) => b.name)).toEqual(['FencedCode']);
  });

  it('table: bounded by source lines, so a 5,000-row table renders a bounded number of rows', () => {
    const result = extractPreviewBlocks(table(5000));
    const rows = result.blocks[0]!.getChildren('TableRow');

    expect(result.blocks.map((b) => b.name)).toEqual(['Table']);
    expect(rows.length).toBeLessThanOrEqual(DEFAULT_PREVIEW_LIMITS.maxLines);
  });
});

describe('extractPreviewBlocks — the block at the extraction boundary', () => {
  it('keeps a complete block that ends right before the cut (does not drop it just for being last)', () => {
    // Three 900-char paragraphs fit under maxChars (3000); the fourth starts past it.
    const md = [900, 900, 900, 900].map((n, i) => `P${i}${'x'.repeat(n)}`).join('\n\n');
    const result = extractPreviewBlocks(md);

    expect(result.truncated).toBe(true);
    expect(result.blocks).toHaveLength(3);
  });

  it('drops an incomplete last block when the card is already full, so the preview ends on a whole block', () => {
    const md = paragraphs(10, 100);
    const result = extractPreviewBlocks(md, limits({ maxChars: 520, minFillChars: 300 }));

    const last = result.blocks[result.blocks.length - 1]!;
    expect(result.text.slice(last.from, last.to)).toMatch(/^P\d+ x+$/);
    expect(last.to).toBeLessThanOrEqual(520);
  });

  it('does NOT drop a big incomplete block when little is kept before it — a short intro then a huge code block keeps the code', () => {
    const md = `intro\n\n${code(5000)}\n\nafter`;
    const result = extractPreviewBlocks(md);

    expect(result.blocks.map((b) => b.name)).toEqual(['Paragraph', 'FencedCode']);
  });

  it('does NOT drop a big incomplete table when little is kept before it', () => {
    const md = `intro\n\n${table(5000)}\n\nafter`;

    expect(names(md)).toEqual(['Paragraph', 'Table']);
  });

  it('does NOT drop a huge incomplete paragraph after a short heading', () => {
    const md = `# T\n\n${'word '.repeat(5000)}\n\ntail`;

    expect(names(md)).toEqual(['ATXHeading1', 'Paragraph']);
  });

  it('a card that is already full still ends on a whole block rather than a sliver (dropped, not shortened)', () => {
    // 2,400 chars of whole paragraphs, then a huge paragraph the cut lands in.
    const md = `${paragraphs(6, 400)}\n\n${'word '.repeat(5000)}`;
    const result = extractPreviewBlocks(md);

    expect(result.blocks).toHaveLength(6);
    expect(result.blocks.every((b) => result.text.slice(b.from, b.to).startsWith('P'))).toBe(true);
  });

  it('never leaves the card mostly empty: kept content is at least minFillChars whenever the note has that much', () => {
    const shapes = [
      `intro\n\n${code(5000)}`,
      `intro\n\n${table(5000)}`,
      `# T\n\n${'word '.repeat(5000)}`,
      `${paragraphs(6, 400)}\n\n${'word '.repeat(5000)}`,
      `${list(40)}\n\n${code(5000)}`,
    ];

    for (const md of shapes) {
      const result = extractPreviewBlocks(md);
      const keptEnd = result.blocks[result.blocks.length - 1]!.to;
      // Enough kept to fill the card: either the fill threshold, or (line-capped shapes) the line budget.
      const keptLines = result.text.slice(0, keptEnd).split('\n').length;
      expect(keptEnd >= DEFAULT_PREVIEW_LIMITS.minFillChars || keptLines >= 25 || keptEnd >= md.length * 0.9).toBe(true);
    }
  });
});

describe('extractPreviewBlocks — limits and parsing cost', () => {
  it('each limit is configurable independently', () => {
    expect(extractPreviewBlocks(paragraphs(50), limits({ maxBlocks: 3 })).blocks).toHaveLength(3);
    expect(extractPreviewBlocks(paragraphs(50), limits({ maxChars: 200 })).text.length).toBeLessThanOrEqual(200);
    expect(extractPreviewBlocks(list(100), limits({ maxLines: 10 })).text.split('\n').length).toBeLessThanOrEqual(11);
  });

  it('cuts at a line break, not mid-line, when that keeps enough content', () => {
    const md = `${'a'.repeat(50)}\n${'b'.repeat(50)}\n${'c'.repeat(50)}`;

    expect(extractPreviewBlocks(md, limits({ maxChars: 120 })).text.endsWith('b'.repeat(50))).toBe(true);
  });

  it('hard-cuts at the budget instead when the only line break behind it would discard the content', () => {
    const md = `# T\n\n${'word '.repeat(5000)}`;
    const result = extractPreviewBlocks(md, limits({ maxChars: 500, minFillChars: 200 }));

    expect(result.text.length).toBe(500);
  });

  it('never splits a surrogate pair at a hard cut', () => {
    const md = '😀'.repeat(2000);
    const result = extractPreviewBlocks(md, limits({ maxChars: 501, minFillChars: 200 }));

    expect(result.text).not.toMatch(/[\ud800-\udbff]$/);
  });

  it('returns a prefix of the input, so block offsets match the original document', () => {
    const md = paragraphs(500);
    const result = extractPreviewBlocks(md);

    expect(md.startsWith(result.text)).toBe(true);
  });

  it('parses only the bounded text with the shared parser, exactly once, never the whole document', () => {
    const parse = vi.spyOn(sharedMarkdownParser, 'parse');
    extractPreviewBlocks(paragraphs(20_000));

    expect(parse).toHaveBeenCalledTimes(1);
    expect((parse.mock.calls[0]![0] as string).length).toBeLessThanOrEqual(DEFAULT_PREVIEW_LIMITS.maxChars);
  });

  it('extraction time does not grow with the note: a 5MB note costs about the same as a 50KB one', () => {
    const small = paragraphs(1000);
    const huge = paragraphs(100_000);
    const time = (md: string) => {
      const start = performance.now();
      for (let i = 0; i < 20; i += 1) extractPreviewBlocks(md);
      return performance.now() - start;
    };
    time(small); // warm up
    const smallMs = time(small);
    const hugeMs = time(huge);

    expect(hugeMs).toBeLessThan(Math.max(smallMs * 10, 50));
  });
});

describe('renderMarkdownBlocks — bounded rendering', () => {
  const renderBounded = (md: string, l?: PreviewLimits) =>
    render(<div>{renderMarkdownBlocks(md, {}, l)}</div>).container;

  it('renders only the extracted blocks — the remainder of a long note never reaches the DOM', () => {
    const container = renderBounded(paragraphs(5000), limits({ maxBlocks: 6 }));

    expect(container.querySelectorAll('p')).toHaveLength(6);
    expect(container.textContent).toContain('P5 ');
    expect(container.textContent).not.toContain('P6 ');
    expect(container.textContent).not.toContain('P4999');
  });

  it('keeps the DOM flat as the note grows, for every shape (long ≈ medium)', () => {
    for (const shape of [paragraphs, list, code, table]) {
      const medium = renderBounded(shape(300)).querySelectorAll('*').length;
      const huge = renderBounded(shape(30_000)).querySelectorAll('*').length;
      expect(huge).toBeLessThanOrEqual(medium);
    }
  });

  it('bounds list and table DOM by lines (a 5,000-item list and a 5,000-row table render ≤ maxLines rows)', () => {
    expect(renderBounded(list(5000)).querySelectorAll('li').length).toBeLessThanOrEqual(DEFAULT_PREVIEW_LIMITS.maxLines);
    expect(renderBounded(table(5000)).querySelectorAll('tbody tr').length).toBeLessThanOrEqual(DEFAULT_PREVIEW_LIMITS.maxLines);
  });

  it('empty-body note renders nothing', () => {
    expect(renderBounded('').firstElementChild!.childElementCount).toBe(0);
  });

  it('renders a short note exactly as it would without any bound', () => {
    const md = '# T\n\n- a\n  - b\n\n> q';

    expect(renderBounded(md).innerHTML).toBe(
      renderBounded(md, limits({ maxChars: Number.MAX_SAFE_INTEGER })).innerHTML
    );
  });
});
