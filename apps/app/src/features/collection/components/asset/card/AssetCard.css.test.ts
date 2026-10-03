import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * AssetCard.css styles only the asset's media; card geometry and the title
 * section belong to the shared card system. jsdom has no cascade, so these
 * check the stylesheet itself: nothing in it may restyle the shared shell.
 */
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'AssetCard.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  ''
);
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selectors: selector!.split(',').map((part) => part.trim()),
  body: body!,
}));

describe('AssetCard.css', () => {
  it('only ever targets asset-card parts — every selector is rooted at .asset-card__', () => {
    const selectors = rules.flatMap((rule) => rule.selectors);

    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector, selector).toMatch(/^\.asset-card__/);
    }
  });

  it('does not override the shared card surface, border or padding', () => {
    expect(css).not.toMatch(/\.collection-card/);
    expect(css).not.toMatch(/\.asset-card\s*[{,:.]/);
  });
});
