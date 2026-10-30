/**
 * Keeps cover images loaded and decoded in memory, so opening a note shows its cover at once instead of after a
 * blank moment. The HTTP cache already stops a second download (Unsplash serves a year's max-age), but a cached
 * image still has to be found, read and decoded — tens to hundreds of milliseconds for a 4800px photo — and the
 * engine may drop a decoded picture whenever it likes. Holding an `Image` for it keeps it available.
 *
 * Bounded: at most `MAX_RETAINED` covers, least recently used dropped first (a 4800px photo is about 60 MB decoded).
 */
const MAX_RETAINED = 24;

/** How long one background load may take before the warm-up moves on to the next. */
const WARM_STEP_TIMEOUT_MS = 15_000;

const retained = new Map<string, HTMLImageElement>();

/** Drops `image`'s entry — but only while it is still the one held for `url`, so a newer entry is never lost. */
function evictIfStillHeld(url: string, image: HTMLImageElement): void {
  if (retained.get(url) === image) {
    retained.delete(url);
  }
}

/**
 * Resolves when the image is decoded (an engine without `decode()` just lets the load run). Never rejects. A load or
 * decode that fails releases its entry, so a network blip or a bad response is not held forever: the next ask for
 * that address starts a fresh load instead of reusing a broken image.
 */
function decoded(url: string, image: HTMLImageElement): Promise<void> {
  image.onerror = () => evictIfStillHeld(url, image);

  return typeof image.decode === 'function'
    ? image.decode().catch(() => evictIfStillHeld(url, image))
    : Promise.resolve();
}

/**
 * Starts loading and decoding `url` and holds on to it. Asking again for a held one only marks it recently used.
 * `priority: 'low'` is for covers nobody is looking at yet, so they never compete with what is on screen.
 * Resolves when the image is decoded (or failed — the cover itself reports its own failure); never rejects.
 */
export function preloadCoverImage(url: string | null | undefined, priority: 'high' | 'low' = 'high'): Promise<void> {
  if (typeof Image === 'undefined' || !url) {
    return Promise.resolve();
  }

  const existing = retained.get(url);

  if (existing) {
    retained.delete(url);
    retained.set(url, existing);
    return decoded(url, existing);
  }

  const image = new Image();
  image.decoding = 'async';
  if (priority === 'low') {
    image.setAttribute('fetchpriority', 'low');
  }
  image.src = url;

  retained.set(url, image);
  while (retained.size > MAX_RETAINED) {
    const oldest = retained.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    retained.delete(oldest);
  }

  return decoded(url, image);
}

/**
 * Lets go of `url` — a cover that was removed, or failed to load. Anything else showing the same address simply loads
 * it again, from the HTTP cache or the network, when it next needs it.
 */
export function releaseCoverImage(url: string | null | undefined): void {
  if (url) {
    retained.delete(url);
  }
}

/** Whether `url` is held right now — for tests. */
export function isCoverImageRetained(url: string): boolean {
  return retained.has(url);
}

/** Drops everything held — for tests. */
export function clearRetainedCoverImages(): void {
  retained.clear();
}

/**
 * Warms `urls` one after another (never in parallel, so a few large photos cannot saturate the connection),
 * each at low priority, moving on when one is decoded, fails or takes too long. Stops early when `isCancelled`
 * turns true.
 */
export async function warmCoverImages(urls: readonly string[], isCancelled: () => boolean = () => false): Promise<void> {
  for (const url of urls) {
    if (isCancelled()) {
      return;
    }

    await Promise.race([
      preloadCoverImage(url, 'low'),
      new Promise<void>((resolve) => setTimeout(resolve, WARM_STEP_TIMEOUT_MS)),
    ]);
  }
}
