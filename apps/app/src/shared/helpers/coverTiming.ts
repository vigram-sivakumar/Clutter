/**
 * An opt-in diagnostic for "the cover appears late when a note opens": set `localStorage['clutter:cover-timing'] = '1'`
 * (then reload) and every cover image logs the stages it goes through, in milliseconds since the navigation that
 * opened its note, as `[cover-timing] {...}` on the console and in `window.__coverTiming`. Off by default and free
 * when off: nothing is measured, no extra decode is made.
 *
 * Stages: `navToMount` (page selected → the cover's `<img>` exists), `completeAtMount` (already loaded when it
 * mounted), `retained` (the preloader already held this address), `load` (the load event), `decoded` (the first
 * `decode()` after mount resolved — what the picture needs before it can paint), `painted` (two frames later).
 */
const STORAGE_KEY = 'clutter:cover-timing';

export function isCoverTimingEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let navigationTarget: string | null = null;
let navigationAt = 0;

/** The page `target` was just selected: later stages are timed from here. Repeats for the same target are ignored. */
export function markCoverNavigation(target: string | null): void {
  if (!isCoverTimingEnabled() || target === navigationTarget) {
    return;
  }
  navigationTarget = target;
  navigationAt = performance.now();
}

const traced = new WeakMap<HTMLImageElement, string>();

function emit(record: Record<string, unknown>): void {
  const store = ((globalThis as { __coverTiming?: unknown[] }).__coverTiming ??= []);
  store.push(record);
  console.info('[cover-timing]', JSON.stringify(record));
}

/** Times one cover `<img>` (once per element and address). A no-op unless the diagnostic is on. */
export function traceCoverImage(img: HTMLImageElement, { src, retained }: { src: string; retained: boolean }): void {
  if (!isCoverTimingEnabled() || traced.get(img) === src) {
    return;
  }
  traced.set(img, src);

  const now = performance.now();
  const since = (t: number) => Math.round(t - navigationAt);
  const record: Record<string, unknown> = {
    src: src.length > 90 ? `${src.slice(0, 60)}…${src.slice(-24)}` : src,
    navToMount: navigationAt > 0 ? since(now) : null,
    completeAtMount: img.complete && img.naturalWidth > 0,
    retained,
    pixels: img.naturalWidth > 0 ? `${img.naturalWidth}x${img.naturalHeight}` : null,
  };

  img.addEventListener('load', () => (record['load'] = Math.round(performance.now() - now)), { once: true });

  const decoded = typeof img.decode === 'function' ? img.decode() : Promise.resolve();
  decoded
    .then(
      () => {
        record['decoded'] = Math.round(performance.now() - now);
      },
      () => {
        record['decodeFailed'] = true;
      }
    )
    .then(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              record['painted'] = Math.round(performance.now() - now);
              resolve();
            })
          )
        )
    )
    .then(() => emit({ ...record, unit: 'ms since the img mounted (navToMount: since the page was selected)' }));
}
