import { afterEach, describe, expect, it, vi } from 'vitest';

import worker from '../src/index';
import { ENV, ORIGIN, SECRET, call, everything, json, rawPhoto, request, upstream } from './support';

afterEach(() => vi.restoreAllMocks());

describe('GET /search/photos', () => {
  it('asks Unsplash for exactly the validated search, with the key only in the Authorization header', async () => {
    const { response, calls } = await call('/search/photos?query=old+library&page=3&orientation=landscape');

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url.origin).toBe('https://api.unsplash.com');
    expect(url.pathname).toBe('/search/photos');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      query: 'old library',
      page: '3',
      per_page: '30',
      orientation: 'landscape',
    });
    expect(url.toString()).not.toContain(SECRET);
    expect(new Headers(init.headers).get('Authorization')).toBe(`Client-ID ${SECRET}`);
  });

  it('defaults to page 1 and portrait, as the app does, and fixes the page size itself', async () => {
    const { calls } = await call('/search/photos?query=flowers');

    expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({
      query: 'flowers',
      page: '1',
      per_page: '30',
      orientation: 'portrait',
    });
  });

  it('returns only the fields Clutter uses, in Unsplash’s own names', async () => {
    const { response } = await call('/search/photos?query=flowers');

    expect(await response.json()).toEqual({
      results: [
        {
          id: 'LBI7cgq3pbM',
          urls: {
            small: 'https://images.unsplash.com/photo-1?ixlib=rb-4.0.3&ixid=IX1&w=400&q=80',
            regular: 'https://images.unsplash.com/photo-1?ixlib=rb-4.0.3&ixid=IX1&w=1080&q=80',
          },
          user: { name: 'Alex Doe', links: { html: 'https://unsplash.com/@alex' } },
          links: { download_location: 'https://api.unsplash.com/photos/LBI7cgq3pbM/download?ixid=MnwxMjA3fDB8MXxzZWFyY2h8' },
        },
      ],
    });
  });

  it('keeps every attribution field exactly as Unsplash sent it, so the app can credit and report the photo', async () => {
    const { response } = await call('/search/photos?query=flowers');
    const [photo] = ((await response.json()) as { results: ReturnType<typeof rawPhoto>[] }).results as any[];
    const original = rawPhoto() as any;

    expect(photo.user.name).toBe(original.user.name);
    expect(photo.user.links.html).toBe(original.user.links.html);
    expect(photo.links.download_location).toBe(original.links.download_location); // stored with the cover by the app
    expect(photo.urls.regular).toBe(original.urls.regular); // hotlinked as given: ixid and every parameter intact
  });

  it('drops a photo it cannot vouch for rather than passing it on: foreign hosts, scripts, a download link for another photo', async () => {
    const good = rawPhoto();
    const reply = () =>
      json({
        results: [
          rawPhoto({ id: 'AAAAAAAAAAA', urls: { small: 'https://evil.example/x.jpg', regular: 'https://images.unsplash.com/ok' }, links: { download_location: 'https://api.unsplash.com/photos/AAAAAAAAAAA/download?ixid=a' } }),
          rawPhoto({ id: 'BBBBBBBBBBB', user: { name: 'Eve', links: { html: 'javascript:alert(1)' } }, links: { download_location: 'https://api.unsplash.com/photos/BBBBBBBBBBB/download?ixid=a' } }),
          rawPhoto({ id: 'CCCCCCCCCCC', links: { download_location: 'https://api.unsplash.com/photos/ZZZZZZZZZZZ/download?ixid=a' } }),
          rawPhoto({ id: 'DDDDDDDDDDD', links: { download_location: 'https://evil.example/photos/DDDDDDDDDDD/download?ixid=a' } }),
          rawPhoto({ id: 'EEEEEEEEEEE', links: { download_location: 'https://api.unsplash.com/photos/EEEEEEEEEEE/download?ixid=a&client_id=x' } }),
          rawPhoto({ id: '../../etc', urls: { small: 'https://images.unsplash.com/a', regular: 'https://images.unsplash.com/b' } }),
          'not an object',
          null,
          good,
        ],
      });
    const { response } = await call('/search/photos?query=flowers', { reply });

    const ids = ((await response.json()) as { results: { id: string }[] }).results.map((photo) => photo.id);
    expect(ids).toEqual(['LBI7cgq3pbM']);
  });

  it('puts the query into one encoded parameter, whatever characters it holds', async () => {
    const { calls } = await call(`/search/photos?query=${encodeURIComponent('a&b=c#d/../e?f')}`);

    const { url } = calls[0]!;
    expect([...url.searchParams.keys()].sort()).toEqual(['orientation', 'page', 'per_page', 'query']);
    expect(url.searchParams.get('query')).toBe('a&b=c#d/../e?f');
    expect(url.pathname).toBe('/search/photos');
    expect(url.hash).toBe('');
  });
});

describe('GET /photos/:id', () => {
  it('returns the one photo, trimmed, from Unsplash’s /photos/:id', async () => {
    const { response, calls } = await call('/photos/LBI7cgq3pbM', { reply: () => json(rawPhoto()) });

    expect(calls[0]!.url.toString()).toBe('https://api.unsplash.com/photos/LBI7cgq3pbM');
    expect(response.status).toBe(200);
    const photo = (await response.json()) as any;
    expect(Object.keys(photo).sort()).toEqual(['id', 'links', 'urls', 'user']);
    expect(photo.links).toEqual({ download_location: 'https://api.unsplash.com/photos/LBI7cgq3pbM/download?ixid=MnwxMjA3fDB8MXxzZWFyY2h8' });
  });

  it('answers 404 when Unsplash does not know the photo, or answers with something that is not a photo', async () => {
    expect((await call('/photos/LBI7cgq3pbM', { reply: () => json({ errors: ['Not Found'] }, 404) })).response.status).toBe(404);
    expect((await call('/photos/LBI7cgq3pbM', { reply: () => json({ hello: 'world' }) })).response.status).toBe(404);
  });
});

describe('GET /photos/:id/download', () => {
  it('reports the download to Unsplash with the ixid and returns only {ok:true}', async () => {
    const { response, calls } = await call('/photos/LBI7cgq3pbM/download?ixid=MnwxMjA3fDB8MXxzZWFyY2h8', {
      reply: () => json({ url: 'https://images.unsplash.com/secret-link?token=abc' }),
    });

    expect(calls[0]!.url.toString()).toBe('https://api.unsplash.com/photos/LBI7cgq3pbM/download?ixid=MnwxMjA3fDB8MXxzZWFyY2h8');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('works without an ixid, and refuses an upstream rejection as an error, not a success', async () => {
    const { calls } = await call('/photos/LBI7cgq3pbM/download');
    expect(calls[0]!.url.search).toBe('');

    const rejected = await call('/photos/LBI7cgq3pbM/download?ixid=abc', { reply: () => json({ errors: ['x'] }, 500) });
    expect(rejected.response.status).toBe(502);
  });
});

describe('invalid requests never reach Unsplash', () => {
  const refused: [string, string, number, string][] = [
    ['missing query', '/search/photos', 400, 'missing_query'],
    ['empty query', '/search/photos?query=', 400, 'missing_query'],
    ['blank query', '/search/photos?query=%20%20', 400, 'missing_query'],
    ['query too long', `/search/photos?query=${'a'.repeat(101)}`, 400, 'query_too_long'],
    ['control character in the query', '/search/photos?query=a%0Ab', 400, 'invalid_query'],
    ['null byte in the query', '/search/photos?query=a%00b', 400, 'invalid_query'],
    ['page zero', '/search/photos?query=a&page=0', 400, 'invalid_page'],
    ['page above the limit', '/search/photos?query=a&page=51', 400, 'invalid_page'],
    ['page not a number', '/search/photos?query=a&page=abc', 400, 'invalid_page'],
    ['page a fraction', '/search/photos?query=a&page=1.5', 400, 'invalid_page'],
    ['page negative', '/search/photos?query=a&page=-1', 400, 'invalid_page'],
    ['unknown orientation', '/search/photos?query=a&orientation=wide', 400, 'invalid_orientation'],
    ['client-chosen page size', '/search/photos?query=a&per_page=1000', 400, 'unknown_parameter'],
    ['a client-supplied key', '/search/photos?query=a&client_id=abc', 400, 'unknown_parameter'],
    ['an access token parameter', '/search/photos?query=a&access_token=abc', 400, 'unknown_parameter'],
    ['duplicate query', '/search/photos?query=a&query=b', 400, 'duplicate_parameter'],
    ['photo id with dots', '/photos/..%2F..%2Fadmin', 400, 'invalid_photo_id'],
    ['photo id too short', '/photos/abc', 400, 'invalid_photo_id'],
    ['photo id with a slash', '/photos/a%2Fb1234567', 400, 'invalid_photo_id'],
    ['photo id with characters outside the set', '/photos/abc$def1234', 400, 'invalid_photo_id'],
    ['photo with a query string', '/photos/LBI7cgq3pbM?client_id=x', 400, 'unknown_parameter'],
    ['download with an unknown parameter', '/photos/LBI7cgq3pbM/download?ixid=a&client_id=x', 400, 'unknown_parameter'],
    ['download with an invalid ixid', '/photos/LBI7cgq3pbM/download?ixid=a%20b', 400, 'invalid_ixid'],
    ['download with a duplicate ixid', '/photos/LBI7cgq3pbM/download?ixid=a&ixid=b', 400, 'duplicate_parameter'],
    ['an unknown path', '/admin', 404, 'not_found'],
    ['the root', '/', 404, 'not_found'],
    ['photos without an id', '/photos', 404, 'not_found'],
    ['extra path segments', '/search/photos/extra', 404, 'not_found'],
    ['a trailing slash', '/search/photos/', 404, 'not_found'],
    ['another Unsplash operation', '/users/alex', 404, 'not_found'],
    ['a photo statistics path', '/photos/LBI7cgq3pbM/statistics', 404, 'not_found'],
    ['health with parameters', '/health?x=1', 400, 'unknown_parameter'],
    ['a URL that is too long', `/photos/LBI7cgq3pbM/download?ixid=${'a'.repeat(600)}&${'b'.repeat(1500)}=1`, 414, 'url_too_long'],
  ];

  it.each(refused)('%s', async (_name, path, status, error) => {
    const { response, fetcher } = await call(path);

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'])('refuses %s with 405 and says what is allowed', async (method) => {
    const { response, fetcher } = await call('/search/photos?query=a', { init: { method } });

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, OPTIONS');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('upstream errors', () => {
  it('turns Unsplash’s answers into safe ones, and never passes its body on', async () => {
    const leaky = () => json({ errors: [`OAuth error: The access token is invalid (${SECRET})`] }, 401);
    const { response } = await call('/search/photos?query=a', { reply: leaky });

    expect(response.status).toBe(502);
    expect(await everything(response)).not.toContain(SECRET); // before the body is consumed
    expect(await response.json()).toEqual({ error: 'upstream_error' });
  });

  it.each([
    [401, 502, 'upstream_error'],
    [403, 429, 'rate_limited'],
    [429, 429, 'rate_limited'],
    [404, 404, 'not_found'],
    [500, 502, 'upstream_error'],
    [503, 502, 'upstream_error'],
  ])('upstream %i is %i %s', async (upstreamStatus, status, error) => {
    const { response } = await call('/search/photos?query=a', { reply: () => json({ errors: ['x'] }, upstreamStatus) });

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    if (status === 429) expect(response.headers.get('Retry-After')).toBe('60');
  });

  it('survives a network failure, a timeout, invalid JSON and an unexpected shape', async () => {
    const failing = (error: unknown) => async () => {
      throw error;
    };
    const run = async (path: string, make: () => Promise<Response>) => {
      const fake = upstream();
      fake.fetcher.mockImplementation(make);
      const { handle } = await import('../src/index');

      return handle(request(path), ENV, fake.fetcher);
    };

    const network = await run('/search/photos?query=a', failing(new TypeError('fetch failed')));
    expect([network.status, await network.json()]).toEqual([502, { error: 'upstream_error' }]);

    const timeout = await run('/search/photos?query=a', failing(Object.assign(new Error('timed out'), { name: 'TimeoutError' })));
    expect([timeout.status, await timeout.json()]).toEqual([504, { error: 'upstream_timeout' }]);

    const invalid = await run('/search/photos?query=a', async () => new Response('<html>not json</html>', { status: 200 }));
    expect([invalid.status, await invalid.json()]).toEqual([502, { error: 'upstream_error' }]);

    const shape = await run('/search/photos?query=a', async () => json({ unexpected: true }));
    expect([shape.status, await shape.json()]).toEqual([502, { error: 'upstream_error' }]);
  });

  it('does not follow redirects and gives the upstream call a timeout', async () => {
    const { calls } = await call('/search/photos?query=a');

    // 'manual' (a 3xx comes back as a response, refused in the handler): Cloudflare's runtime rejects 'error'.
    expect(calls[0]!.init.redirect).toBe('manual');
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('security: the key, the client’s headers and the logs', () => {
  it('sends upstream only the two headers the proxy builds, never anything the client sent', async () => {
    const { calls } = await call('/search/photos?query=a', {
      init: {
        headers: {
          Cookie: 'session=abc',
          Authorization: 'Bearer client-token',
          'X-Forwarded-For': '1.2.3.4',
          Referer: 'https://evil.example/',
          Origin: ORIGIN,
          'User-Agent': 'curl/8',
        },
      },
    });

    const names = [...new Headers(calls[0]!.init.headers).keys()].sort();
    expect(names).toEqual(['accept-version', 'authorization']);
    expect(new Headers(calls[0]!.init.headers).get('Authorization')).toBe(`Client-ID ${SECRET}`);
    expect(calls[0]!.init.body ?? null).toBeNull();
  });

  it('never returns the key: not in any body or header, on success or on any error', async () => {
    const scenarios: [string, () => Response][] = [
      ['/search/photos?query=a', () => json({ results: [rawPhoto()] })],
      ['/photos/LBI7cgq3pbM', () => json(rawPhoto())],
      ['/photos/LBI7cgq3pbM/download?ixid=a', () => json({ url: 'x' })],
      ['/search/photos?query=a', () => json({ errors: [SECRET] }, 401)],
      ['/search/photos?query=a', () => json({ errors: [SECRET] }, 403)],
      ['/search/photos?query=a', () => json({ errors: [SECRET] }, 500)],
      ['/search/photos?query=a', () => new Response(SECRET, { status: 200 })],
      ['/search/photos', () => json({})],
      ['/nope', () => json({})],
    ];

    for (const [path, reply] of scenarios) {
      const { response } = await call(path, { reply, init: { headers: { Origin: ORIGIN } } });

      expect(await everything(response)).not.toContain(SECRET);
    }
  });

  it('never logs the key, a search term, or a photo id', async () => {
    const lines: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' ')));
    }

    await call('/search/photos?query=very-private-search-term', { reply: () => json({}, 401) });
    await call('/search/photos?query=very-private-search-term', { reply: () => json({ nope: true }) });
    await call('/photos/LBI7cgq3pbM', { reply: () => new Response('<html>', { status: 200 }) });
    await call('/photos/LBI7cgq3pbM', { env: { UNSPLASH_ACCESS_KEY: undefined } });
    await call('/search/photos?query=very-private-search-term', { reply: () => Promise.reject(new Error(`boom ${SECRET}`)) });

    expect(lines.length).toBeGreaterThan(0); // it does log events, so the check above is not vacuous
    for (const line of lines) {
      expect(line).not.toContain(SECRET);
      expect(line).not.toContain('very-private-search-term');
      expect(line).not.toContain('LBI7cgq3pbM');
    }
  });

  it.each([undefined, ''])('answers 500 not_configured, calling nothing, when the secret is %j', async (value) => {
    const { response, fetcher } = await call('/search/photos?query=a', { env: { UNSPLASH_ACCESS_KEY: value } });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'not_configured' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sets no-store and nosniff on every answer, success and error', async () => {
    for (const path of ['/search/photos?query=a', '/search/photos', '/nope', '/health']) {
      const { response } = await call(path);

      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Content-Type')).toContain('application/json');
    }
  });

  it('health answers without a key and without calling Unsplash', async () => {
    const { response, fetcher } = await call('/health', { env: { UNSPLASH_ACCESS_KEY: undefined } });

    expect(await response.json()).toEqual({ ok: true });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('abuse control: rate limiting', () => {
  const limiter = (success: boolean) => ({ limit: vi.fn(async (_options: { key: string }) => ({ success })) });

  it('refuses with 429 and Retry-After before Unsplash is called once the client is over its limit', async () => {
    const RATE_LIMITER = limiter(false);
    const { response, fetcher } = await call('/search/photos?query=a', { env: { RATE_LIMITER } });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'rate_limited' });
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('counts each client by its own address, and lets a client within its limit through', async () => {
    const RATE_LIMITER = limiter(true);
    const { response } = await call('/search/photos?query=a', { env: { RATE_LIMITER }, init: { headers: { 'CF-Connecting-IP': '203.0.113.9' } } });

    expect(response.status).toBe(200);
    expect(RATE_LIMITER.limit).toHaveBeenCalledWith({ key: '203.0.113.9' });
  });

  it('does not spend the limit on a request that was invalid anyway, and does not limit health', async () => {
    const RATE_LIMITER = limiter(false);

    expect((await call('/search/photos', { env: { RATE_LIMITER } })).response.status).toBe(400);
    expect((await call('/health', { env: { RATE_LIMITER } })).response.status).toBe(200);
    expect(RATE_LIMITER.limit).not.toHaveBeenCalled();
  });
});

describe('CORS', () => {
  const withOrigin = (origin: string) => ({ init: { headers: { Origin: origin } } });

  it('lets an allowed origin read answers, success and error alike, and never allows credentials', async () => {
    for (const path of ['/search/photos?query=a', '/search/photos']) {
      const { response } = await call(path, withOrigin(ORIGIN));

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
      expect(response.headers.get('Vary')).toBe('Origin');
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    }
  });

  it.each(['https://evil.example', 'http://localhost:9999', 'tauri://localhost.evil.example', 'null', 'TAURI://localhost'])(
    'gives %s no CORS permission',
    async (origin) => {
      const { response } = await call('/search/photos?query=a', withOrigin(origin));

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
  );

  it('gives nobody CORS permission when no origins are configured, and has no wildcard', async () => {
    const { response } = await call('/search/photos?query=a', { ...withOrigin(ORIGIN), env: { ALLOWED_ORIGINS: undefined } });

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(ENV.ALLOWED_ORIGINS).not.toContain('*');
  });

  it('answers a preflight for an allowed origin and offers nothing to another', async () => {
    const allowed = await call('/search/photos?query=a', { init: { method: 'OPTIONS', headers: { Origin: ORIGIN } } });
    expect(allowed.response.status).toBe(204);
    expect(allowed.response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(allowed.response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    expect(allowed.fetcher).not.toHaveBeenCalled();

    const other = await call('/search/photos?query=a', { init: { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } } });
    expect(other.response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('the Workers module entry point', () => {
  it('serves requests through the default export', async () => {
    const response = await worker.fetch(request('/health'), ENV);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe('diagnostics for an upstream call that throws', () => {
  const capture = () => {
    const lines: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' ')));
    }

    return lines;
  };
  const events = (lines: string[]) => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  const throwing = (error: unknown) => () => Promise.reject(error);
  const withCause = (message: string, cause: string) => Object.assign(new TypeError(message), { cause: new Error(cause) });

  it('logs phase "request" when building the request throws, and never calls Unsplash', async () => {
    const lines = capture();
    // A newline inside the secret is an invalid header value: building the headers throws before any fetch.
    const { response, fetcher } = await call('/search/photos?query=a', { env: { UNSPLASH_ACCESS_KEY: 'abc\ndef' } });

    expect([response.status, await response.json()]).toEqual([502, { error: 'upstream_error' }]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(events(lines)).toEqual([
      {
        event: 'upstream_unreachable',
        route: 'search',
        phase: 'request',
        errorName: 'TypeError',
        category: 'invalid_header',
        keyHasWhitespace: true,
        keyHasQuote: false,
        keyNonAscii: true,
        keyHasPrefix: false,
        keyLength: 7,
      },
    ]);
  });

  it.each([
    ['a DNS failure', withCause('fetch failed', 'getaddrinfo ENOTFOUND api.unsplash.com'), 'dns'],
    ['a TLS failure', new TypeError('TLS peer’s certificate is not trusted'), 'tls'],
    ['a connection failure', new TypeError('Network connection lost.'), 'connection'],
    ['a refused redirect', new TypeError('Fetch API cannot load: redirect mode is set to error'), 'redirect'],
    ['an invalid header reported by fetch', new TypeError('Invalid header value'), 'invalid_header'],
    ['something unrecognised', new Error('something else entirely'), 'unknown'],
  ])('logs phase "fetch" and a category for %s', async (_name, error, category) => {
    const lines = capture();
    const { response } = await call('/search/photos?query=a', { reply: throwing(error) });

    expect([response.status, await response.json()]).toEqual([502, { error: 'upstream_error' }]);
    expect(events(lines)).toEqual([
      expect.objectContaining({ event: 'upstream_unreachable', route: 'search', phase: 'fetch', category }),
    ]);
  });

  it('still answers a timeout with 504 and logs no exception detail', async () => {
    const lines = capture();
    const { response } = await call('/search/photos?query=a', {
      reply: throwing(Object.assign(new Error('timed out'), { name: 'TimeoutError' })),
    });

    expect([response.status, await response.json()]).toEqual([504, { error: 'upstream_timeout' }]);
    expect(events(lines)).toEqual([{ event: 'upstream_timeout', route: 'search', phase: 'fetch' }]);
  });

  it('reports the shape of the key, not the key', async () => {
    const shapes: Array<[string, Record<string, unknown>]> = [
      [SECRET, { keyHasWhitespace: false, keyHasQuote: false, keyNonAscii: false, keyHasPrefix: false, keyLength: SECRET.length }],
      [`"${SECRET}"`, { keyHasWhitespace: false, keyHasQuote: true, keyNonAscii: false, keyHasPrefix: false, keyLength: SECRET.length + 2 }],
      [`${SECRET} `, { keyHasWhitespace: true, keyHasQuote: false, keyNonAscii: false, keyHasPrefix: false, keyLength: SECRET.length + 1 }],
      [`Client-ID ${SECRET}`, { keyHasWhitespace: true, keyHasQuote: false, keyNonAscii: false, keyHasPrefix: true, keyLength: SECRET.length + 10 }],
      [`${SECRET}é`, { keyHasWhitespace: false, keyHasQuote: false, keyNonAscii: true, keyHasPrefix: false, keyLength: SECRET.length + 1 }],
    ];

    for (const [key, expected] of shapes) {
      const lines = capture();
      await call('/search/photos?query=a', { env: { UNSPLASH_ACCESS_KEY: key }, reply: throwing(new TypeError('fetch failed')) });

      expect(events(lines)[0]).toMatchObject(expected);
      vi.restoreAllMocks();
    }
  });

  it('logs only fixed words, booleans and a length: never the key, the exception text, the URL or any request input', async () => {
    const hostile = [
      `boom ${SECRET}`,
      'https://api.unsplash.com/search/photos?query=very-private-search-term',
      'LBI7cgq3pbM very-private-search-term',
    ].join(' ');
    const failures = [
      new TypeError(hostile),
      withCause(hostile, hostile),
      Object.assign(new Error(hostile), { name: `Custom ${SECRET} very-private-search-term` }),
      hostile,
    ];

    for (const error of failures) {
      const lines = capture();
      await call('/search/photos?query=very-private-search-term', { reply: throwing(error) });
      await call('/photos/LBI7cgq3pbM', { reply: throwing(error) });
      await call('/search/photos?query=very-private-search-term', { env: { UNSPLASH_ACCESS_KEY: `${SECRET}\n${SECRET}` } });

      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).not.toContain(SECRET);
        expect(line).not.toContain('very-private-search-term');
        expect(line).not.toContain('LBI7cgq3pbM');
        expect(line).not.toContain('api.unsplash.com');
        expect(line).not.toContain('boom');
        expect(line).not.toContain('Client-ID');
      }
      for (const event of events(lines)) {
        for (const value of Object.values(event)) {
          expect(['string', 'number', 'boolean']).toContain(typeof value);
        }
        expect(['Error', 'TypeError', 'Other', undefined]).toContain(event.errorName);
        expect(['invalid_header', 'redirect', 'dns', 'tls', 'connection', 'unknown', undefined]).toContain(event.category);
      }
      vi.restoreAllMocks();
    }
  });
});

describe('redirects', () => {
  const TARGET = 'https://elsewhere.example.test/very-private-target';
  const redirect = (status: number) => () => new Response(null, { status, headers: { Location: TARGET } });

  it.each(['/search/photos?query=a', '/photos/LBI7cgq3pbM', '/photos/LBI7cgq3pbM/download'])(
    'asks fetch for redirect "manual" on %s, the only value besides "follow" that Cloudflare accepts — never "error"',
    async (path) => {
      const { calls } = await call(path);

      expect(calls).toHaveLength(1);
      expect(calls[0]!.init.redirect).toBe('manual');
      expect(['follow', 'manual']).toContain(calls[0]!.init.redirect);
    }
  );

  it.each([301, 302, 303, 307, 308])('answers a %i from Unsplash with the generic 502, without following or exposing it', async (status) => {
    const lines: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' ')));
    }

    for (const path of ['/search/photos?query=a', '/photos/LBI7cgq3pbM', '/photos/LBI7cgq3pbM/download']) {
      const { response, calls } = await call(path, { reply: redirect(status) });

      expect(response.headers.get('Location')).toBeNull();
      expect(await everything(response.clone())).not.toContain('elsewhere.example.test');
      expect([response.status, await response.json()]).toEqual([502, { error: 'upstream_error' }]);
      expect(calls).toHaveLength(1); // not followed
    }

    expect(lines.map((line) => JSON.parse(line))).toEqual(
      ['search', 'photo', 'download'].map((route) => ({ event: 'upstream_redirect', route, status }))
    );
    for (const line of lines) {
      expect(line).not.toContain('elsewhere.example.test');
      expect(line).not.toContain(SECRET);
    }
  });

  it('does not treat 200, 404, 401, 429 or 500 as a redirect', async () => {
    const statuses: Array<[number, number, string]> = [
      [200, 200, ''],
      [404, 404, 'not_found'],
      [401, 502, 'upstream_error'],
      [429, 429, 'rate_limited'],
      [500, 502, 'upstream_error'],
    ];

    for (const [upstreamStatus, expected, error] of statuses) {
      const lines: string[] = [];
      vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' ')));
      const { response } = await call('/search/photos?query=a', { reply: () => json({ results: [rawPhoto()] }, upstreamStatus) });

      expect(response.status).toBe(expected);
      if (error) expect(await response.json()).toEqual({ error });
      expect(lines.join('')).not.toContain('upstream_redirect');
      vi.restoreAllMocks();
    }
  });
});
