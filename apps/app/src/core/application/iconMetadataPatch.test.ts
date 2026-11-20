import { describe, expect, it } from 'vitest';
import { normalizeIconMetadataPatch } from './iconMetadataPatch';

describe('normalizeIconMetadataPatch', () => {
  it('clears the image when an emoji is selected', () => {
    expect(normalizeIconMetadataPatch({ icon: '📝' })).toEqual({
      icon: '📝',
      iconImage: null,
    });
  });

  it('clears the emoji when an image is selected', () => {
    expect(normalizeIconMetadataPatch({ iconImage: 'Assets/icon.png' })).toEqual({
      iconImage: 'Assets/icon.png',
      icon: null,
    });
  });

  it('clears both forms when the icon is removed', () => {
    expect(normalizeIconMetadataPatch({ icon: null })).toEqual({
      icon: null,
      iconImage: null,
    });
  });

  it('clears only the image when removing an image and preserves the emoji fallback', () => {
    expect(normalizeIconMetadataPatch({ iconImage: null })).toEqual({
      iconImage: null,
    });
  });

  it('preserves an explicit request to clear both fields', () => {
    expect(normalizeIconMetadataPatch({ icon: null, iconImage: null })).toEqual({
      icon: null,
      iconImage: null,
    });
  });

  it('leaves unrelated metadata patches unchanged', () => {
    expect(normalizeIconMetadataPatch({ favorite: true })).toEqual({ favorite: true });
  });
});
