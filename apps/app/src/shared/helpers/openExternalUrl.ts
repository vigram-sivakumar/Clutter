import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

const EXPLICIT_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const RELATIVE_DESTINATION_RE = /^(\.\.?\/|\/|#|\?)/;
const DOMAIN_HOST_RE = /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/;

/** A destination of the form `[label](innerUrl)` — arises when a Markdown
 * link's own destination is itself unescaped bracket-and-paren link syntax
 * (`[Google]([www.example.com](https://www.example.com))`); CommonMark
 * allows balanced parens in a destination, so the parser captures the whole
 * nested form as one opaque `URL` node rather than a scheme-prefixed
 * string. Unwrap it and resolve the inner destination instead. */
const NESTED_LINK_DESTINATION_RE = /^\[[^\]]*\]\((.+)\)$/;

/**
 * Resolves a raw Markdown link destination to the URL actually navigated
 * to. Destinations with an explicit scheme (`https:`, `mailto:`, `tel:`,
 * …) and Markdown-relative destinations (`./x`, `../x`, `/x`, `#x`, `?x`)
 * pass through unchanged; a destination that otherwise looks like a bare
 * domain (`example.com`, `example.com/path`) is resolved as `https://` for
 * navigation purposes only — the stored Markdown destination is never
 * rewritten.
 */
export function resolveNavigationUrl(destination: string): string {
  const nested = destination.match(NESTED_LINK_DESTINATION_RE);
  if (nested?.[1]) {
    return resolveNavigationUrl(nested[1]);
  }

  if (EXPLICIT_SCHEME_RE.test(destination) || RELATIVE_DESTINATION_RE.test(destination)) {
    return destination;
  }

  const host = destination.split(/[/?#]/, 1)[0] ?? '';
  if (DOMAIN_HOST_RE.test(host)) {
    return `https://${destination}`;
  }

  return destination;
}

export async function openExternalUrl(url: string): Promise<void> {
  const resolved = resolveNavigationUrl(url);

  if (isTauri()) {
    await openUrl(resolved);
    return;
  }

  window.open(resolved, '_blank', 'noopener,noreferrer');
}
