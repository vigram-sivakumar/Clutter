import type { UnsplashPhoto } from './UnsplashPhoto';

const UNSPLASH_API_URL = 'https://api.unsplash.com';
const PER_PAGE = '30';
const ORIENTATION = 'portrait';
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

function getAccessKey(): string {
  // Bundled via VITE_* in the client. A server-side proxy would hide the key
  // in production; that is intentionally out of scope for this integration.
  const accessKey = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;

  if (!accessKey) {
    throw new Error('Unsplash is not configured.');
  }

  return accessKey;
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
    throw new Error(`Unsplash request failed (${response.status}).`);
  }
}

async function unsplashFetch(url: URL): Promise<Response> {
  return fetch(url, {
    headers: {
      Authorization: `Client-ID ${getAccessKey()}`,
      'Accept-Version': 'v1',
    },
  });
}

export async function searchPhotos(
  query: string,
  page = 1
): Promise<UnsplashPhoto[]> {
  const trimmed = query.trim() || pickDefaultSearchQuery();

  const url = new URL(`${UNSPLASH_API_URL}/search/photos`);

  url.searchParams.set('query', trimmed);
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', PER_PAGE);
  url.searchParams.set('orientation', ORIENTATION);

  const response = await unsplashFetch(url);

  throwIfNotOk(response);

  const payload = (await response.json()) as { results: RawUnsplashPhoto[] };

  return payload.results.map(mapPhoto);
}

/**
 * Reports a committed photo selection to Unsplash (their "trigger a
 * download" requirement). Fire-and-forget by design: it never rejects, so a
 * failed or blocked tracking call can't lose the user's selected cover or
 * surface as an unhandled rejection. `downloadLocation` must be the exact
 * `links.download_location` value from the API (query parameters intact);
 * anything not on the Unsplash API host is ignored so the Authorization
 * header can't be sent elsewhere.
 *
 * Resolves true only when Unsplash answered with a success status — sending
 * the request is not the same as it being recorded. A non-2xx answer, a
 * network error or a missing key resolves false (logged without the key);
 * the selection itself is never affected.
 */
export async function trackPhotoDownload(
  downloadLocation: string
): Promise<boolean> {
  try {
    const url = new URL(downloadLocation);

    if (url.origin !== UNSPLASH_API_URL) {
      return false;
    }

    const response = await unsplashFetch(url);

    if (!response.ok) {
      console.warn(`Unsplash download tracking was not accepted (${response.status}).`);
    }

    return response.ok;
  } catch (error) {
    console.warn('Unsplash download tracking failed.', error instanceof Error ? error.message : error);

    return false;
  }
}
