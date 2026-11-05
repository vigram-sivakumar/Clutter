// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderMarkdownBlocks } from './renderMarkdownBlocks';
import { extractPreviewBlocks } from './extractPreviewBlocks';

afterEach(() => {
  cleanup();
});

function renderBlocks(markdown: string): HTMLElement {
  return render(<div>{renderMarkdownBlocks(markdown, {})}</div>).container.firstElementChild as HTMLElement;
}

describe('renderMarkdownBlocks — Clutter native quotes', () => {
  it('renders `" text` as the same <blockquote> a `>` quote gets, with no marker text', () => {
    const native = renderBlocks('" quoted line');
    const standard = renderBlocks('> quoted line');

    expect(native.querySelector('blockquote.markdown-blocks__quote')?.textContent).toBe('quoted line');
    expect(native.innerHTML).toBe(standard.innerHTML);
    expect(native.textContent).not.toContain('"');
  });

  it('keeps several marked lines in one blockquote', () => {
    const root = renderBlocks('" one\n" two\n" three');
    expect(root.querySelectorAll('blockquote')).toHaveLength(1);
    expect(root.textContent).not.toContain('"');
    expect(root.textContent).toContain('one');
    expect(root.textContent).toContain('three');
  });

  it('nests `" "` as a blockquote inside a blockquote', () => {
    const root = renderBlocks('" outer\n" " inner');
    expect(root.querySelector('blockquote blockquote')?.textContent).toContain('inner');
  });

  it('ends the quote at an unmarked line instead of absorbing it', () => {
    const native = renderBlocks('" quoted\nplain');
    expect(native.querySelector('blockquote')?.textContent).toBe('quoted');
    expect(native.querySelector(':scope > p')?.textContent).toBe('plain');

    // A `>` quote still continues lazily, unchanged.
    const standard = renderBlocks('> quoted\nplain');
    expect(standard.querySelectorAll('blockquote')).toHaveLength(1);
    expect(standard.querySelector('blockquote')?.textContent).toContain('plain');
  });

  it('leaves text that merely starts with a quotation mark as a paragraph', () => {
    const root = renderBlocks('"Hello" she said');
    expect(root.querySelector('blockquote')).toBeNull();
    expect(root.querySelector('p')?.textContent).toBe('"Hello" she said');
  });

  it('is a quote block in the compact preview too', () => {
    const names = extractPreviewBlocks('intro\n\n" a quote\n\nafter').blocks.map((block) => block.name);
    expect(names).toEqual(['Paragraph', 'ClutterQuote', 'Paragraph']);
  });
});
