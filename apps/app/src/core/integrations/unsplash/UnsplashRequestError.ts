/**
 * Why a request to the Unsplash proxy failed, as a kind the UI can word without reading a message:
 * - `rate-limited`: the proxy answered 429 (its per-client limit, or Unsplash's own).
 * - `unavailable`: the proxy answered 5xx (it, or Unsplash behind it, is failing: 502, 503, 504, …).
 * - `unreachable`: no answer at all (offline, DNS, the Worker down, a blocked connection).
 * - `not-configured`: the app has no usable proxy address; nothing was requested.
 * - `not-found`: the proxy answered 404 (or refused the id as malformed, 400): the photo does not exist.
 * - `failed`: anything else — another status, or an answer that was not what the proxy sends.
 */
export type UnsplashFailureKind = 'rate-limited' | 'unavailable' | 'unreachable' | 'not-configured' | 'not-found' | 'failed';

/** A failed Unsplash request. `message` is for developers and logs only; the UI words `kind` (see the pickers). */
export class UnsplashRequestError extends Error {
  readonly kind: UnsplashFailureKind;
  /** The HTTP status when the proxy answered. */
  readonly status: number | undefined;

  constructor(kind: UnsplashFailureKind, message: string, status?: number) {
    super(message);
    this.name = 'UnsplashRequestError';
    this.kind = kind;
    this.status = status;
  }
}

export function unsplashFailureKindForStatus(status: number): UnsplashFailureKind {
  if (status === 429) return 'rate-limited';
  if (status === 404 || status === 400) return 'not-found';
  if (status >= 500) return 'unavailable';

  return 'failed';
}
