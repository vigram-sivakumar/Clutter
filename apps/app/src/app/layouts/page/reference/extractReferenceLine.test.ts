import { describe, expect, it } from 'vitest';

import {
  extractReferenceLine,
  MAX_REFERENCE_LINE_CHARS,
} from './extractReferenceLine';

const around = (markdown: string, marker = '[[T]]') =>
  extractReferenceLine(markdown, markdown.indexOf(marker));

describe('extractReferenceLine', () => {
  it('is only the referencing line, even between adjacent non-empty lines', () => {
    const markdown = 'Above\nThis has a [[T]] link\nBelow';

    expect(around(markdown).text).toBe('This has a [[T]] link');
  });

  it('identifies the line by its start, the same for every position on it', () => {
    const markdown = 'one\ntwo [[T]] and [[T]]\nthree';
    const start = markdown.indexOf('two');

    expect(around(markdown).from).toBe(start);
    expect(extractReferenceLine(markdown, markdown.lastIndexOf('[[T]]')).from).toBe(start);
    expect(around('[[T]]').from).toBe(0);
  });

  it('keeps inline formatting and a block marker, dropping only the indentation', () => {
    expect(around('plain **bold** and [[T]] `code`').text).toBe('plain **bold** and [[T]] `code`');
    expect(around('- top\n  - nested [[T]]\n    - child').text).toBe('- nested [[T]]');
    expect(around('> quoted [[T]]\n> more').text).toBe('> quoted [[T]]');
    expect(around('intro\n## Heading [[T]]').text).toBe('## Heading [[T]]');
    expect(around('1. first\n2. second [[T]]').text).toBe('2. second [[T]]');
  });

  it('never makes an indented continuation line a code block', () => {
    expect(around('- item\n        deep [[T]]').text).toBe('deep [[T]]');
  });

  it('has no text for a line that holds an embed, so no embedded content is rendered', () => {
    expect(around('see ![[T]] here', '![[T]]').text).toBeNull();
    expect(around('[[T]] and ![[Other]]').text).toBeNull();
    expect(around('![[T]]', '![[T]]').from).toBe(0);
  });

  it('has no text for a line over the work limit', () => {
    expect(around(`${'x'.repeat(MAX_REFERENCE_LINE_CHARS)} [[T]]`).text).toBeNull();
  });

  it('copes with a position past the end or an empty document', () => {
    expect(extractReferenceLine('# Title\n\ntext', 9999).text).toBe('text');
    expect(extractReferenceLine('', 0)).toEqual({ from: 0, text: null });
  });
});
