import { describe, expect, it } from 'vitest';

import { DEFAULT_ZOOM_INDEX, ZOOM_LEVELS_PERCENT, stepZoomIndex, zoomPercentAt } from './pdfZoom';

describe('pdfZoom — canonical zoom', () => {
  it('defaults to exactly 100%', () => {
    expect(zoomPercentAt(DEFAULT_ZOOM_INDEX)).toBe(100);
  });

  it('steps to the next/previous canonical value', () => {
    expect(zoomPercentAt(stepZoomIndex(DEFAULT_ZOOM_INDEX, 'in'))).toBe(125);
    expect(zoomPercentAt(stepZoomIndex(DEFAULT_ZOOM_INDEX, 'out'))).toBe(75);
  });

  it('clamps at the minimum and maximum canonical values', () => {
    expect(zoomPercentAt(stepZoomIndex(0, 'out'))).toBe(ZOOM_LEVELS_PERCENT[0]);
    const maxIndex = ZOOM_LEVELS_PERCENT.length - 1;
    expect(zoomPercentAt(stepZoomIndex(maxIndex, 'in'))).toBe(ZOOM_LEVELS_PERCENT[maxIndex]);
  });

  it('walks the full sequence in order with no drift, forward and back', () => {
    let index = DEFAULT_ZOOM_INDEX;
    const forward: number[] = [];
    for (let i = DEFAULT_ZOOM_INDEX; i < ZOOM_LEVELS_PERCENT.length; i++) {
      forward.push(zoomPercentAt(index));
      index = stepZoomIndex(index, 'in');
    }
    expect(forward).toEqual([...ZOOM_LEVELS_PERCENT].slice(DEFAULT_ZOOM_INDEX));

    // Reversible: stepping back down the same number of times returns to 100%.
    for (let i = 0; i < ZOOM_LEVELS_PERCENT.length; i++) {
      index = stepZoomIndex(index, 'out');
    }
    expect(zoomPercentAt(index)).toBe(ZOOM_LEVELS_PERCENT[0]);
  });

  it('every displayed percentage is always exactly one of the canonical values', () => {
    let index = DEFAULT_ZOOM_INDEX;
    const directions: Array<'in' | 'out'> = ['in', 'in', 'out', 'out', 'out', 'in', 'in', 'in', 'in', 'out'];
    for (const direction of directions) {
      index = stepZoomIndex(index, direction);
      expect(ZOOM_LEVELS_PERCENT).toContain(zoomPercentAt(index));
    }
  });
});
