import { describe, expect, it } from 'vitest';

import { extractReferenceBlock, MAX_REFERENCE_BLOCK_CHARS, MAX_REFERENCE_BLOCK_LINES } from './extractReferenceBlock';

/** The block around the first occurrence of `marker` in `markdown`. */
const around = (markdown: string, marker = '[[T]]') => extractReferenceBlock(markdown, markdown.indexOf(marker));

describe('extractReferenceBlock', () => {
  it('returns the whole paragraph, with its inline formatting and line breaks, not one line', () => {
    const paragraph = 'First line with **bold**.\nSecond line links [[T]] and has `code`.\nThird line.';

    expect(around(`Before.\n\n${paragraph}\n\nAfter.`)).toBe(paragraph);
  });

  it('returns a heading on its own', () => {
    expect(around('Intro\n\n## Heading with [[T]]\n\nBody text')).toBe('## Heading with [[T]]');
  });

  it('returns the innermost list item with its sub-items, dedented', () => {
    const markdown = '- top\n  - nested with [[T]]\n    - deeper child\n  - sibling\n- other';

    expect(around(markdown)).toBe('- nested with [[T]]\n  - deeper child');
  });

  it('keeps a task marker and an ordered-list number, so the item parses as itself', () => {
    expect(around('1. one\n2. two [[T]]\n3. three')).toBe('2. two [[T]]');
    expect(around('- [x] done [[T]] @2026-10-20\n- [ ] open')).toBe('- [x] done [[T]] @2026-10-20');
  });

  it('returns the whole blockquote, quote markers included', () => {
    const quote = '> Quoted line one\n> quoted [[T]] line two';

    expect(around(`Intro\n\n${quote}\n\nOutro`)).toBe(quote);
  });

  it('returns a whole fenced code block, and a whole table', () => {
    const fence = '```ts\nconst a = "[[T]]";\nconst b = 2;\n```';
    const table = '| a | b |\n| - | - |\n| [[T]] | 2 |';

    expect(around(`x\n\n${fence}\n\ny`)).toBe(fence);
    expect(around(`x\n\n${table}\n\ny`)).toBe(table);
  });

  it('picks the right block when several share a document', () => {
    expect(around('One [[A]].\n\nTwo [[T]].\n\nThree [[B]].')).toBe('Two [[T]].');
  });

  it('is a verbatim slice: an embed stays exactly as written', () => {
    expect(around('Look at ![[T]] here.', '![[T]]')).toBe('Look at ![[T]] here.');
  });

  it('declines a block that is too long, so the caller can fall back', () => {
    const tall = Array.from({ length: MAX_REFERENCE_BLOCK_LINES + 1 }, (_, i) => `line ${i}`).join('\n');
    const wide = `${'x'.repeat(MAX_REFERENCE_BLOCK_CHARS)} [[T]]`;

    expect(around(`${tall}\nwith [[T]]`)).toBeNull();
    expect(around(wide)).toBeNull();
  });

  it('declines a position that is in no liftable block', () => {
    expect(extractReferenceBlock('# Title\n\ntext', 9999)).toBeNull();
    expect(extractReferenceBlock('', 0)).toBeNull();
  });
});
