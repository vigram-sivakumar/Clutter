import { isUnsplashImageUrl } from './unsplashAttribution';
import { listEditorialPhotos } from './UnsplashApi';
import type { UnsplashPhoto } from './UnsplashPhoto';

/**
 * The picker's default photos (Unsplash's Editorial feed, one page of 30), saved in `localStorage` so they are fetched
 * once and shown everywhere after: any note, any later opening, after a restart. Nothing refreshes them on its own (no
 * timer, no reopening, no note switch); only `refreshEditorialPhotos` — the Shuffle button — fetches again and
 * replaces them, and a failed fetch leaves the saved photos as they were. A search never touches this.
 *
 * Only what rendering, the credit and a selection need is stored (no image bytes, no key). Stored data is not trusted:
 * anything that is not a list of well-formed photos reads as "no cache".
 */
const EDITORIAL_STORAGE_KEY = 'clutter-unsplash-editorial';

function isStoredPhoto(value: unknown): value is UnsplashPhoto {
  const photo = value as UnsplashPhoto | null;

  return (
    typeof photo?.id === 'string' &&
    isUnsplashImageUrl(photo.urls?.small) &&
    isUnsplashImageUrl(photo.urls?.regular) &&
    typeof photo.user?.name === 'string' &&
    photo.user.links?.html?.startsWith('https://') === true &&
    photo.links?.downloadLocation?.startsWith('https://api.unsplash.com/') === true
  );
}

/** The saved Editorial photos, or null when there are none or what is stored is missing or unusable. */
export function readEditorialCache(): UnsplashPhoto[] | null {
  try {
    const stored = JSON.parse(localStorage.getItem(EDITORIAL_STORAGE_KEY) ?? 'null') as unknown;

    return Array.isArray(stored) && stored.length > 0 && stored.every(isStoredPhoto) ? stored : null;
  } catch {
    return null;
  }
}

function writeEditorialCache(photos: UnsplashPhoto[]): void {
  try {
    localStorage.setItem(EDITORIAL_STORAGE_KEY, JSON.stringify(photos));
  } catch {
    // Storage full or unavailable: the photos still show this time, and are fetched again next time.
  }
}

/** The one fetch in progress, so pickers opening together share a single request. */
let inFlight: Promise<UnsplashPhoto[]> | null = null;

/** The saved photos, or (first time only) one fetch of `page` that is then saved. Never fetches when photos are saved. */
export function loadEditorialPhotos(page: number): Promise<UnsplashPhoto[]> {
  const cached = readEditorialCache();

  return cached ? Promise.resolve(cached) : refreshEditorialPhotos(page);
}

/** Fetches `page` of the Editorial feed and, only if that succeeds, replaces the saved photos with it. */
export function refreshEditorialPhotos(page: number): Promise<UnsplashPhoto[]> {
  inFlight ??= listEditorialPhotos(page)
    .then((photos) => {
      if (photos.length > 0) {
        writeEditorialCache(photos);
      }

      return photos;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
