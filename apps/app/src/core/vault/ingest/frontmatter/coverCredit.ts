import type { CoverCredit } from '../../models/PageMetadata';

/**
 * The `coverCredit` frontmatter line: `Name <https://profile-url>` with an optional
 * second `<https://api.unsplash.com/…/download…>` (the photo's download location), (ADR-054).
 *
 * Parsing is total and lenient — anything that is not `Name <https-url>` is
 * simply "no credit", never an error and never an invented value. Formatting
 * normalizes the name so the written line always round-trips.
 */
const SEPARATOR = ' <';

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeName(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim();
}

const DOWNLOAD_HOST = 'https://api.unsplash.com/';

function isDownloadLocation(value: string): boolean {
  return value.startsWith(DOWNLOAD_HOST) && isHttpsUrl(value) && !/[<>\s]/.test(value);
}

/** The credit a raw frontmatter value denotes, or undefined when it does not denote one. */
export function parseCoverCredit(raw: string): CoverCredit | undefined {
  let value = raw.trim();
  let downloadLocation: string | undefined;

  // An optional trailing ` <download-location>` follows the profile URL.
  const trailing = value.match(/ <(https:\/\/api\.unsplash\.com\/[^<>\s]+)>$/);

  if (trailing && value.slice(0, trailing.index).endsWith('>')) {
    downloadLocation = trailing[1];
    value = value.slice(0, trailing.index);
  }

  if (!value.endsWith('>')) {
    return undefined;
  }

  const split = value.lastIndexOf(SEPARATOR);

  if (split <= 0) {
    return undefined;
  }

  const name = normalizeName(value.slice(0, split));
  const url = value.slice(split + SEPARATOR.length, -1).trim();

  if (name === '' || !isHttpsUrl(url)) {
    return undefined;
  }

  return downloadLocation ? { name, url, downloadLocation } : { name, url };
}

/** The frontmatter value for a credit, or undefined (key omitted) when it cannot be written faithfully. */
export function formatCoverCredit(credit: CoverCredit | null | undefined): string | undefined {
  if (!credit) {
    return undefined;
  }

  const name = normalizeName(credit.name);
  const url = credit.url.trim();

  if (name === '' || !isHttpsUrl(url) || /[<>\s]/.test(url)) {
    return undefined;
  }

  const download =
    credit.downloadLocation && isDownloadLocation(credit.downloadLocation)
      ? ` <${credit.downloadLocation}>`
      : '';

  return `${name}${SEPARATOR}${url}>${download}`;
}
