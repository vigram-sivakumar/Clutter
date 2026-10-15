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
