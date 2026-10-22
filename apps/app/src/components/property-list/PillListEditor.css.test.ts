import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// CSS-source only (jsdom computes no layout), the same convention Section.Header.css.test.ts uses.
describe('PillListEditor.css — the focused look follows an input, not a pill', () => {
  const css = readFileSync(join(__dirname, 'PillListEditor.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('has no bare :focus-within rule: a focused pill (one that only opens its tag) would light the field up', () => {
    expect(css).not.toMatch(/:focus-within/);
  });

  it('shows the focused surface when an input or textarea inside has focus', () => {
    expect(css).toMatch(/\.pill-list-editor:has\(:is\(input, textarea\):focus\)\s*\{[^}]*background/);
  });

  it('keeps collapsing the idle inline input when no input has focus', () => {
    expect(css).toMatch(/\.pill-list-editor:not\(:has\(:is\(input, textarea\):focus\)\):has\(\.pill\)/);
  });
});
