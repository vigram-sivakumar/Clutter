import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ZOOM_INDEX,
  ZOOM_LEVELS_PERCENT,
  computeFitScale,
  fitZoomState,
  isZoomInDisabled,
  isZoomOutDisabled,
  manualZoomState,
  stepZoomIndex,
  stepZoomState,
  zoomPercentAt,
  zoomStateDisplayPercent,
  zoomStateScale,
} from './pdfZoom';

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

describe('pdfZoom — computeFitScale', () => {
  it('computes the precise, unrounded viewport scale that fills the available width', () => {
    expect(computeFitScale(900, 612)).toBeCloseTo(1.470588, 5);
  });

  it('is not one of the canonical values in general — the fit scale is a calculated viewport scale, not a manually accumulated one', () => {
    const scale = computeFitScale(900, 612);
    expect(ZOOM_LEVELS_PERCENT).not.toContain(Math.round(scale * 100));
  });

  it('falls back to 1 (100%) when the available width is not yet known', () => {
    expect(computeFitScale(0, 612)).toBe(1);
    expect(computeFitScale(-10, 612)).toBe(1);
  });

  it('falls back to 1 (100%) when the page width is not yet known', () => {
    expect(computeFitScale(900, 0)).toBe(1);
  });
});

describe('pdfZoom — PdfZoomState', () => {
  it('fitZoomState exposes the precise fit scale as both the render scale and the (rounded) displayed percentage', () => {
    const state = fitZoomState(1.470588);
    expect(zoomStateScale(state)).toBe(1.470588);
    expect(zoomStateDisplayPercent(state)).toBe(147);
  });

  it('fitZoomState falls back to a scale of 1 for a non-positive input', () => {
    expect(zoomStateScale(fitZoomState(0))).toBe(1);
    expect(zoomStateScale(fitZoomState(-1))).toBe(1);
  });

  it('manualZoomState exposes exactly the canonical percent/scale at its index', () => {
    const state = manualZoomState(ZOOM_LEVELS_PERCENT.indexOf(150));
    expect(zoomStateScale(state)).toBe(1.5);
    expect(zoomStateDisplayPercent(state)).toBe(150);
  });

  it('stepping a fit state moves to the next/previous canonical level above/below the fit percentage, not the nearest canonical level below it', () => {
    // 137% fits strictly between 125% and 150% — zoom in must land on 150%
    // (the next canonical value above it), never 125% (below it).
    const fit137 = fitZoomState(1.37);
    expect(zoomStateDisplayPercent(stepZoomState(fit137, 'in'))).toBe(150);
    expect(zoomStateDisplayPercent(stepZoomState(fit137, 'out'))).toBe(125);
  });

  it('stepping a fit state always transitions to manual state — a later resize must not override it', () => {
    const stepped = stepZoomState(fitZoomState(1.37), 'in');
    expect(stepped.kind).toBe('manual');
  });

  it('stepping a fit state clamps at the canonical bounds exactly like manual stepping', () => {
    expect(zoomStateDisplayPercent(stepZoomState(fitZoomState(0.1), 'out'))).toBe(50);
    expect(zoomStateDisplayPercent(stepZoomState(fitZoomState(10), 'in'))).toBe(400);
  });

  it('stepping a fit state exactly on a canonical value moves strictly past it, never staying put', () => {
    const fit100 = fitZoomState(1);
    expect(zoomStateDisplayPercent(stepZoomState(fit100, 'in'))).toBe(125);
    expect(zoomStateDisplayPercent(stepZoomState(fit100, 'out'))).toBe(75);
  });

  it('stepping a manual state is exactly the canonical stepZoomIndex model', () => {
    const manual100 = manualZoomState(DEFAULT_ZOOM_INDEX);
    expect(zoomStateDisplayPercent(stepZoomState(manual100, 'in'))).toBe(125);
    expect(zoomStateDisplayPercent(stepZoomState(manual100, 'out'))).toBe(75);
  });

  it('disables Zoom out at/below the minimum canonical level for both fit and manual states', () => {
    expect(isZoomOutDisabled(fitZoomState(0.5))).toBe(true);
    expect(isZoomOutDisabled(fitZoomState(0.3))).toBe(true);
    expect(isZoomOutDisabled(fitZoomState(0.75))).toBe(false);
    expect(isZoomOutDisabled(manualZoomState(0))).toBe(true);
    expect(isZoomOutDisabled(manualZoomState(1))).toBe(false);
  });

  it('disables Zoom in at/above the maximum canonical level for both fit and manual states', () => {
    expect(isZoomInDisabled(fitZoomState(4))).toBe(true);
    expect(isZoomInDisabled(fitZoomState(5))).toBe(true);
    expect(isZoomInDisabled(fitZoomState(2))).toBe(false);
    expect(isZoomInDisabled(manualZoomState(ZOOM_LEVELS_PERCENT.length - 1))).toBe(true);
    expect(isZoomInDisabled(manualZoomState(ZOOM_LEVELS_PERCENT.length - 2))).toBe(false);
  });
});
