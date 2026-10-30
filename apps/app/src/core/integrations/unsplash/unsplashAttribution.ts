import type { CoverCredit } from '@core/vault/models/PageMetadata';

/**
 * Unsplash attribution rules in one place (ADR-054): which URLs are Unsplash
 * photos, and the referral-tagged links every credit must use. Pure — no
 * network, no storage.
 */

/** The `utm_source` registered for Clutter's Unsplash application. */
export const UNSPLASH_REFERRAL_SOURCE = 'clutter';

const UNSPLASH_IMAGE_HOSTS: ReadonlySet<string> = new Set([
  'images.unsplash.com',
  'plus.unsplash.com',
]);

/**
 * The width a saved cover is requested at. A cover is drawn large — a tall side strip or the full content width, at up
 * to 2× pixel density — so the API's `regular` size (`w=1080`) is stretched and looks soft. 3200 covers a 3:2 photo
 * filling the side strip at 2× (about 2950 px) and keeps the download moderate; the cost depends on the photo
 * (`q=80` is unchanged): about 300 KB for a simple one, several times that for a detailed one. A larger value (4800
 * was tried) is sharper on big windows and costs about twice as much — change it here.
 */
export const UNSPLASH_COVER_WIDTH = 3200;

/**
 * The picture address to save as a cover for an Unsplash image address (the `urls.regular` the API returned, or one
 * pasted from `images.unsplash.com`): the same URL with only its width raised to `UNSPLASH_COVER_WIDTH`. Unsplash's
 * images are served by imgix and the API documents `w` (with `q`, `fit`, …) as a parameter to adjust; the host, path,
 * `ixid` and every other parameter are kept as they were. An address that already asks for that width or more, one
 * with no `w` at all (already the original size), and anything that is not an Unsplash image address is returned
 * unchanged — a size someone chose is never reduced.
 */
export function unsplashCoverUrl(imageUrl: string): string {
  if (!isUnsplashImageUrl(imageUrl)) {
    return imageUrl;
  }

  const url = new URL(imageUrl);
  const requested = Number(url.searchParams.get('w'));

  if (!url.searchParams.has('w') || !Number.isFinite(requested) || requested >= UNSPLASH_COVER_WIDTH) {
    return imageUrl;
  }

  url.searchParams.set('w', String(UNSPLASH_COVER_WIDTH));

  return url.toString();
}

/** Adds the required `utm_source` / `utm_medium` to an Unsplash link, keeping everything else. */
export function withUnsplashReferral(link: string): string {
  const url = new URL(link);

  url.searchParams.set('utm_source', UNSPLASH_REFERRAL_SOURCE);
  url.searchParams.set('utm_medium', 'referral');

  return url.toString();
}

/** https://unsplash.com with the referral parameters (the literal form Unsplash documents). */
export const UNSPLASH_HOME_URL = `https://unsplash.com?utm_source=${UNSPLASH_REFERRAL_SOURCE}&utm_medium=referral`;

/** Whether `reference` is an image URL served from Unsplash's CDN. */
export function isUnsplashImageUrl(reference: string | null | undefined): boolean {
  if (!reference) {
    return false;
  }

  try {
    const url = new URL(reference);

    return url.protocol === 'https:' && UNSPLASH_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

const UNSPLASH_PAGE_HOSTS: ReadonlySet<string> = new Set(['unsplash.com', 'www.unsplash.com']);
const PHOTO_ID_LENGTH = 11;
const PHOTO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * The API photo id of an Unsplash photo *page* link (`unsplash.com/photos/<title-words>-<id>` or
 * `unsplash.com/photos/<id>`), or null for anything else — an `images.unsplash.com` address included: its
 * `photo-<number>-<hash>` name is a CDN file name, not an id the API knows (it answers 404), so a bare image
 * address cannot be traced back to its photographer. The id is the last 11 characters, which may themselves
 * contain `-`, so the slug is cut by length, not at the last hyphen.
 */
export function parseUnsplashPhotoId(link: string): string | null {
  let url: URL;

  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || !UNSPLASH_PAGE_HOSTS.has(url.hostname)) {
    return null;
  }

  const [section, slug] = url.pathname.split('/').filter(Boolean);

  if (section !== 'photos' || !slug) {
    return null;
  }

  if (slug.length === PHOTO_ID_LENGTH) {
    return PHOTO_ID_PATTERN.test(slug) ? slug : null;
  }

  const id = slug.slice(-PHOTO_ID_LENGTH);

  return slug[slug.length - PHOTO_ID_LENGTH - 1] === '-' && PHOTO_ID_PATTERN.test(id) ? id : null;
}

/** What to show for a cover: the full credit, Unsplash alone (legacy cover), or nothing. */
export type CoverAttribution =
  | { readonly kind: 'credit'; readonly name: string; readonly profileUrl: string }
  | { readonly kind: 'unsplash' };

/**
 * A stored credit shows the photographer whatever the cover's address now is —
 * a photo saved to the vault is a local file but still Unsplash's (ADR-054; a
 * credit is only ever recorded for an Unsplash pick and cleared with any other
 * cover). An Unsplash URL without one (saved before ADR-054) shows "Photo on
 * Unsplash" — never an invented photographer.
 */
export function coverAttributionFor(
  cover: string | null | undefined,
  credit: CoverCredit | null | undefined
): CoverAttribution | null {
  if (!cover) {
    return null;
  }

  if (credit) {
    return { kind: 'credit', name: credit.name, profileUrl: withUnsplashReferral(credit.url) };
  }

  return isUnsplashImageUrl(cover) ? { kind: 'unsplash' } : null;
}
