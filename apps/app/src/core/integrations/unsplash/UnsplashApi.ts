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

export async function trackPhotoDownload(
  downloadLocation: string
): Promise<void> {
  const response = await unsplashFetch(new URL(downloadLocation));

  if (!response.ok) {
    return;
  }
}
