import { UnsplashRequestError, unsplashFailureKindForStatus } from './UnsplashRequestError';
import type { UnsplashPhoto } from './UnsplashPhoto';

/**
 * Unsplash is reached through Clutter's own proxy (workers/unsplash-proxy), a Cloudflare Worker that holds the Access
 * Key as a server-side secret. The app carries no key and sends no credentials: a request is a plain GET to the proxy.
 * The address is public and not secret; `VITE_UNSPLASH_PROXY_URL` overrides it (an empty value turns Unsplash off). If
 * it is changed, the app's `connect-src` in `src-tauri/tauri.conf.json` must allow the new origin too.
 */
export const DEFAULT_UNSPLASH_PROXY_URL = 'https://clutter-unsplash-proxy.vigram-work.workers.dev';

/**
 * Where Unsplash itself lives. Only used to recognise the `download_location` the API returned (which is stored with a
 * cover in the note's frontmatter, in Unsplash's own form, so it never depends on the proxy's address); it is never
 * requested directly.
 */
const UNSPLASH_API_ORIGIN = 'https://api.unsplash.com';
const DOWNLOAD_PATH = /^\/photos\/([A-Za-z0-9_-]+)\/download$/;
/** The photo shape asked for: what the surface showing it crops to best. */
export type UnsplashOrientation = 'landscape' | 'portrait' | 'squarish';
const DEFAULT_ORIENTATION: UnsplashOrientation = 'portrait';
/** Upper bound for shuffle-with-search — avoids unbounded page requests. */
export const UNSPLASH_SHUFFLE_MAX_PAGE = 10;

const DEFAULT_SEARCH_QUERIES = [
  'classical architecture',
  'old european architecture',
  'ornate architecture',
  'classical sculpture',
  'library interior',
  'vintage library',
  'antique books',
  'vintage flowers',
  'gradient background',
  'dark academia',
  'old newspaper',
  'classical still life',
  'fine art painting',
  'art museum interior',
  'art wallpaper',
  'antique interior',
  'vintage european street',
  'historic european town',
  'antique clock',
  'vintage ceramics',
  'antique pottery',
  'gradient',
] as const;

let lastDefaultPickIndex = -1;

function pickDefaultSearchQuery(): string {
  let index = Math.floor(Math.random() * DEFAULT_SEARCH_QUERIES.length);

  if (DEFAULT_SEARCH_QUERIES.length > 1 && index === lastDefaultPickIndex) {
    index = (index + 1) % DEFAULT_SEARCH_QUERIES.length;
  }

  lastDefaultPickIndex = index;

  return DEFAULT_SEARCH_QUERIES[index] ?? DEFAULT_SEARCH_QUERIES[0];
}

interface RawUnsplashPhoto {
  id: string;
  urls: {
    small: string;
    regular: string;
  };
  user: {
    name: string;
    links: {
      html: string;
    };
  };
  links: {
    download_location: string;
  };
}

/** The proxy's origin, or throws "not configured" (nothing is requested) when it is missing, malformed or not https. */
function getProxyBaseUrl(): string {
  const configured = import.meta.env.VITE_UNSPLASH_PROXY_URL;
  const value = (configured === undefined ? DEFAULT_UNSPLASH_PROXY_URL : configured).trim();

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new UnsplashRequestError('not-configured', 'Unsplash is not configured.');
  }

  // https only, except a local `wrangler dev` server; an origin only, with nothing appended.
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const isPlainOrigin = url.pathname === '/' && url.search === '' && url.hash === '' && url.username === '' && url.password === '';

  if (!isPlainOrigin || !(url.protocol === 'https:' || (url.protocol === 'http:' && isLocal))) {
    throw new UnsplashRequestError('not-configured', 'Unsplash is not configured.');
  }

  return url.origin;
}

function mapPhoto(photo: RawUnsplashPhoto): UnsplashPhoto {
  return {
    id: photo.id,
    urls: {
      small: photo.urls.small,
      regular: photo.urls.regular,
    },
    user: {
      name: photo.user.name,
      links: {
        html: photo.user.links.html,
      },
    },
    links: {
      downloadLocation: photo.links.download_location,
    },
  };
}

function throwIfNotOk(response: Response): void {
  if (!response.ok) {
    throw new UnsplashRequestError(
      unsplashFailureKindForStatus(response.status),
      `Unsplash request failed (${response.status}).`,
      response.status
    );
  }
}

/** The proxy's JSON, or a plain error when it answers with something else (an HTML page, a placeholder, nothing). */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new UnsplashRequestError('failed', 'Unsplash returned an unexpected response.');
  }
}

/** A plain GET to the proxy: no key, no custom headers (so the browser sends no preflight), no credentials. */
async function proxyFetch(url: URL): Promise<Response> {
  try {
    return await fetch(url);
  } catch {
    // Offline, DNS, the Worker down or blocked: no answer. The cause carries nothing the UI should show.
    throw new UnsplashRequestError('unreachable', 'Unsplash could not be reached.');
  }
}

/**
 * One photo by its API id (`GET /photos/:id`) — what a pasted photo-page link resolves to, so the cover gets the
 * same picture URL, photographer and download location a pick from the search results does.
 */
export async function getPhoto(id: string): Promise<UnsplashPhoto> {
  const response = await proxyFetch(new URL(`${getProxyBaseUrl()}/photos/${encodeURIComponent(id)}`));

  throwIfNotOk(response);

  return mapPhoto((await readJson(response)) as RawUnsplashPhoto);
}

export async function searchPhotos(
  query: string,
  page = 1,
  orientation: UnsplashOrientation = DEFAULT_ORIENTATION
): Promise<UnsplashPhoto[]> {
  const trimmed = query.trim() || pickDefaultSearchQuery();

  const url = new URL(`${getProxyBaseUrl()}/search/photos`);

  // The page size is the proxy's to fix; the app does not send one.
  url.searchParams.set('query', trimmed);
  url.searchParams.set('page', String(page));
  url.searchParams.set('orientation', orientation);

  const response = await proxyFetch(url);

  throwIfNotOk(response);

  const payload = (await readJson(response)) as { results?: RawUnsplashPhoto[] } | null;

  if (!payload || !Array.isArray(payload.results)) {
    throw new UnsplashRequestError('failed', 'Unsplash returned an unexpected response.');
  }

  return payload.results.map(mapPhoto);
}

/**
 * Reports a committed photo selection to Unsplash (their "trigger a
 * download" requirement), through the proxy. Fire-and-forget by design: it
 * never rejects, so a failed or blocked tracking call can't lose the user's
 * selected cover or surface as an unhandled rejection. `downloadLocation` must
 * be the exact `links.download_location` value from the API (query parameters
 * intact), in Unsplash's own form as stored with the cover; only the photo id
 * and its `ixid` are taken from it and asked of the proxy, and anything that is
 * not a download location on the Unsplash API host is ignored.
 *
 * Resolves true only when the proxy answered with a success status — sending
 * the request is not the same as it being recorded. A non-2xx answer, a
 * network error or a missing proxy address resolves false (logged); the
 * selection itself is never affected.
 */
export async function trackPhotoDownload(
  downloadLocation: string
): Promise<boolean> {
  try {
    const location = new URL(downloadLocation);
    const photoId = location.origin === UNSPLASH_API_ORIGIN ? DOWNLOAD_PATH.exec(location.pathname)?.[1] : undefined;

    if (!photoId) {
      return false;
    }

    const url = new URL(`${getProxyBaseUrl()}/photos/${encodeURIComponent(photoId)}/download`);
    const ixid = location.searchParams.get('ixid');

    if (ixid) {
      url.searchParams.set('ixid', ixid);
    }

    const response = await proxyFetch(url);

    if (!response.ok) {
      console.warn(
        `Unsplash download tracking was not accepted (${response.status}).`
      );
    }

    return response.ok;
  } catch (error) {
    console.warn(
      'Unsplash download tracking failed.',
      error instanceof Error ? error.message : error
    );

    return false;
  }
}
