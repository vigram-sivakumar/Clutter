import { describe, expect, it } from 'vitest';
import { computeVisibleTemplateCount } from './visibleTemplateCount';

const overflow = () => 60;

describe('computeVisibleTemplateCount', () => {
  it('shows every template, and no overflow entry, when the whole row fits', () => {
    expect(computeVisibleTemplateCount([100, 100, 100], overflow, 320, 10)).toBe(3);
  });

  it('a row that fits exactly is not reduced', () => {
    expect(computeVisibleTemplateCount([100, 100, 100], overflow, 320, 10)).toBe(3);
    expect(computeVisibleTemplateCount([100, 100, 100], overflow, 319, 10)).toBe(2);
  });

  it('reserves room for the overflow entry itself', () => {
    // 2 entries + overflow = 100 + 10 + 100 + 10 + 60 = 280 ≤ 290; 3 entries alone = 320 > 290.
    expect(computeVisibleTemplateCount([100, 100, 100], overflow, 290, 10)).toBe(2);
    // 2 entries + overflow = 280 > 279, so one entry + overflow (170) is all that fits.
    expect(computeVisibleTemplateCount([100, 100, 100], overflow, 279, 10)).toBe(1);
  });

  it('shows only the overflow entry when not even one template fits beside it', () => {
    expect(computeVisibleTemplateCount([100, 100], overflow, 120, 10)).toBe(0);
  });

  it('sizes the overflow entry by the number actually hidden', () => {
    const byHidden = (hidden: number) => (hidden >= 10 ? 80 : 60);

    expect(computeVisibleTemplateCount(Array(12).fill(50), byHidden, 400, 10)).toBe(5);
  });

  it('an empty list shows nothing', () => {
    expect(computeVisibleTemplateCount([], overflow, 0, 10)).toBe(0);
  });
});
