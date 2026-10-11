import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// CSS-source only (jsdom computes no layout), the same convention Entry.test.tsx uses.
describe('Section.Header.css — a long title truncates and the caret stays', () => {
  const css = readFileSync(join(__dirname, 'Section.Header.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (selector: string) =>
    css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

  it('lets the content wrapper shrink below its title so the .truncate title gets a constrained box', () => {
    expect(rule('.section-header__content')).toMatch(/min-width\s*:\s*0\s*;/);
  });

  it('never shrinks the caret', () => {
    expect(rule('.section-header__caret')).toMatch(/flex-shrink\s*:\s*0\s*;/);
  });
});
