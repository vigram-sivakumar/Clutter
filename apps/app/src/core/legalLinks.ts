/**
 * The public privacy policy and support addresses for Clutter.
 *
 * The privacy policy is linked from Settings → Preferences. The support address is retained for the Mac App Store's
 * Support URL requirement; in-app contact is provided separately by Settings → Contact Us.
 */
export interface LegalLinks {
  readonly privacyPolicy: string | null;
  readonly support: string | null;
}

export const LEGAL_LINKS: LegalLinks = {
  privacyPolicy: 'https://clutter-privacy.pages.dev/privacy/',
  support: 'https://clutter-privacy.pages.dev/contact/',
};

/** Whether `value` is a usable public address: an `https` URL with a host. Nothing else is ever opened from Settings. */
export function isPublicHttpsUrl(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);

    return url.protocol === 'https:' && url.hostname.includes('.') && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

export function hasLegalLinks(links: LegalLinks = LEGAL_LINKS): boolean {
  return isPublicHttpsUrl(links.privacyPolicy) || isPublicHttpsUrl(links.support);
}
