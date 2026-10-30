import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPhoto, searchPhotos, trackPhotoDownload } from './UnsplashApi';

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

const unsplashHeaders = {
  Authorization: 'Client-ID test-access-key',
  'Accept-Version': 'v1',
};

describe('UnsplashApi', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_UNSPLASH_ACCESS_KEY', 'test-access-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('searchPhotos() with an empty query picks a random default search term', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [sampleRawPhoto] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const photos = await searchPhotos('');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://api.unsplash.com/search/photos?query=classical+architecture&page=1&per_page=30&orientation=portrait',
      }),
      {
        headers: unsplashHeaders,
      },
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

    expect(fetchMock.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        href: 'https://api.unsplash.com/search/photos?query=old+european+architecture&page=1&per_page=30&orientation=portrait',
      }),
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
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://api.unsplash.com/search/photos?query=gradient&page=1&per_page=30&orientation=portrait',
      }),
      {
        headers: unsplashHeaders,
      },
    );
  });

  it('searchPhotos() accepts a page for shuffling manual search results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchPhotos('mountains', 3);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://api.unsplash.com/search/photos?query=mountains&page=3&per_page=30&orientation=portrait',
      }),
      {
        headers: unsplashHeaders,
      },
    );
  });

  it('searchPhotos() requests portrait search results for a custom query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [sampleRawPhoto] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const photos = await searchPhotos('mountains');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://api.unsplash.com/search/photos?query=mountains&page=1&per_page=30&orientation=portrait',
      }),
      {
        headers: unsplashHeaders,
      },
    );
    expect(photos).toHaveLength(1);
    expect(photos[0]?.urls.regular).toBe(
      'https://images.unsplash.com/regular.jpg',
    );
  });

  it('throws when the API returns a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      }),
    );

    await expect(searchPhotos('')).rejects.toThrow(
      'Unsplash request failed (401).',
    );
  });

  it('throws when the access key is missing', async () => {
    vi.stubEnv('VITE_UNSPLASH_ACCESS_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchPhotos('')).rejects.toThrow('Unsplash is not configured.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('trackPhotoDownload() requests the download location with Unsplash auth', async () => {
    const downloadLocation =
      'https://api.unsplash.com/photos/photo-1/download?ixid=abc';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await expect(trackPhotoDownload(downloadLocation)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: downloadLocation }),
      {
        headers: unsplashHeaders,
      },
    );
  });

  it('trackPhotoDownload() resolves false (not true) when Unsplash rejects the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }),
    );

    await expect(
      trackPhotoDownload(
        'https://api.unsplash.com/photos/photo-1/download?ixid=abc',
      ),
    ).resolves.toBe(false);
  });

  it('trackPhotoDownload() does not throw when the network request rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    await expect(
      trackPhotoDownload(
        'https://api.unsplash.com/photos/photo-1/download?ixid=abc',
      ),
    ).resolves.toBe(false);
  });

  it('trackPhotoDownload() does not throw when the access key is missing', async () => {
    vi.stubEnv('VITE_UNSPLASH_ACCESS_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      trackPhotoDownload(
        'https://api.unsplash.com/photos/photo-1/download?ixid=abc',
      ),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('trackPhotoDownload() never sends credentials to a non-Unsplash host', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await trackPhotoDownload('https://evil.example/photos/x/download?ixid=abc');
    await trackPhotoDownload('not a url');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('UnsplashApi orientation', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_UNSPLASH_ACCESS_KEY', 'test-access-key');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(['landscape', 'portrait', 'squarish'] as const)('searchPhotos() requests %s results when asked to', async (orientation) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [sampleRawPhoto] }) });
    vi.stubGlobal('fetch', fetchMock);

    await searchPhotos('mountains', 2, orientation);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: `https://api.unsplash.com/search/photos?query=mountains&page=2&per_page=30&orientation=${orientation}`,
      }),
      { headers: unsplashHeaders },
    );
  });

  it('searchPhotos() stays portrait when no orientation is given (every existing caller)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [sampleRawPhoto] }) });
    vi.stubGlobal('fetch', fetchMock);

    await searchPhotos('mountains');
    await searchPhotos('mountains', 3, undefined);

    for (const [url] of fetchMock.mock.calls) {
      expect((url as URL).searchParams.get('orientation')).toBe('portrait');
    }
  });

  it('getPhoto() fetches /photos/:id with the access key and maps the photographer and download location', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => sampleRawPhoto });
    vi.stubGlobal('fetch', fetchMock);

    const photo = await getPhoto('Dwu85P9SOIk');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: 'https://api.unsplash.com/photos/Dwu85P9SOIk' }),
      { headers: unsplashHeaders }
    );
    expect(photo.user).toEqual({ name: 'Alex', links: { html: 'https://unsplash.com/@alex' } });
    expect(photo.urls.regular).toBe('https://images.unsplash.com/regular.jpg');
    expect(photo.links.downloadLocation).toBe('https://api.unsplash.com/photos/photo-1/download?ixid=abc');
  });

  it('getPhoto() rejects when Unsplash does not know the photo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(getPhoto('Dwu85P9SOIk')).rejects.toThrow('Unsplash request failed (404).');
  });

  it('getPhoto() rejects without a configured access key, and never sends a request', async () => {
    vi.stubEnv('VITE_UNSPLASH_ACCESS_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(getPhoto('Dwu85P9SOIk')).rejects.toThrow('Unsplash is not configured.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
