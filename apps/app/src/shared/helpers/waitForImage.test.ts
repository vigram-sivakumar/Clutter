// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { waitForImage } from './waitForImage';

class FakeImage {
  static last: FakeImage;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  decode = vi.fn(async () => {});
  constructor() {
    FakeImage.last = this;
  }
}

beforeEach(() => vi.stubGlobal('Image', FakeImage));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('waitForImage', () => {
  it('waits for the picture: false until it loads, then true', async () => {
    let done: boolean | null = null;
    void waitForImage('https://x/a.jpg').then((ok) => (done = ok));
    await Promise.resolve();
    expect(done).toBeNull();
    expect(FakeImage.last.src).toBe('https://x/a.jpg');

    FakeImage.last.onload?.();
    await vi.waitFor(() => expect(done).toBe(true));
    expect(FakeImage.last.decode).toHaveBeenCalled();
  });

  it('is false when the picture fails to load', async () => {
    const result = waitForImage('https://x/missing.jpg');
    FakeImage.last.onerror?.();
    expect(await result).toBe(false);
  });

  it('is false when it takes too long', async () => {
    vi.useFakeTimers();
    const result = waitForImage('https://x/slow.jpg', 1000);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await result).toBe(false);
  });

  it('still counts as loaded when only the decode step fails', async () => {
    const result = waitForImage('https://x/a.jpg');
    FakeImage.last.decode.mockRejectedValueOnce(new Error('x'));
    FakeImage.last.onload?.();
    expect(await result).toBe(true);
  });
});
