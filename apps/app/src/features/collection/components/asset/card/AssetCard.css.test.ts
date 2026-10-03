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

  it('sets a metadata line\'s label apart from its value (space-between, the value truncating)', () => {
    const rule = (selector: string) =>
      rules.find((candidate) => candidate.selectors.includes(selector))?.body ?? '';

    expect(rule('.asset-card__meta')).toMatch(/justify-content:\s*space-between/);
    expect(rule('.asset-card__meta-label')).toMatch(/flex:\s*none/);
    expect(rule('.asset-card__meta-value')).toMatch(/text-overflow:\s*ellipsis/);
  });

  it('fades the scrim with an eased, monotonic ramp that starts solid and ends at nothing', () => {
    const header = rules.find((candidate) => candidate.selectors.includes('.asset-card__header'))!.body;
    const gradient = header.match(/linear-gradient\([^;]*\)/)![0];
    const alphas = [...gradient.matchAll(/rgb\(0 0 0 \/ ([\d.]+)\)/g)].map(([, alpha]) => Number(alpha));

    // Many stops (a straight 2-3 point ramp shows a hard edge where it ends), strictly easing out.
    expect(alphas.length).toBeGreaterThanOrEqual(8);
    expect(alphas[0]).toBeGreaterThan(0.5);
    expect(alphas[alphas.length - 1]).toBe(0);
    for (let i = 1; i < alphas.length; i += 1) {
      expect(alphas[i]!, `stop ${i}`).toBeLessThan(alphas[i - 1]!);
    }
    // Eased: the first and last steps are the smallest (no abrupt start or end).
    const steps = alphas.slice(1).map((alpha, i) => alphas[i]! - alpha);
    const middle = Math.max(...steps);
    expect(steps[0]!).toBeLessThan(middle);
    expect(steps[steps.length - 1]!).toBeLessThan(middle);
  });
});
