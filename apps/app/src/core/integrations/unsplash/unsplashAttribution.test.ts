import { describe, expect, it } from 'vitest';

import {
  UNSPLASH_HOME_URL,
  coverAttributionFor,
  isUnsplashImageUrl,
  parseUnsplashPhotoId,
  unsplashCoverUrl,
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

describe('parseUnsplashPhotoId', () => {
  it('reads the id from a photo page link, with or without the title words', () => {
    expect(parseUnsplashPhotoId('https://unsplash.com/photos/a-person-on-a-beach-Dwu85P9SOIk')).toBe('Dwu85P9SOIk');
    expect(parseUnsplashPhotoId('https://unsplash.com/photos/Dwu85P9SOIk')).toBe('Dwu85P9SOIk');
    expect(parseUnsplashPhotoId('https://www.unsplash.com/photos/Dwu85P9SOIk?utm_source=x#top')).toBe('Dwu85P9SOIk');
  });

  it('cuts the id by length, so an id that contains hyphens or underscores is kept whole', () => {
    expect(parseUnsplashPhotoId('https://unsplash.com/photos/some-title-a-b_c-d-eFg')).toBe('a-b_c-d-eFg');
    expect(parseUnsplashPhotoId('https://unsplash.com/photos/title--abcdefghij')).toBe('-abcdefghij');
    expect(parseUnsplashPhotoId('https://unsplash.com/photos/a-b_c-d-eFg')).toBe('a-b_c-d-eFg');
  });

  it('is null for an image address: its photo-<number>-<hash> name is not an API id', () => {
    expect(parseUnsplashPhotoId('https://images.unsplash.com/photo-1560506287-e7dab1f13a0d?q=80&w=2938')).toBeNull();
    expect(parseUnsplashPhotoId('https://unsplash.com/photos/photo-1560506287-e7dab1f13a0d')).toBeNull();
  });

  it('is null for anything that is not a photo page', () => {
    expect(parseUnsplashPhotoId('https://unsplash.com/@alex')).toBeNull();
    expect(parseUnsplashPhotoId('https://unsplash.com/s/photos/beach')).toBeNull();
    expect(parseUnsplashPhotoId('https://unsplash.com/photos/')).toBeNull();
    expect(parseUnsplashPhotoId('https://unsplash.com/photos/short')).toBeNull();
    expect(parseUnsplashPhotoId('https://unsplash.com/photos/not-an-idxxxxxxxxxx')).toBeNull();
    expect(parseUnsplashPhotoId('http://unsplash.com/photos/Dwu85P9SOIk')).toBeNull();
    expect(parseUnsplashPhotoId('https://example.com/photos/Dwu85P9SOIk')).toBeNull();
    expect(parseUnsplashPhotoId('https://evilunsplash.com/photos/Dwu85P9SOIk')).toBeNull();
    expect(parseUnsplashPhotoId('not a url')).toBeNull();
  });
});

describe('unsplashCoverUrl', () => {
  const REGULAR =
    'https://images.unsplash.com/photo-1560506287-e7dab1f13a0d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDMwMzI4fDB8MXxhbGx8fHx8fHx8fHwxNzkzMzY0NTU1fA&ixlib=rb-4.1.0&q=80&w=1080';

  it('raises only the width, keeping the host, path, ixid and every other parameter as they were', () => {
    expect(unsplashCoverUrl(REGULAR)).toBe(REGULAR.replace('w=1080', 'w=3200'));
  });

  it('works on an address pasted from images.unsplash.com, not only on one the API returned', () => {
    expect(unsplashCoverUrl('https://images.unsplash.com/photo-1?w=400&q=80')).toBe('https://images.unsplash.com/photo-1?w=3200&q=80');
  });

  it('never lowers a width that is already as large or larger', () => {
    const large = REGULAR.replace('w=1080', 'w=4800');
    expect(unsplashCoverUrl(large)).toBe(large);
    const exact = REGULAR.replace('w=1080', 'w=3200');
    expect(unsplashCoverUrl(exact)).toBe(exact);
  });

  it('leaves an address with no width alone: it is already the original size', () => {
    expect(unsplashCoverUrl('https://images.unsplash.com/photo-1?ixid=abc')).toBe('https://images.unsplash.com/photo-1?ixid=abc');
    expect(unsplashCoverUrl('https://images.unsplash.com/photo-1?w=abc')).toBe('https://images.unsplash.com/photo-1?w=abc');
  });

  it('leaves an address that is not an Unsplash image alone', () => {
    expect(unsplashCoverUrl('https://example.com/pic.jpg?w=1080')).toBe('https://example.com/pic.jpg?w=1080');
    expect(unsplashCoverUrl('not a url')).toBe('not a url');
  });
});
