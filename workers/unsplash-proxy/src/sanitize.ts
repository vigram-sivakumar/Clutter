import { IXID_PATTERN, PHOTO_ID_PATTERN } from './validation';

/**
 * What the proxy returns for one photo: exactly the fields Clutter uses, in Unsplash's own field names. Nothing else
 * from the upstream response is passed on (no rate-limit data, no sponsorship objects, no extra links).
 *
 * Attribution is preserved, never rewritten (Unsplash API guidelines): the photographer's name and profile link are
 * returned as Unsplash sent them (the app adds the referral parameters when it displays them), the image URLs keep
 * their `ixid` and every other parameter so the app can hotlink them, and `download_location` is returned unchanged:
 * the app stores that exact value with the cover and later reports the download through the proxy.
 */
export interface ProxiedPhoto {
  readonly id: string;
  readonly urls: { readonly small: string; readonly regular: string };
  readonly user: { readonly name: string; readonly links: { readonly html: string } };
  readonly links: { readonly download_location: string };
}

const IMAGE_HOSTS: ReadonlySet<string> = new Set(['images.unsplash.com', 'plus.unsplash.com']);
const PAGE_HOSTS: ReadonlySet<string> = new Set(['unsplash.com', 'www.unsplash.com']);
const MAX_URL = 2048;
const MAX_NAME = 200;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function httpsUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL) return null;

  try {
    const url = new URL(value);

    return url.protocol === 'https:' && url.username === '' && url.password === '' ? url : null;
  } catch {
    return null;
  }
}

function imageUrl(value: unknown): string | null {
  const url = httpsUrl(value);

  return url && IMAGE_HOSTS.has(url.hostname) ? (value as string) : null;
}

function profileUrl(value: unknown): string | null {
  const url = httpsUrl(value);

  return url && PAGE_HOSTS.has(url.hostname) ? (value as string) : null;
}

/** `https://api.unsplash.com/photos/<id>/download?ixid=…`: the one shape Unsplash returns, and nothing broader. */
function downloadLocation(value: unknown, id: string): string | null {
  const url = httpsUrl(value);

  if (!url || url.hostname !== 'api.unsplash.com' || url.port !== '' || url.hash !== '') return null;
  if (url.pathname !== `/photos/${id}/download`) return null;

  for (const [name, parameter] of url.searchParams) {
    if (name !== 'ixid' || !IXID_PATTERN.test(parameter)) return null;
  }

  return value as string;
}

/** The photo as the proxy returns it, or `null` when the upstream object is not a photo this proxy will vouch for. */
export function sanitizePhoto(raw: unknown): ProxiedPhoto | null {
  const photo = record(raw);

  if (!photo) return null;

  const id = photo.id;

  if (typeof id !== 'string' || !PHOTO_ID_PATTERN.test(id)) return null;

  const urls = record(photo.urls);
  const user = record(photo.user);
  const userLinks = record(user?.links);
  const links = record(photo.links);

  const small = imageUrl(urls?.small);
  const regular = imageUrl(urls?.regular);
  const html = profileUrl(userLinks?.html);
  const download = downloadLocation(links?.download_location, id);
  const name = typeof user?.name === 'string' ? user.name.replace(CONTROL_CHARACTERS, '').trim().slice(0, MAX_NAME) : '';

  if (!small || !regular || !html || !download || name === '') return null;

  return {
    id,
    urls: { small, regular },
    user: { name, links: { html } },
    links: { download_location: download },
  };
}

export function sanitizeSearch(raw: unknown): { results: ProxiedPhoto[] } | null {
  const payload = record(raw);

  if (!payload || !Array.isArray(payload.results)) return null;

  const results: ProxiedPhoto[] = [];

  for (const entry of payload.results) {
    const photo = sanitizePhoto(entry);

    if (photo) results.push(photo);
  }

  return { results };
}
