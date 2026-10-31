import { sanitizePhoto, sanitizeSearch } from './sanitize';
import { PER_PAGE, parseRequest, type Route } from './validation';

/**
 * Clutter's Unsplash proxy. The Unsplash Access Key lives here, as the `UNSPLASH_ACCESS_KEY` secret binding, and
 * nowhere in the app. The proxy offers exactly the three Unsplash operations Clutter uses, each built from validated
 * input only:
 *
 *   GET /search/photos?query=&page=&orientation=   -> Unsplash GET /search/photos   (per_page fixed)
 *   GET /photos/:id                                -> Unsplash GET /photos/:id
 *   GET /photos/:id/download[?ixid=]               -> Unsplash GET /photos/:id/download (the "trigger a download" call)
 *   GET /health                                    -> {"ok":true}; calls nothing
 *
 * The upstream host and every upstream path are constants or are built from values that passed validation.rs-style
 * allow-lists in validation.ts; no client header, cookie or body is forwarded, and the key is only ever sent to
 * api.unsplash.com in an Authorization header, never logged, never returned.
 */

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  /** Secret binding. Set with `wrangler secret put UNSPLASH_ACCESS_KEY`; never a plain variable. */
  readonly UNSPLASH_ACCESS_KEY?: string;
  /** Comma-separated exact origins that may call the proxy from a browser (CORS). */
  readonly ALLOWED_ORIGINS?: string;
  /** Per-client rate limit. Absent in local tests and `wrangler dev` without the binding: then no limit is applied. */
  readonly RATE_LIMITER?: RateLimiter;
}

const UPSTREAM = 'https://api.unsplash.com';
const UPSTREAM_TIMEOUT_MS = 8000;
const RETRY_AFTER_SECONDS = '60';

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

function allowedOrigins(env: Env): ReadonlySet<string> {
  return new Set(
    (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== '')
  );
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const headers: Record<string, string> = { Vary: 'Origin' };

  if (origin !== null && allowedOrigins(env).has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Max-Age'] = '600';
  }

  return headers;
}

function respond(body: unknown, status: number, request: Request, env: Env, extra: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(request, env),
      ...extra,
    },
  });
}

const failure = (status: number, error: string, request: Request, env: Env, extra: Record<string, string> = {}) =>
  respond({ error }, status, request, env, extra);

function upstreamUrl(route: Exclude<Route, { kind: 'health' }>): URL {
  switch (route.kind) {
    case 'search': {
      const url = new URL(`${UPSTREAM}/search/photos`);

      url.searchParams.set('query', route.query);
      url.searchParams.set('page', String(route.page));
      url.searchParams.set('per_page', String(PER_PAGE));
      url.searchParams.set('orientation', route.orientation);

      return url;
    }
    case 'photo':
      return new URL(`${UPSTREAM}/photos/${route.id}`);
    case 'download': {
      const url = new URL(`${UPSTREAM}/photos/${route.id}/download`);

      if (route.ixid !== null) url.searchParams.set('ixid', route.ixid);

      return url;
    }
  }
}

/** What the client is told about an upstream status. The upstream body and headers are never passed on. */
function mapUpstreamStatus(status: number): { status: number; error: string } {
  if (status === 404) return { status: 404, error: 'not_found' };
  if (status === 403 || status === 429) return { status: 429, error: 'rate_limited' };

  return { status: 502, error: 'upstream_error' };
}

/** A log line with no secret and no user data: the kind of event and a status, never a query, an id or a key. */
function log(event: string, detail: Record<string, string | number | boolean> = {}): void {
  console.warn(JSON.stringify({ event, ...detail }));
}

/** An exception's class name only when it is one of the standard ones, so a custom name cannot carry request data. */
function safeErrorName(error: unknown): string {
  const name = error instanceof Error ? error.name : '';

  return ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'DOMException', 'AbortError', 'TimeoutError'].includes(name) ? name : 'Other';
}

/**
 * Why a request to Unsplash threw, as one of a fixed set of words. The exception's name and message are read here to
 * choose the word and are never logged or returned: only the word leaves this function, so no part of the request
 * (the key, a URL, a search term) can reach a log through an error.
 */
export type FailureCategory = 'invalid_header' | 'redirect' | 'dns' | 'tls' | 'connection' | 'unknown';

function failureCategory(error: unknown): FailureCategory {
  const texts: string[] = [];

  for (let current: unknown = error, depth = 0; current instanceof Error && depth < 3; current = current.cause, depth += 1) {
    texts.push(`${current.name} ${current.message}`.toLowerCase());
  }

  const text = texts.join(' ');

  if (/invalid.*header|header.*(invalid|value|name)/.test(text)) return 'invalid_header';
  if (/redirect/.test(text)) return 'redirect';
  if (/dns|hostname|name not resolved|getaddrinfo|enotfound/.test(text)) return 'dns';
  if (/tls|ssl|certificate|handshake/.test(text)) return 'tls';
  if (/network|connect|connection|reset|refused|econn|socket|closed|fetch failed/.test(text)) return 'connection';

  return 'unknown';
}

/**
 * Facts about the stored secret's shape, as yes/no answers and a length. A secret saved with a trailing newline, quotes
 * or a pasted `Client-ID ` prefix makes an invalid or wrong header, and these tell that apart from a network failure
 * without the value itself being logged. The length is safe to log: an Unsplash Access Key is a fixed-size token, and
 * knowing its length gives no help in guessing it.
 */
export function keyShape(key: string): Record<string, boolean | number> {
  return {
    keyHasWhitespace: /\s/.test(key),
    keyHasQuote: /^["']|["']$/.test(key),
    keyNonAscii: /[^\x20-\x7e]/.test(key),
    keyHasPrefix: /^client-id\b/i.test(key.trim()),
    keyLength: key.length,
  };
}

export async function handle(request: Request, env: Env, fetcher: Fetcher = fetch): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'GET, OPTIONS', ...corsHeaders(request, env) } });
  }

  const parsed = parseRequest(request.method, new URL(request.url));

  if (!parsed.ok) {
    return failure(parsed.status, parsed.error, request, env, parsed.status === 405 ? { Allow: 'GET, OPTIONS' } : {});
  }

  const { route } = parsed;

  if (route.kind === 'health') {
    return respond({ ok: true }, 200, request, env);
  }

  if (env.RATE_LIMITER) {
    const client = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.RATE_LIMITER.limit({ key: client });

    if (!success) {
      return failure(429, 'rate_limited', request, env, { 'Retry-After': RETRY_AFTER_SECONDS });
    }
  }

  const accessKey = env.UNSPLASH_ACCESS_KEY;

  if (!accessKey) {
    log('not_configured');

    return failure(500, 'not_configured', request, env);
  }

  // Stage 1, no network: build the request. A header value that is not valid (for example a secret saved with a
  // newline) throws here, which `new Headers` makes happen before `fetch` rather than inside it.
  let url: string;
  let init: RequestInit;

  try {
    url = upstreamUrl(route).toString();
    init = {
      method: 'GET',
      // Only these two headers, built here. Nothing the client sent (cookies, authorization, ...) is forwarded.
      headers: new Headers({ Authorization: `Client-ID ${accessKey}`, 'Accept-Version': 'v1' }),
      // Not 'error': Cloudflare's runtime rejects that value (only 'follow' and 'manual'), which made every call throw.
      // 'manual' hands a 3xx back as a response, which is refused below rather than followed.
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    };
  } catch (error) {
    log('upstream_unreachable', {
      route: route.kind,
      phase: 'request',
      errorName: safeErrorName(error),
      category: failureCategory(error),
      ...keyShape(accessKey),
    });

    return failure(502, 'upstream_error', request, env);
  }

  // Stage 2: the call to Unsplash.
  let upstream: Response;

  try {
    upstream = await fetcher(url, init);
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

    if (timedOut) {
      log('upstream_timeout', { route: route.kind, phase: 'fetch' });

      return failure(504, 'upstream_timeout', request, env);
    }

    log('upstream_unreachable', {
      route: route.kind,
      phase: 'fetch',
      errorName: safeErrorName(error),
      category: failureCategory(error),
      ...keyShape(accessKey),
    });

    return failure(502, 'upstream_error', request, env);
  }

  // Unsplash's API does not redirect. If it does, the target is not followed, logged or returned.
  if (upstream.status >= 300 && upstream.status < 400) {
    log('upstream_redirect', { route: route.kind, status: upstream.status });

    return failure(502, 'upstream_error', request, env);
  }

  if (!upstream.ok) {
    const mapped = mapUpstreamStatus(upstream.status);

    log('upstream_status', { route: route.kind, status: upstream.status });

    return failure(mapped.status, mapped.error, request, env, mapped.status === 429 ? { 'Retry-After': RETRY_AFTER_SECONDS } : {});
  }

  // The download call is a side effect on Unsplash's side; its body (an image URL) is not needed and is not returned.
  if (route.kind === 'download') {
    return respond({ ok: true }, 200, request, env);
  }

  let payload: unknown;

  try {
    payload = await upstream.json();
  } catch {
    log('upstream_invalid_json', { route: route.kind });

    return failure(502, 'upstream_error', request, env);
  }

  const body = route.kind === 'search' ? sanitizeSearch(payload) : sanitizePhoto(payload);

  if (body === null) {
    log('upstream_unexpected_shape', { route: route.kind });

    return failure(route.kind === 'photo' ? 404 : 502, route.kind === 'photo' ? 'not_found' : 'upstream_error', request, env);
  }

  return respond(body, 200, request, env);
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handle(request, env),
} satisfies ExportedHandler<Env>;
