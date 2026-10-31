import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * jsdom does no layout, so these read the attribution's own stylesheet and run its flex rules (shrink factors and
 * minimum widths) through the flex shrinking algorithm for a narrow and a wider cover. Text widths are the ones
 * measured in WebKit at the caption size; the same cases were checked in the real engine when the rules were set.
 */
const css = readFileSync(join(__dirname, 'CoverAttribution.css'), 'utf8');

function declarations(selector: string): Record<string, string> {
  const block = css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  return Object.fromEntries(
    block
      .split(';')
      .map((line) => line.split(/:(.*)/s).map((part) => part.trim()))
      .filter(([name, value]) => name && value)
      .map(([name, value]) => [name, value])
  );
}

const CH = 6.94; // one "0" at the caption size
const GAP = 4;

interface Item {
  readonly basis: number;
  readonly shrink: number;
  readonly min: number;
}

function item(selector: string, textWidth: number): Item {
  const rules = declarations(selector);
  const [, shrink = '1'] = (rules['flex'] ?? '0 1 auto').split(/\s+/);
  const min = /ch$/.test(rules['min-width'] ?? '') ? parseFloat(rules['min-width']!) * CH : 0;
  return { basis: textWidth, shrink: Number(shrink), min };
}

/** The flex shrinking algorithm for one line: widths of the items in a container `available` wide. */
function layout(items: readonly Item[], available: number): number[] {
  const free = available - items.reduce((sum, i) => sum + i.basis, 0) - GAP * (items.length - 1);
  const widths = items.map((i) => i.basis);
  if (free >= 0) {
    return widths;
  }
  const frozen = items.map(() => false);
  let deficit = -free;
  for (let round = 0; round < items.length && deficit > 1e-6; round++) {
    const weights = items.map((i, n) => (frozen[n] ? 0 : i.shrink * i.basis));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total === 0) {
      break;
    }
    let violated = false;
    items.forEach((i, n) => {
      if (!frozen[n] && widths[n]! - (weights[n]! / total) * deficit < i.min) {
        deficit -= widths[n]! - i.min;
        widths[n] = i.min;
        frozen[n] = true;
        violated = true;
      }
    });
    if (!violated) {
      items.forEach((_, n) => {
        if (!frozen[n]) {
          widths[n] = widths[n]! - (weights[n]! / total) * deficit;
        }
      });
      break;
    }
  }
  return widths;
}

const ON = 14;
const UNSPLASH = 52;
const lineFor = (nameWidth: number) => [
  item('.cover-attribution__name', nameWidth),
  { basis: ON, shrink: 0, min: ON },
  item('.cover-attribution__unsplash', UNSPLASH),
];
const SIDE_MIN_COVER = 128 - 24; // the narrowest cover, minus the credit's insets
const WIDE_COVER = 700 - 32;
const T = 8;
const SHORT = 70; // "Taylor Smith"
const LONG = 195; // "Alexandre Montgomery-Livingston"

describe('CoverAttribution layout', () => {
  it('keeps the line on one row with ellipsis on both links', () => {
    expect(declarations('.cover-attribution')['white-space']).toBe('nowrap');
    expect(declarations('.cover-attribution__name')['text-overflow']).toBe('ellipsis');
    expect(declarations('.cover-attribution__unsplash')['text-overflow']).toBe('ellipsis');
  });

  it('gives the name no minimum width: a floor is on the box, so a one-letter name would be left with blank space', () => {
    expect(declarations('.cover-attribution__name')['min-width']).toBe('0');
    const [name] = layout(lineFor(T), WIDE_COVER);
    expect(name).toBe(T);
  });

  it('never shrinks the "on" label', () => {
    const widths = layout(lineFor(LONG), SIDE_MIN_COVER);
    expect(widths[1]).toBe(ON);
    expect(declarations('.cover-attribution__text')['flex']).toBe('0 0 auto');
  });

  it('wider cover: nothing is truncated while it all fits', () => {
    expect(layout(lineFor(LONG), WIDE_COVER)).toEqual([LONG, ON, UNSPLASH]);
    expect(layout(lineFor(SHORT), WIDE_COVER)).toEqual([SHORT, ON, UNSPLASH]);
  });

  it('narrow cover: the Unsplash link gives room first, down to its floor, then the name — and the name never collapses', () => {
    const [name, , unsplash] = layout(lineFor(LONG), SIDE_MIN_COVER);
    expect(unsplash).toBeCloseTo(5 * CH, 1);
    expect(name!).toBeGreaterThan(3 * CH);
    expect(name! + ON + unsplash! + GAP * 2).toBeCloseTo(SIDE_MIN_COVER, 1);
  });

  it('a slightly short cover trims the link before the name gets any shorter than it must', () => {
    const [name, , unsplash] = layout(lineFor(SHORT), SHORT + ON + UNSPLASH + GAP * 2 - 6);
    expect(unsplash!).toBeLessThan(UNSPLASH);
    expect(name!).toBeGreaterThan(SHORT - 2);
  });
});
