import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// CSS-source only (jsdom computes no layout), the same convention Entry.test.tsx uses.
describe('utilities.css — .truncate', () => {
  const css = readFileSync(join(__dirname, 'utilities.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = css.match(/\.truncate\s*\{([^}]*)\}/)?.[1] ?? '';

  it('declares the single-line truncation set: min-width: 0, overflow hidden, nowrap, ellipsis', () => {
    expect(rule).toMatch(/min-width\s*:\s*0\s*;/);
    expect(rule).toMatch(/overflow\s*:\s*hidden\s*;/);
    expect(rule).toMatch(/white-space\s*:\s*nowrap\s*;/);
    expect(rule).toMatch(/text-overflow\s*:\s*ellipsis\s*;/);
  });

  it('carries no multiline or layout declarations', () => {
    expect(rule).not.toMatch(/line-clamp|display|-webkit-box|white-space\s*:\s*normal/);
  });
});

describe('utilities.css — .line-clamp-2', () => {
  const css = readFileSync(join(__dirname, 'utilities.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = css.match(/\.line-clamp-2\s*\{([^}]*)\}/)?.[1] ?? '';

  it('clamps to two lines', () => {
    expect(rule).toMatch(/-webkit-line-clamp\s*:\s*2\s*;/);
    expect(rule).toMatch(/line-clamp\s*:\s*2\s*;/);
    expect(rule).toMatch(/overflow\s*:\s*hidden\s*;/);
  });

  it('wraps: resets an inherited nowrap, since a clamp has nothing to count on a single line', () => {
    expect(rule).toMatch(/white-space\s*:\s*normal\s*;/);
  });
});
