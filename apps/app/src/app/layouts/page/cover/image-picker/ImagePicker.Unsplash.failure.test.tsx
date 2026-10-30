// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImagePickerUnsplash } from './ImagePicker.Unsplash';

vi.mock('@shared/helpers/openExternalUrl', () => ({ openExternalUrl: vi.fn() }));

// The real UnsplashApi over a stubbed network — the selection must not depend on tracking succeeding.
const raw = {
  id: 'p1',
  urls: { small: 'https://images.unsplash.com/p1?ixid=x&w=400', regular: 'https://images.unsplash.com/p1?ixid=x&w=1080' },
  user: { name: 'Alex Doe', links: { html: 'https://unsplash.com/@alex' } },
  links: { download_location: 'https://api.unsplash.com/photos/p1/download?ixid=x' },
};

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);

beforeEach(() => {
  vi.stubEnv('VITE_UNSPLASH_ACCESS_KEY', 'test-access-key');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  process.on('unhandledRejection', onUnhandled);
});
afterEach(() => {
  cleanup();
  process.off('unhandledRejection', onUnhandled);
  unhandled.length = 0;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubNetwork(trackingResponse: () => Promise<unknown>) {
  const fetchMock = vi.fn((input: URL, _init?: RequestInit) => {
    if (String(input.href).includes('/search/photos')) {
      return Promise.resolve({ ok: true, json: async () => ({ results: [raw] }) });
    }
    return trackingResponse();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe.each([
  ['the network is down', () => Promise.reject(new TypeError('Failed to fetch'))],
  ['Unsplash answers 503', () => Promise.resolve({ ok: false, status: 503 })],
  ['Unsplash answers 401', () => Promise.resolve({ ok: false, status: 401 })],
])('picking a photo when %s', (_label, trackingResponse) => {
  it('still sets the cover immediately, sends exactly one tracking request, and raises no unhandled rejection', async () => {
    const fetchMock = stubNetwork(trackingResponse);
    const onSelect = vi.fn();
    const { container } = render(<ImagePickerUnsplash onSelect={onSelect} />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());

    fireEvent.click(container.querySelector('img')!.closest('button')!);

    expect(onSelect).toHaveBeenCalledWith('https://images.unsplash.com/p1?ixid=x&w=4800', {
      name: 'Alex Doe',
      url: 'https://unsplash.com/@alex',
      downloadLocation: 'https://api.unsplash.com/photos/p1/download?ixid=x',
    });
    // The selection is synchronous; tracking is asynchronous and cannot delay it.
    await waitFor(() => {
      const tracking = fetchMock.mock.calls.filter(([url]) => String(url.href).includes('/download'));
      expect(tracking).toHaveLength(1);
      expect(tracking[0]![0].href).toBe('https://api.unsplash.com/photos/p1/download?ixid=x');
      expect(tracking[0]![1]).toEqual({
        headers: { Authorization: 'Client-ID test-access-key', 'Accept-Version': 'v1' },
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unhandled).toEqual([]);
  });
});
