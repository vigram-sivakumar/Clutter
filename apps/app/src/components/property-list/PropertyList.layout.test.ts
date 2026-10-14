import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Layout is not computed in jsdom, so the constraints that keep property rows aligned and pills inside
 * their value cell are asserted against the source (the same approach as Reference.test.tsx). Their
 * behavior was verified at several widths in a browser.
 */
const read = (file: string) =>
  readFileSync(join(__dirname, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the first rule whose selector list contains `selector` exactly. */
function declarations(css: string, selector: string): string {
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
    ([, selectors]) =>
      selectors!.split(',').some((candidate) => candidate.trim() === selector)
  );

  expect(rule, `no rule for ${selector}`).toBeDefined();
  return rule![2]!;
}

describe('property name column', () => {
  const name = declarations(read('PropertyList.css'), '.property-list__name');

  it('is one fixed-size column for every row — it does not flex', () => {
    expect(name).toMatch(/flex:\s*none/);
    expect(name).toMatch(
      /width:\s*min\(200px,\s*calc\(50% - var\(--space-12\) \/ 2\)\)/
    );
  });
});

describe('pills', () => {
  const pillCss = read('Pill.css');

  it('never exceed their line: they may shrink and are capped at their container', () => {
    const pill = declarations(pillCss, '.pill');

    expect(pill).toMatch(/flex-shrink:\s*1/);
    expect(pill).toMatch(/max-width:\s*100%/);
  });

  it('truncate their text with an ellipsis', () => {
    const label = declarations(pillCss, '.pill__label');

    expect(label).toMatch(/display:\s*block/);
    expect(label).toMatch(/min-width:\s*0/);
    expect(label).toMatch(/overflow:\s*hidden/);
    expect(label).toMatch(/text-overflow:\s*ellipsis/);
    expect(label).toMatch(/white-space:\s*nowrap/);
  });

  it('keep the # and the name on one line', () => {
    expect(declarations(pillCss, '.pill__prefix')).toMatch(
      /white-space:\s*nowrap/
    );
  });

  it('a read-only list is capped at its cell, so a long pill wraps instead of widening it', () => {
    expect(declarations(pillCss, '.pill-list')).toMatch(/max-width:\s*100%/);
  });
});
