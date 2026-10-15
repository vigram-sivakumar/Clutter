import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Stylesheets are not loaded in jsdom, so the rule is read from source (as Folder.css.test.ts does).
const css = readFileSync(resolve(process.cwd(), 'src/components/drag-ghost/DragGhost.css'), 'utf-8');

describe('DragGhost.css — no borders on the picture', () => {
  it('clears border colours, outlines and shadows on everything inside the ghost, keeping layout', () => {
    const rule = css.match(/\.drag-ghost > \*,\s*\.drag-ghost > \* \* \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/border-color:\s*transparent\s*!important/);
    expect(rule).toMatch(/outline:\s*none\s*!important/);
    expect(rule).toMatch(/box-shadow:\s*none\s*!important/);
    expect(rule).not.toMatch(/border:\s*none/); // transparent, not removed: the clone's size must not change
  });

  it('has one background: the ghost\'s own, with the clone\'s own surface made transparent (no second layer)', () => {
    const clone = css.match(/\.drag-ghost > \* \{([^}]*)\}/)?.[1] ?? '';
    expect(clone).toMatch(/background-color:\s*transparent\s*!important/);
    const own = css.match(/\.drag-ghost \{([^}]*)\}/)?.[1] ?? '';
    expect(own).toMatch(/background:\s*color-mix\(/); // the one fill that stays
  });

  it('leaves the ghost\'s own elevation on `.drag-ghost` itself', () => {
    const own = css.match(/\.drag-ghost \{([^}]*)\}/)?.[1] ?? '';
    expect(own).toMatch(/box-shadow:\s*var\(--shadow-md\)/);
  });

  it('hides a table row\'s divider (a pseudo-element background the border rule cannot reach)', () => {
    const rule = css.match(/\.drag-ghost \.collection-table-row::after \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/display:\s*none/);
  });
});
