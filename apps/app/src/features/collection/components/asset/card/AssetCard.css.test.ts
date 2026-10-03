import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * AssetCard.css restyles the shared card shell for assets (no surface, border
 * or padding; the asset has the border). jsdom has no cascade to assert that
 * against, so these check the stylesheet itself — chiefly that it is scoped to
 * asset cards and so can never change how a note card looks.
 */
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'AssetCard.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  ''
);
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selectors: selector!.split(',').map((part) => part.trim()),
  body: body!,
}));
const ruleFor = (selector: string) => rules.find((rule) => rule.selectors.includes(selector))?.body ?? '';

describe('AssetCard.css', () => {
  it('only ever targets asset cards — every selector is rooted at .asset-card', () => {
    const selectors = rules.flatMap((rule) => rule.selectors);

    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector, selector).toMatch(/(^|\s)(\.collection-card)?\.asset-card/);
    }
  });

  it('removes the shared card surface, border and padding for asset cards only', () => {
    const body = ruleFor('.collection-card.asset-card');

    expect(body).toMatch(/background:\s*none/);
    expect(body).toMatch(/border:\s*none/);
    expect(body).toMatch(/padding:\s*0/);
  });

  it('keeps hover and selected from bringing a background back', () => {
    const body = ruleFor('.collection-card.asset-card:hover');

    expect(body).toMatch(/background:\s*none/);
    const selected = rules.find((rule) => rule.selectors.includes('.collection-card.asset-card.collection-card--selected'));
    expect(selected?.body).toMatch(/background:\s*none/);
  });

  it('puts the border on the asset (the preview) itself, flush with the card edges', () => {
    const body = ruleFor('.asset-card__preview');

    expect(body).toMatch(/border:\s*1px solid var\(--border-default\)/);
    expect(body).toMatch(/margin-inline:\s*0/);
  });
});
