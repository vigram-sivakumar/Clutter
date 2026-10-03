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

  it('lays the title section over a media area that fills the whole card, on a dark gradient', () => {
    const rule = (selector: string) =>
      rules.find((candidate) => candidate.selectors.includes(selector))?.body ?? '';

    expect(rule('.asset-card__media')).toMatch(/position:\s*absolute/);
    expect(rule('.asset-card__media')).toMatch(/inset:\s*0/);
    expect(rule('.asset-card__header')).toMatch(/position:\s*absolute/);
    expect(rule('.asset-card__header')).toMatch(/bottom:\s*0/);
    expect(rule('.asset-card__header')).toMatch(/linear-gradient\(\s*to top/);
  });
});
