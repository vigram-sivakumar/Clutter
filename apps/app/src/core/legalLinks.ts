/**
 * The public addresses of Clutter's privacy policy and support page, shown in Settings → Preferences → Privacy and
 * support (`features/settings/legal-links`).
 *
 * `null` means that page is not published yet, and its entry is not shown: the app never points at an address that
 * does not exist. Before a Mac App Store build, publish `docs/privacy-policy.md` and `docs/support.md` somewhere public,
 * set both addresses here (https only), and use the same two addresses in App Store Connect. `npm run check:legal-links`
 * fails until both are set, and `build:appstore` runs it.
 */
export interface LegalLinks {
  readonly privacyPolicy: string | null;
  readonly support: string | null;
}

export const LEGAL_LINKS: LegalLinks = {
  privacyPolicy: null,
  support: null,
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
