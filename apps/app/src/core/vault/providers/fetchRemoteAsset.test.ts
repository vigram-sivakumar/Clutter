import { beforeEach, describe, expect, it, vi } from 'vitest';

const appFetchMock = vi.fn();

vi.mock('@shared/helpers/appFetch', () => ({
  appFetch: (url: string, init?: unknown) => appFetchMock(url, init),
}));

import { MAX_REMOTE_ASSET_BYTES } from '../asset/importRemoteAsset';
import { fetchRemoteAsset } from './fetchRemoteAsset';

const respond = (init: { status?: number; body?: Uint8Array; headers?: Record<string, string> }) =>
  new Response((init.body ?? new Uint8Array([1, 2, 3])) as BodyInit, {
    status: init.status ?? 200,
    headers: init.headers,
  });

describe('fetchRemoteAsset', () => {
  beforeEach(() => {
    appFetchMock.mockReset();
  });

  it('returns the bytes and content type of a successful download (a redirect was already followed by the client)', async () => {
    appFetchMock.mockResolvedValue(respond({ headers: { 'content-type': 'image/jpeg' } }));

    const asset = await fetchRemoteAsset('https://x.com/a.jpg');

    expect(Array.from(asset.bytes)).toEqual([1, 2, 3]);
    expect(asset.contentType).toBe('image/jpeg');
    expect(appFetchMock.mock.calls[0]![1]).toHaveProperty('signal');
  });

  it.each([403, 404, 500])('rejects an HTTP %i', async (status) => {
    appFetchMock.mockResolvedValue(respond({ status }));

    await expect(fetchRemoteAsset('https://x.com/a.jpg')).rejects.toThrow(String(status));
  });

  it('rejects a network failure with a readable message', async () => {
    appFetchMock.mockRejectedValue(new TypeError('Load failed'));

    await expect(fetchRemoteAsset('https://x.com/a.jpg')).rejects.toThrow(/Could not download.*Load failed/);
  });

  it('rejects on timeout', async () => {
    appFetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })
    );

    await expect(fetchRemoteAsset('https://x.com/slow.jpg', 20)).rejects.toThrow(/Timed out/);
  });

  it('rejects a body its Content-Length says is over the limit, before reading it', async () => {
    appFetchMock.mockResolvedValue(
      respond({ headers: { 'content-length': String(MAX_REMOTE_ASSET_BYTES + 1) } })
    );

    await expect(fetchRemoteAsset('https://x.com/big.jpg')).rejects.toThrow(/too large/);
  });
});
