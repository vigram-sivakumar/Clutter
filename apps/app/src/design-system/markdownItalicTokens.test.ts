import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// CSS-source only (jsdom computes no layout), the same convention utilities.test.ts uses.
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const read = (...parts: string[]) => strip(readFileSync(join(__dirname, '..', ...parts), 'utf8'));

describe('Markdown italic font tokens', () => {
  const tokens = read('design-system', 'tokens.css');

  it('declares the family, a size scale and the smoothing', () => {
    expect(tokens).toMatch(/--font-italic\s*:\s*'EB Garamond'\s*,\s*var\(--font-sans\)\s*;/);
    expect(tokens).toMatch(/--font-italic-scale\s*:\s*\d+(\.\d+)?\s*;/);
    expect(tokens).toMatch(/--font-italic-smoothing\s*:\s*(auto|antialiased)\s*;/);
    expect(tokens).toMatch(/--font-italic-weight\s*:\s*var\(--fw-medium\)\s*;/);
  });

  it('neutralises both while the setting is off: normal family, no scale', () => {
    const off = tokens.match(/:root\[data-markdown-italic-font='off'\]\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(off).toMatch(/--font-italic\s*:\s*var\(--font-sans\)\s*;/);
    expect(off).toMatch(/--font-italic-scale\s*:\s*1\s*;/);
    expect(off).toMatch(/--font-italic-smoothing\s*:\s*antialiased\s*;/);
  });

  it.each([
    ['the editor', ['features', 'markdown', 'editor', 'MarkdownEditor.css'], /\.cm-editor \.tok-emphasis\s*\{([^}]*)\}/],
    ['the note preview', ['features', 'collection', 'components', 'note', 'preview', 'NotePageCanvas.css'], /\.note-page-canvas em\s*\{([^}]*)\}/],
  ])('%s italic rule uses the tokens and stays italic', (_name, path, selector) => {
    const rule = read(...path).match(selector)?.[1] ?? '';
    expect(rule).toMatch(/font-family\s*:\s*var\(--font-italic\)/);
    expect(rule).toMatch(/font-size\s*:\s*calc\(1em \* var\(--font-italic-scale\)\)/);
    expect(rule).toMatch(/font-style\s*:\s*italic/);
  });
});
