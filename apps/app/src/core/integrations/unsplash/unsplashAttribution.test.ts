import { describe, expect, it } from 'vitest';

import {
  UNSPLASH_HOME_URL,
  coverAttributionFor,
  isUnsplashImageUrl,
  withUnsplashReferral,
} from './unsplashAttribution';

const COVER = 'https://images.unsplash.com/photo-1?crop=entropy&ixid=abc&w=1080';

describe('withUnsplashReferral', () => {
  it('adds utm_source=clutter and utm_medium=referral, keeping the rest', () => {
    expect(withUnsplashReferral('https://unsplash.com/@alex')).toBe(
      'https://unsplash.com/@alex?utm_source=clutter&utm_medium=referral'
    );
    expect(withUnsplashReferral('https://unsplash.com/@alex?foo=1')).toBe(
      'https://unsplash.com/@alex?foo=1&utm_source=clutter&utm_medium=referral'
    );
  });

  it('does not duplicate the parameters when they are already there', () => {
    const once = withUnsplashReferral('https://unsplash.com/@alex');

    expect(withUnsplashReferral(once)).toBe(once);
  });

  it('exposes the documented Unsplash home link', () => {
    expect(UNSPLASH_HOME_URL).toBe('https://unsplash.com?utm_source=clutter&utm_medium=referral');
  });
});

describe('isUnsplashImageUrl', () => {
  it('recognizes Unsplash CDN hosts only', () => {
    expect(isUnsplashImageUrl(COVER)).toBe(true);
    expect(isUnsplashImageUrl('https://plus.unsplash.com/premium_photo-1')).toBe(true);
    expect(isUnsplashImageUrl('https://unsplash.com/photos/abc')).toBe(false);
    expect(isUnsplashImageUrl('https://images.unsplash.com.evil.example/x.jpg')).toBe(false);
    expect(isUnsplashImageUrl('http://images.unsplash.com/x.jpg')).toBe(false);
    expect(isUnsplashImageUrl('Assets/cover.png')).toBe(false);
    expect(isUnsplashImageUrl('https://example.com/cover.png')).toBe(false);
    expect(isUnsplashImageUrl(null)).toBe(false);
    expect(isUnsplashImageUrl('')).toBe(false);
  });
});

describe('coverAttributionFor', () => {
  const credit = { name: 'Alex Doe', url: 'https://unsplash.com/@alex' };

  it('credits the photographer, with the referral link, for an Unsplash cover with a credit', () => {
    expect(coverAttributionFor(COVER, credit)).toEqual({
      kind: 'credit',
      name: 'Alex Doe',
      profileUrl: 'https://unsplash.com/@alex?utm_source=clutter&utm_medium=referral',
    });
  });

  it('falls back to Unsplash alone for an Unsplash cover saved without a credit — no invented photographer', () => {
    expect(coverAttributionFor(COVER, null)).toEqual({ kind: 'unsplash' });
    expect(coverAttributionFor(COVER, undefined)).toEqual({ kind: 'unsplash' });
  });

  it('keeps crediting a photo that was saved to the vault: the credit, not the address, decides', () => {
    expect(coverAttributionFor('Assets/photo.jpg', credit)).toMatchObject({ kind: 'credit', name: 'Alex Doe' });
  });

  it('shows nothing for covers that are neither Unsplash URLs nor credited, or have no cover', () => {
    expect(coverAttributionFor('Assets/cover.png', null)).toBeNull();
    expect(coverAttributionFor('https://example.com/c.png', null)).toBeNull();
    expect(coverAttributionFor(null, credit)).toBeNull();
  });
});
