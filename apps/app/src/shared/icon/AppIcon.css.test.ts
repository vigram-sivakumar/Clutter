import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// CSS-source only (jsdom computes no layout), the same convention the other CSS tests use.
describe('AppIcon.css — a constant 1.2px line', () => {
  const css = readFileSync(join(__dirname, 'AppIcon.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('draws every shape of an icon without its own strokeWidth in screen pixels, so the line does not scale with the size', () => {
    expect(css).toMatch(/\.app-icon--fixed-stroke svg \*\s*\{[^}]*vector-effect:\s*non-scaling-stroke/);
  });
});
