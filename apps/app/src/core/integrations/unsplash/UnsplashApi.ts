import type { UnsplashPhoto } from './UnsplashPhoto';

const UNSPLASH_API_URL = 'https://api.unsplash.com';

function getAccessKey(): string {
  const accessKey = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;

  if (!accessKey) {
    throw new Error('Unsplash access key is not configured.');
  }

  return accessKey;
}

export async function listPhotos(): Promise<UnsplashPhoto[]> {
  const url = new URL(`${UNSPLASH_API_URL}/photos`);

  url.searchParams.set('page', '1');
  url.searchParams.set('per_page', '30');

  const response = await fetch(url, {
    headers: {
      Authorization: `Client-ID ${getAccessKey()}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Unsplash request failed: ${response.status}`);
  }

  return (await response.json()) as UnsplashPhoto[];
}
