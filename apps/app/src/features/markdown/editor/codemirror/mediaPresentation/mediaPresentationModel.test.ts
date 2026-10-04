import { describe, expect, it } from 'vitest';

import {
  DEFAULT_IMAGE_PRESENTATION,
  DEFAULT_PDF_PRESENTATION,
  parseMediaPresentationTokens,
  resolveImagePresentation,
  resolvePdfPresentation,
  serializeImagePresentationTokens,
  resolveFillHeightOnSwitch,
  DEFAULT_FILL_HEIGHT_PX,
  serializePdfPresentationTokens,
  type ImagePresentation,
  type PdfPresentation,
} from './mediaPresentationModel';

describe('parseMediaPresentationTokens', () => {
  it('parses no tokens to all-null', () => {
    expect(parseMediaPresentationTokens([])).toEqual({ width: null, height: null, alignment: null, mode: null });
  });

  it.each([1, 6, 11, 12, 620])('recognizes width %i', (width) => {
    expect(parseMediaPresentationTokens([String(width)]).width).toBe(width);
  });

  it.each(['left', 'center', 'right'] as const)('recognizes alignment %s', (alignment) => {
    expect(parseMediaPresentationTokens([alignment]).alignment).toBe(alignment);
  });

  it.each(['fill', 'fit'] as const)('recognizes mode %s', (mode) => {
    expect(parseMediaPresentationTokens([mode]).mode).toBe(mode);
  });

  it('treats "large" as unrecognized — Large was removed as a mode', () => {
    expect(parseMediaPresentationTokens(['large']).mode).toBeNull();
  });

  it('recognizes all three in arbitrary order', () => {
    expect(parseMediaPresentationTokens(['fit', 'center', '620'])).toEqual({
      width: 620,
      height: null,
      alignment: 'center',
      mode: 'fit',
    });
    expect(parseMediaPresentationTokens(['620', 'center', 'fit'])).toEqual({
      width: 620,
      height: null,
      alignment: 'center',
      mode: 'fit',
    });
  });

  it('ignores unknown tokens without disturbing recognized ones', () => {
    expect(parseMediaPresentationTokens(['620', 'center', 'banana', 'fit'])).toEqual({
      width: 620,
      height: null,
      alignment: 'center',
      mode: 'fit',
    });
  });

  it('treats 0 as unrecognized (outside the 1-11/12+ buckets)', () => {
    expect(parseMediaPresentationTokens(['0']).width).toBeNull();
  });

  it('duplicate recognized non-numeric values: last one wins', () => {
    expect(parseMediaPresentationTokens(['620', '400', 'center', 'right', 'fit', 'fill'])).toEqual({
      width: 620,
      height: 400,
      alignment: 'right',
      mode: 'fill',
    });
  });

  it('width + mode are independent and order never matters: 320,fit === fit,320', () => {
    expect(parseMediaPresentationTokens(['320', 'fit'])).toEqual({
      width: 320,
      height: null,
      alignment: null,
      mode: 'fit',
    });
    expect(parseMediaPresentationTokens(['fit', '320'])).toEqual({
      width: 320,
      height: null,
      alignment: null,
      mode: 'fit',
    });
  });

  it('width + mode are independent and order never matters: 320,fill === fill,320', () => {
    expect(parseMediaPresentationTokens(['320', 'fill'])).toEqual({
      width: 320,
      height: null,
      alignment: null,
      mode: 'fill',
    });
    expect(parseMediaPresentationTokens(['fill', '320'])).toEqual({
      width: 320,
      height: null,
      alignment: null,
      mode: 'fill',
    });
  });

  it('a bare numeric token alone is width only, no mode implied, no height', () => {
    expect(parseMediaPresentationTokens(['320'])).toEqual({ width: 320, height: null, alignment: null, mode: null });
  });

  describe('height (resize milestone) — positional, not "last numeric wins"', () => {
    it('the first numeric token is width, the second is height', () => {
      expect(parseMediaPresentationTokens(['320', '500'])).toEqual({
        width: 320,
        height: 500,
        alignment: null,
        mode: null,
      });
    });

    it('width/height positions hold regardless of where non-numeric tokens fall between them', () => {
      expect(parseMediaPresentationTokens(['320', 'fill', 'center', '500'])).toEqual({
        width: 320,
        height: 500,
        alignment: 'center',
        mode: 'fill',
      });
    });

    it('a single numeric token never populates height', () => {
      expect(parseMediaPresentationTokens(['320', 'fit', 'center']).height).toBeNull();
    });

    it('a third numeric token is ignored — width/height stay at the first two', () => {
      expect(parseMediaPresentationTokens(['320', '500', '9999'])).toEqual({
        width: 320,
        height: 500,
        alignment: null,
        mode: null,
      });
    });
  });
});

describe('resolveImagePresentation', () => {
  it('defaults to width 11, height null, alignment left, mode fill when given no tokens', () => {
    expect(resolveImagePresentation([])).toEqual(DEFAULT_IMAGE_PRESENTATION);
  });

  it('fills in only the missing fields from tokens', () => {
    expect(resolveImagePresentation(['6'])).toEqual({ width: 6, height: null, alignment: 'left', mode: 'fill' });
    expect(resolveImagePresentation(['center'])).toEqual({
      width: 11,
      height: null,
      alignment: 'center',
      mode: 'fill',
    });
    expect(resolveImagePresentation(['fit'])).toEqual({ width: 11, height: null, alignment: 'left', mode: 'fit' });
  });

  it('resolves a fully-specified suffix', () => {
    expect(resolveImagePresentation(['620', 'center', 'fit'])).toEqual({
      width: 620,
      height: null,
      alignment: 'center',
      mode: 'fit',
    });
  });

  it('320,fit and fit,320 resolve to the exact same presentation', () => {
    expect(resolveImagePresentation(['320', 'fit'])).toEqual(resolveImagePresentation(['fit', '320']));
    expect(resolveImagePresentation(['320', 'fit'])).toEqual({
      width: 320,
      height: null,
      alignment: 'left',
      mode: 'fit',
    });
  });

  it('320,fill and fill,320 resolve to the exact same presentation', () => {
    expect(resolveImagePresentation(['320', 'fill'])).toEqual(resolveImagePresentation(['fill', '320']));
    expect(resolveImagePresentation(['320', 'fill'])).toEqual({
      width: 320,
      height: null,
      alignment: 'left',
      mode: 'fill',
    });
  });

  it('resolves a persisted Fill width + height (resize milestone)', () => {
    expect(resolveImagePresentation(['320', '500', 'fill', 'center'])).toEqual({
      width: 320,
      height: 500,
      alignment: 'center',
      mode: 'fill',
    });
  });

  it('resolves a persisted Fit width with a dormant height, unaffected by mode', () => {
    expect(resolveImagePresentation(['320', '500', 'fit', 'center'])).toEqual({
      width: 320,
      height: 500,
      alignment: 'center',
      mode: 'fit',
    });
  });
});

describe('resolvePdfPresentation', () => {
  it('defaults to width 11, alignment left when given no tokens', () => {
    expect(resolvePdfPresentation([])).toEqual(DEFAULT_PDF_PRESENTATION);
  });

  it('resolves width + alignment', () => {
    expect(resolvePdfPresentation(['620', 'center'])).toEqual({ width: 620, alignment: 'center' });
    expect(resolvePdfPresentation(['center', '620'])).toEqual({ width: 620, alignment: 'center' });
  });

  it('never surfaces a mode or height field — those tokens are simply irrelevant to the returned shape', () => {
    const result = resolvePdfPresentation(['fit', '620', '500']) as unknown as Record<string, unknown>;
    expect(result).toEqual({ width: 620, alignment: 'left' });
    expect(result.mode).toBeUndefined();
    expect(result.height).toBeUndefined();
  });
});

describe('serializeImagePresentationTokens', () => {
  it('omits the pipe segment entirely for the default presentation', () => {
    expect(serializeImagePresentationTokens(DEFAULT_IMAGE_PRESENTATION)).toBe('');
  });

  it('serializes width alone', () => {
    expect(serializeImagePresentationTokens({ width: 6, height: null, alignment: 'left', mode: 'fill' })).toBe('6');
  });

  it('serializes alignment alone', () => {
    expect(serializeImagePresentationTokens({ width: 11, height: null, alignment: 'center', mode: 'fill' })).toBe(
      'center'
    );
  });

  it('serializes mode alone', () => {
    expect(serializeImagePresentationTokens({ width: 11, height: null, alignment: 'left', mode: 'fit' })).toBe('fit');
  });

  it('serializes width + alignment in canonical order', () => {
    expect(serializeImagePresentationTokens({ width: 6, height: null, alignment: 'center', mode: 'fill' })).toBe(
      '6,center'
    );
  });

  it('serializes width + mode in canonical order', () => {
    expect(serializeImagePresentationTokens({ width: 6, height: null, alignment: 'left', mode: 'fit' })).toBe(
      '6,fit'
    );
  });

  it('serializes alignment + mode in canonical order', () => {
    expect(serializeImagePresentationTokens({ width: 11, height: null, alignment: 'center', mode: 'fit' })).toBe(
      'center,fit'
    );
  });

  it('serializes all fields in canonical order regardless of construction order', () => {
    const presentation: ImagePresentation = { mode: 'fit', width: 6, height: 400, alignment: 'center' };
    expect(serializeImagePresentationTokens(presentation)).toBe('6,400,center,fit');
  });

  it('serializes back to fill (changing from fit): width + fill', () => {
    expect(serializeImagePresentationTokens({ width: 6, height: null, alignment: 'left', mode: 'fill' })).toBe('6');
  });

  it('serializes back to fill (changing from fit): alignment + fill', () => {
    expect(serializeImagePresentationTokens({ width: 11, height: null, alignment: 'center', mode: 'fill' })).toBe(
      'center'
    );
  });

  it('serializes back to fill (changing from fit): width + alignment + fill', () => {
    expect(serializeImagePresentationTokens({ width: 6, height: null, alignment: 'center', mode: 'fill' })).toBe(
      '6,center'
    );
  });

  it('fill is the default and omitted when all fields are default', () => {
    expect(serializeImagePresentationTokens({ width: 11, height: null, alignment: 'left', mode: 'fill' })).toBe('');
  });

  it('round-trip: fit,320 parses and serializes back to 320,fit (order-independent)', () => {
    const parsed = resolveImagePresentation(['fit', '320']);
    expect(parsed).toEqual({ width: 320, height: null, alignment: 'left', mode: 'fit' });
    expect(serializeImagePresentationTokens(parsed)).toBe('320,fit');
  });

  it('round-trip: fill,320 parses and serializes back (fill is omitted when default)', () => {
    const parsed = resolveImagePresentation(['fill', '320']);
    expect(parsed).toEqual({ width: 320, height: null, alignment: 'left', mode: 'fill' });
    expect(serializeImagePresentationTokens(parsed)).toBe('320');
  });

  it('round-trip: 320,center,fit parses and serializes identically', () => {
    const parsed = resolveImagePresentation(['320', 'center', 'fit']);
    expect(serializeImagePresentationTokens(parsed)).toBe('320,center,fit');
  });

  it('round-trip: 320,center,fill parses and serializes (fill omitted since default)', () => {
    const parsed = resolveImagePresentation(['320', 'center', 'fill']);
    expect(parsed).toEqual({ width: 320, height: null, alignment: 'center', mode: 'fill' });
    expect(serializeImagePresentationTokens(parsed)).toBe('320,center');
  });

  describe('height (resize milestone)', () => {
    it('serializes width + height in canonical width-then-height order', () => {
      expect(serializeImagePresentationTokens({ width: 320, height: 500, alignment: 'left', mode: 'fill' })).toBe(
        '320,500'
      );
    });

    it('emits height whenever set, regardless of mode — dormant while Fit', () => {
      expect(serializeImagePresentationTokens({ width: 320, height: 500, alignment: 'left', mode: 'fit' })).toBe(
        '320,500,fit'
      );
    });

    it('round-trip: 320,500,fill,center', () => {
      const parsed = resolveImagePresentation(['320', '500', 'fill', 'center']);
      expect(serializeImagePresentationTokens(parsed)).toBe('320,500,center');
    });

    it('round-trip: a Fit width+dormant-height round-trips losslessly', () => {
      const parsed = resolveImagePresentation(['320', '500', 'fit', 'center']);
      expect(parsed).toEqual({ width: 320, height: 500, alignment: 'center', mode: 'fit' });
      expect(serializeImagePresentationTokens(parsed)).toBe('320,500,center,fit');
      expect(resolveImagePresentation(serializeImagePresentationTokens(parsed).split(','))).toEqual(parsed);
    });

    it('switching a persisted Fit width+height presentation to fill activates the dormant height', () => {
      const fitParsed = resolveImagePresentation(['320', '500', 'fit', 'center']);
      const switchedToFill: ImagePresentation = { ...fitParsed, mode: 'fill' };
      expect(serializeImagePresentationTokens(switchedToFill)).toBe('320,500,center');
      expect(resolveImagePresentation(serializeImagePresentationTokens(switchedToFill).split(','))).toEqual({
        width: 320,
        height: 500,
        alignment: 'center',
        mode: 'fill',
      });
    });

    it('a width-only update preserves an existing dormant height untouched', () => {
      const current = resolveImagePresentation(['320', '500', 'fit', 'center']);
      const widthOnlyUpdate: ImagePresentation = { ...current, width: 400 };
      expect(widthOnlyUpdate.height).toBe(500);
      expect(serializeImagePresentationTokens(widthOnlyUpdate)).toBe('400,500,center,fit');
    });
  });
});

describe('serializePdfPresentationTokens', () => {
  it('omits the pipe segment entirely for the default presentation', () => {
    expect(serializePdfPresentationTokens(DEFAULT_PDF_PRESENTATION)).toBe('');
  });

  it('serializes width + alignment in canonical order', () => {
    const presentation: PdfPresentation = { width: 6, alignment: 'center' };
    expect(serializePdfPresentationTokens(presentation)).toBe('6,center');
  });

  it('serializes width alone', () => {
    expect(serializePdfPresentationTokens({ width: 620, alignment: 'left' })).toBe('620');
  });

  it('serializes alignment alone', () => {
    expect(serializePdfPresentationTokens({ width: 11, alignment: 'right' })).toBe('right');
  });
});

describe('a height is always written with its width (the parser reads the first number as the width)', () => {
  it('writes the default width alongside a height, so a lone number is never read back as a width', () => {
    const presentation = { width: 11, height: 380, alignment: 'left' as const, mode: 'fill' as const };
    const tokens = serializeImagePresentationTokens(presentation);

    expect(tokens).toBe('11,380');
    expect(resolveImagePresentation(tokens.split(','))).toEqual(presentation);
  });

  it('round-trips every width/height/alignment/mode combination', () => {
    for (const width of [11, 6, 320]) {
      for (const height of [null, 380, 500]) {
        for (const alignment of ['left', 'center'] as const) {
          for (const mode of ['fill', 'fit'] as const) {
            const presentation = { width, height, alignment, mode };
            const tokens = serializeImagePresentationTokens(presentation);
            expect(resolveImagePresentation(tokens === '' ? [] : tokens.split(','))).toEqual(presentation);
          }
        }
      }
    }
  });

  it('still writes nothing for an all-default presentation, and no width when there is no height', () => {
    expect(serializeImagePresentationTokens(DEFAULT_IMAGE_PRESENTATION)).toBe('');
    expect(serializeImagePresentationTokens({ width: 11, height: null, alignment: 'center', mode: 'fit' })).toBe(
      'center,fit'
    );
  });
});

describe('resolveFillHeightOnSwitch (Fit -> Fill keeps the current height, capped at the default)', () => {
  it('keeps the on-screen height when nothing was saved and it is below the default', () => {
    expect(resolveFillHeightOnSwitch(null, 380)).toBe(380);
    expect(resolveFillHeightOnSwitch(null, 213.4)).toBe(213);
  });

  it('prefers a saved height over the on-screen one', () => {
    expect(resolveFillHeightOnSwitch(300, 380)).toBe(300);
  });

  it('caps at the default: a height at or above it becomes "nothing saved" (the default applies)', () => {
    expect(DEFAULT_FILL_HEIGHT_PX).toBe(400);
    expect(resolveFillHeightOnSwitch(null, 400)).toBeNull();
    expect(resolveFillHeightOnSwitch(null, 600)).toBeNull();
    expect(resolveFillHeightOnSwitch(500, 380)).toBeNull();
  });

  it('keeps nothing when there is nothing usable (no layout, zero or invalid height)', () => {
    expect(resolveFillHeightOnSwitch(null, 0)).toBeNull();
    expect(resolveFillHeightOnSwitch(null, Number.NaN)).toBeNull();
    expect(resolveFillHeightOnSwitch(0, 380)).toBeNull();
  });
});

