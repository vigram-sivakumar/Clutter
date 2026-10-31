import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_UNSPLASH_PROXY_URL, getPhoto, searchPhotos, trackPhotoDownload } from './UnsplashApi';
import { UnsplashRequestError } from './UnsplashRequestError';

const PROXY = DEFAULT_UNSPLASH_PROXY_URL;

const sampleRawPhoto = {
  id: 'photo-1',
  urls: {
    small: 'https://images.unsplash.com/small.jpg',
    regular: 'https://images.unsplash.com/regular.jpg',
  },
  user: {
    name: 'Alex',
    links: {
      html: 'https://unsplash.com/@alex',
    },
  },
  links: {
    download_location:
      'https://api.unsplash.com/photos/photo-1/download?ixid=abc',
  },
};

/** Every request the app makes: its URL and whatever init came with it. */
function requests(fetchMock: ReturnType<typeof vi.fn>): { url: URL; init: unknown }[] {
  return fetchMock.mock.calls.map(([url, init]) => ({ url: url as URL, init }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('UnsplashApi: search through the proxy', () => {
  it('searchPhotos() with an empty query picks a random default search term', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [sampleRawPhoto] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const photos = await searchPhotos('');

    expect(requests(fetchMock)[0]!.url.href).toBe(
      `${PROXY}/search/photos?query=classical+architecture&page=1&orientation=portrait`,
    );
    expect(photos).toEqual([
      {
        id: 'photo-1',
        urls: {
          small: 'https://images.unsplash.com/small.jpg',
          regular: 'https://images.unsplash.com/regular.jpg',
        },
        user: {
          name: 'Alex',
          links: { html: 'https://unsplash.com/@alex' },
        },
        links: {
          downloadLocation:
            'https://api.unsplash.com/photos/photo-1/download?ixid=abc',
        },
      },
    ]);

    await searchPhotos('');

    expect(requests(fetchMock)[1]!.url.href).toBe(
      `${PROXY}/search/photos?query=old+european+architecture&page=1&orientation=portrait`,
    );
  });

  it('searchPhotos() with whitespace only uses a default search term', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchPhotos('   ');

    // Math.random mocked to 0.99 selects the last entry in
    // DEFAULT_SEARCH_QUERIES (UnsplashApi.ts) — currently 'gradient'.
    expect(requests(fetchMock)[0]!.url.href).toBe(
      `${PROXY}/search/photos?query=gradient&page=1&orientation=portrait`,
    );
  });

  it('searchPhotos() accepts a page for shuffling manual search results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchPhotos('mountains', 3);

    expect(requests(fetchMock)[0]!.url.href).toBe(
      `${PROXY}/search/photos?query=mountains&page=3&orientation=portrait`,
    );
  });

  it('searchPhotos() requests portrait search results for a custom query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [sampleRawPhoto] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const photos = await searchPhotos('mountains');

    expect(requests(fetchMock)[0]!.url.href).toBe(
      `${PROXY}/search/photos?query=mountains&page=1&orientation=portrait`,
    );
    expect(photos).toHaveLength(1);
    expect(photos[0]?.urls.regular).toBe(
      'https://images.unsplash.com/regular.jpg',
    );
  });

  it('throws when the proxy answers with a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({}),
      }),
    );

    await expect(searchPhotos('')).rejects.toThrow(
      'Unsplash request failed (429).',
    );
  });

  it('puts a query with special characters in one encoded parameter', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    await searchPhotos('a&b=c#d', 1);

    const { url } = requests(fetchMock)[0]!;
    expect(url.searchParams.get('query')).toBe('a&b=c#d');
    expect([...url.searchParams.keys()].sort()).toEqual(['orientation', 'page', 'query']);
    expect(url.hash).toBe('');
  });
});

describe('UnsplashApi: no key, no credentials', () => {
  it('sends a plain GET: no Authorization, no custom headers, no key anywhere in the request', async () => {
    vi.stubEnv('VITE_UNSPLASH_ACCESS_KEY', 'must-never-be-read-or-sent');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    await searchPhotos('mountains');
    await getPhoto('Dwu85P9SOIk').catch(() => undefined);
    await trackPhotoDownload('https://api.unsplash.com/photos/photo-1/download?ixid=abc');

    for (const { url, init } of requests(fetchMock)) {
      expect(init).toBeUndefined(); // no headers, no credentials mode, nothing but the URL
      expect(url.origin).toBe(PROXY);
      expect(url.href).not.toContain('must-never-be-read-or-sent');
    }
  });

  it('does not use the old VITE_UNSPLASH_ACCESS_KEY: it works without it, and it changes nothing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_UNSPLASH_ACCESS_KEY', '');

    await expect(searchPhotos('mountains')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('UnsplashApi: the proxy address', () => {
  it('defaults to the deployed proxy', () => {
    expect(DEFAULT_UNSPLASH_PROXY_URL).toBe('https://clutter-unsplash-proxy.vigram-work.workers.dev');
  });

  it('can be overridden with VITE_UNSPLASH_PROXY_URL, a trailing slash included', async () => {
    vi.stubEnv('VITE_UNSPLASH_PROXY_URL', 'https://proxy.example.test/');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    await searchPhotos('mountains');

    expect(requests(fetchMock)[0]!.url.origin).toBe('https://proxy.example.test');
  });

  it('allows plain http only for a local wrangler dev server', async () => {
    vi.stubEnv('VITE_UNSPLASH_PROXY_URL', 'http://localhost:8787');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    await searchPhotos('mountains');

    expect(requests(fetchMock)[0]!.url.origin).toBe('http://localhost:8787');
  });

  it.each([
    ['empty (Unsplash switched off)', ''],
    ['not a URL', 'not a url'],
    ['plain http to a remote host', 'http://proxy.example.test'],
    ['a path appended', 'https://proxy.example.test/api'],
    ['a query string', 'https://proxy.example.test/?key=abc'],
    ['credentials in the URL', 'https://user:pass@proxy.example.test'],
    ['another scheme', 'ftp://proxy.example.test'],
  ])('is "not configured" when it is %s, and nothing is requested', async (_name, value) => {
    vi.stubEnv('VITE_UNSPLASH_PROXY_URL', value);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchPhotos('mountains')).rejects.toThrow('Unsplash is not configured.');
    await expect(getPhoto('Dwu85P9SOIk')).rejects.toThrow('Unsplash is not configured.');
    await expect(trackPhotoDownload('https://api.unsplash.com/photos/photo-1/download?ixid=abc')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('UnsplashApi: reporting a download through the proxy', () => {
  const location = 'https://api.unsplash.com/photos/photo-1/download?ixid=abc';

  it('asks the proxy for the same photo id and ixid the stored download location holds, and resolves true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await expect(trackPhotoDownload(location)).resolves.toBe(true);

    expect(requests(fetchMock)[0]!.url.href).toBe(`${PROXY}/photos/photo-1/download?ixid=abc`);
  });

  it('carries an ixid with special characters intact', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await trackPhotoDownload('https://api.unsplash.com/photos/photo-1/download?ixid=Mnwx%2BA%3D%3D');

    expect(requests(fetchMock)[0]!.url.searchParams.get('ixid')).toBe('Mnwx+A==');
  });

  it('resolves false (not true) when the proxy rejects the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(trackPhotoDownload(location)).resolves.toBe(false);
  });

  it('does not throw when the network request rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    await expect(trackPhotoDownload(location)).resolves.toBe(false);
  });

  it.each([
    ['another host', 'https://evil.example/photos/x/download?ixid=abc'],
    ['the proxy itself', `${PROXY}/photos/photo-1/download?ixid=abc`],
    ['Unsplash over plain http', 'http://api.unsplash.com/photos/photo-1/download?ixid=abc'],
    ['an Unsplash path that is not a download', 'https://api.unsplash.com/users/alex'],
    ['a download path with extra segments', 'https://api.unsplash.com/photos/photo-1/download/extra'],
    ['a path-traversal id', 'https://api.unsplash.com/photos/..%2Fadmin/download?ixid=abc'],
    ['not a URL', 'not a url'],
  ])('ignores %s: nothing is requested', async (_name, value) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(trackPhotoDownload(value)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('UnsplashApi orientation', () => {
  it.each(['landscape', 'portrait', 'squarish'] as const)('searchPhotos() requests %s results when asked to', async (orientation) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [sampleRawPhoto] }) });
    vi.stubGlobal('fetch', fetchMock);

    await searchPhotos('mountains', 2, orientation);

    expect(requests(fetchMock)[0]!.url.href).toBe(
      `${PROXY}/search/photos?query=mountains&page=2&orientation=${orientation}`,
    );
  });

  it('searchPhotos() stays portrait when no orientation is given (every existing caller)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [sampleRawPhoto] }) });
    vi.stubGlobal('fetch', fetchMock);

    await searchPhotos('mountains');
    await searchPhotos('mountains', 3, undefined);

    for (const { url } of requests(fetchMock)) {
      expect(url.searchParams.get('orientation')).toBe('portrait');
    }
  });

  it('getPhoto() fetches /photos/:id from the proxy and maps the photographer and download location', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => sampleRawPhoto });
    vi.stubGlobal('fetch', fetchMock);

    const photo = await getPhoto('Dwu85P9SOIk');

    expect(requests(fetchMock)[0]!.url.href).toBe(`${PROXY}/photos/Dwu85P9SOIk`);
    expect(photo.user).toEqual({ name: 'Alex', links: { html: 'https://unsplash.com/@alex' } });
    expect(photo.urls.regular).toBe('https://images.unsplash.com/regular.jpg');
    expect(photo.links.downloadLocation).toBe('https://api.unsplash.com/photos/photo-1/download?ixid=abc');
  });

  it('getPhoto() rejects when Unsplash does not know the photo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(getPhoto('Dwu85P9SOIk')).rejects.toThrow('Unsplash request failed (404).');
  });

  it('getPhoto() encodes the id into the path, so it cannot leave it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);

    await getPhoto('../admin?x=1').catch(() => undefined);

    const { url } = requests(fetchMock)[0]!;
    expect(url.pathname).toBe('/photos/..%2Fadmin%3Fx%3D1');
    expect(url.search).toBe('');
  });
});

describe('UnsplashApi: failures carry a kind, so the UI never has to read a message', () => {
  const kindOf = async (run: () => Promise<unknown>) => {
    const error = await run().then(
      () => null,
      (reason: unknown) => reason
    );

    expect(error).toBeInstanceOf(UnsplashRequestError);

    return [(error as UnsplashRequestError).kind, (error as UnsplashRequestError).status];
  };
  const answers = (status: number) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));

  it.each([
    [429, 'rate-limited'],
    [502, 'unavailable'],
    [503, 'unavailable'],
    [504, 'unavailable'],
    [404, 'not-found'],
    [400, 'not-found'],
    [418, 'failed'],
  ])('a %i answer is "%s", for a search and for a photo', async (status, kind) => {
    answers(status);
    expect(await kindOf(() => searchPhotos('mountains'))).toEqual([kind, status]);
    expect(await kindOf(() => getPhoto('Dwu85P9SOIk'))).toEqual([kind, status]);
  });

  it('no answer at all is "unreachable", without the network error leaking through', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch https://proxy.example.test/search?query=private')));

    const error = (await searchPhotos('private').catch((reason: unknown) => reason)) as UnsplashRequestError;

    expect([error.kind, error.status]).toEqual(['unreachable', undefined]);
    expect(error.message).not.toContain('private');
  });

  it('an answer that is not JSON is "failed"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => Promise.reject(new SyntaxError('x')) }));

    expect(await kindOf(() => searchPhotos('mountains'))).toEqual(['failed', undefined]);
  });

  it('a missing proxy address is "not-configured"', async () => {
    vi.stubEnv('VITE_UNSPLASH_PROXY_URL', '');
    vi.stubGlobal('fetch', vi.fn());

    expect(await kindOf(() => searchPhotos('mountains'))).toEqual(['not-configured', undefined]);
  });
});
