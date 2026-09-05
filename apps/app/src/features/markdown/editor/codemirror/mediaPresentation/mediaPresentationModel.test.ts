import { describe, expect, it } from 'vitest';

import {
  DEFAULT_IMAGE_PRESENTATION,
  DEFAULT_PDF_PRESENTATION,
  parseMediaPresentationTokens,
  resolveImagePresentation,
  resolvePdfPresentation,
  serializeImagePresentationTokens,
  serializePdfPresentationTokens,
  type ImagePresentation,
  type PdfPresentation,
} from './mediaPresentationModel';

describe('parseMediaPresentationTokens', () => {
  it('parses no tokens to all-null', () => {
    expect(parseMediaPresentationTokens([])).toEqual({ width: null, alignment: null, mode: null });
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
      alignment: 'center',
      mode: 'fit',
    });
    expect(parseMediaPresentationTokens(['620', 'center', 'fit'])).toEqual({
      width: 620,
      alignment: 'center',
      mode: 'fit',
    });
  });

  it('ignores unknown tokens without disturbing recognized ones', () => {
    expect(parseMediaPresentationTokens(['620', 'center', 'banana', 'fit'])).toEqual({
      width: 620,
      alignment: 'center',
      mode: 'fit',
    });
  });

  it('treats 0 as unrecognized (outside the 1-11/12+ buckets)', () => {
    expect(parseMediaPresentationTokens(['0']).width).toBeNull();
  });

  it('duplicate recognized values: last one wins', () => {
    expect(parseMediaPresentationTokens(['620', '400', 'center', 'right', 'fit', 'fill'])).toEqual({
      width: 400,
      alignment: 'right',
      mode: 'fill',
    });
  });
});

describe('resolveImagePresentation', () => {
  it('defaults to width 11, alignment left, mode fill when given no tokens', () => {
    expect(resolveImagePresentation([])).toEqual(DEFAULT_IMAGE_PRESENTATION);
  });

  it('fills in only the missing fields from tokens', () => {
    expect(resolveImagePresentation(['6'])).toEqual({ width: 6, alignment: 'left', mode: 'fill' });
    expect(resolveImagePresentation(['center'])).toEqual({ width: 11, alignment: 'center', mode: 'fill' });
    expect(resolveImagePresentation(['fit'])).toEqual({ width: 11, alignment: 'left', mode: 'fit' });
  });

  it('resolves a fully-specified suffix', () => {
    expect(resolveImagePresentation(['620', 'center', 'fit'])).toEqual({ width: 620, alignment: 'center', mode: 'fit' });
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

  it('never surfaces a mode field — a mode token is simply irrelevant to the returned shape', () => {
    const result = resolvePdfPresentation(['fit', '620']) as unknown as Record<string, unknown>;
    expect(result).toEqual({ width: 620, alignment: 'left' });
    expect(result.mode).toBeUndefined();
  });
});

describe('serializeImagePresentationTokens', () => {
  it('omits the pipe segment entirely for the default presentation', () => {
    expect(serializeImagePresentationTokens(DEFAULT_IMAGE_PRESENTATION)).toBe('');
  });

  it('serializes width alone', () => {
    expect(serializeImagePresentationTokens({ width: 6, alignment: 'left', mode: 'fill' })).toBe('6');
  });

  it('serializes alignment alone', () => {
    expect(serializeImagePresentationTokens({ width: 11, alignment: 'center', mode: 'fill' })).toBe('center');
  });

  it('serializes mode alone', () => {
    expect(serializeImagePresentationTokens({ width: 11, alignment: 'left', mode: 'fit' })).toBe('fit');
  });

  it('serializes width + alignment in canonical order', () => {
    expect(serializeImagePresentationTokens({ width: 6, alignment: 'center', mode: 'fill' })).toBe('6,center');
  });

  it('serializes width + mode in canonical order', () => {
    expect(serializeImagePresentationTokens({ width: 6, alignment: 'left', mode: 'fit' })).toBe('6,fit');
  });

  it('serializes alignment + mode in canonical order', () => {
    expect(serializeImagePresentationTokens({ width: 11, alignment: 'center', mode: 'fit' })).toBe('center,fit');
  });

  it('serializes all three in canonical order regardless of construction order', () => {
    const presentation: ImagePresentation = { mode: 'fit', width: 6, alignment: 'center' };
    expect(serializeImagePresentationTokens(presentation)).toBe('6,center,fit');
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
