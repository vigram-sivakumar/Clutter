import type { UnsplashPhoto } from './UnsplashPhoto';

const UNSPLASH_API_URL = 'https://api.unsplash.com';
const PAGE = '1';
const PER_PAGE = '30';
const ORIENTATION = 'portrait';

const DEFAULT_SEARCH_QUERIES = [
  'art wallpaper',
  'nature',
  'landscape',
  'mountains',
  'ocean',
  'movies',
  'books',
  'architecture',
  'minimal',
  'sunset',
  'forest',
  'flowers',
] as const;

function pickDefaultSearchQuery(): string {
  const index = Math.floor(Math.random() * DEFAULT_SEARCH_QUERIES.length);

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

export async function searchPhotos(query: string): Promise<UnsplashPhoto[]> {
  const trimmed = query.trim() || pickDefaultSearchQuery();

  const url = new URL(`${UNSPLASH_API_URL}/search/photos`);

  url.searchParams.set('query', trimmed);
  url.searchParams.set('page', PAGE);
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
