// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearRetainedCoverImages, isCoverImageRetained, preloadCoverImage, warmCoverImages } from './coverImagePreloader';

/** An `Image` that records what it was asked to load and when its decode finishes. */
class FakeImage {
  static created: FakeImage[] = [];
  src = '';
  decoding = '';
  attributes: Record<string, string> = {};
  decodeCalls = 0;
  private resolveDecode: (() => void) | null = null;
  constructor() {
    FakeImage.created.push(this);
  }
  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }
  decode() {
    this.decodeCalls++;
    return new Promise<void>((resolve) => {
      this.resolveDecode = resolve;
    });
  }
  finish() {
    this.resolveDecode?.();
  }
}

beforeEach(() => {
  FakeImage.created = [];
  clearRetainedCoverImages();
  vi.stubGlobal('Image', FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('preloadCoverImage', () => {
  it('starts loading and decoding the address and holds on to it', async () => {
    const done = preloadCoverImage('https://images.unsplash.com/a?w=4800');

    expect(FakeImage.created).toHaveLength(1);
    expect(FakeImage.created[0]!.src).toBe('https://images.unsplash.com/a?w=4800');
    expect(FakeImage.created[0]!.decoding).toBe('async');
    expect(isCoverImageRetained('https://images.unsplash.com/a?w=4800')).toBe(true);

    FakeImage.created[0]!.finish();
    await expect(done).resolves.toBeUndefined();
  });

  it('asking again for a held cover loads nothing more', () => {
    void preloadCoverImage('u1');
    void preloadCoverImage('u1');

    expect(FakeImage.created).toHaveLength(1);
  });

  it('marks background loads low priority and on-screen ones normal', () => {
    void preloadCoverImage('low', 'low');
    void preloadCoverImage('high');

    expect(FakeImage.created[0]!.attributes['fetchpriority']).toBe('low');
    expect(FakeImage.created[1]!.attributes['fetchpriority']).toBeUndefined();
  });

  it('never rejects: a failed decode resolves', async () => {
    const failing = vi.spyOn(FakeImage.prototype, 'decode').mockRejectedValue(new Error('bad image'));

    await expect(preloadCoverImage('broken')).resolves.toBeUndefined();

    failing.mockRestore();
  });

  it('ignores an empty address', async () => {
    await preloadCoverImage(undefined);
    await preloadCoverImage('');

    expect(FakeImage.created).toHaveLength(0);
  });

  it('holds a bounded number, dropping the least recently used first', () => {
    for (let i = 0; i < 24; i++) void preloadCoverImage(`u${i}`);
    void preloadCoverImage('u0'); // u0 is now the most recently used
    void preloadCoverImage('u24');

    expect(isCoverImageRetained('u0')).toBe(true);
    expect(isCoverImageRetained('u1')).toBe(false);
    expect(isCoverImageRetained('u24')).toBe(true);
  });
});

describe('warmCoverImages', () => {
  it('loads one at a time, at low priority, in order', async () => {
    const done = warmCoverImages(['a', 'b', 'c']);

    expect(FakeImage.created.map((i) => i.src)).toEqual(['a']);
    FakeImage.created[0]!.finish();
    await vi.waitFor(() => expect(FakeImage.created).toHaveLength(2));
    FakeImage.created[1]!.finish();
    await vi.waitFor(() => expect(FakeImage.created).toHaveLength(3));
    FakeImage.created[2]!.finish();
    await done;

    expect(FakeImage.created.map((i) => i.src)).toEqual(['a', 'b', 'c']);
    expect(FakeImage.created.every((i) => i.attributes['fetchpriority'] === 'low')).toBe(true);
  });

  it('moves on from a load that takes too long', async () => {
    vi.useFakeTimers();
    const done = warmCoverImages(['slow', 'next']);

    expect(FakeImage.created).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(FakeImage.created.map((i) => i.src)).toEqual(['slow', 'next']);
    await vi.advanceTimersByTimeAsync(15_001);
    await done;
  });

  it('stops when cancelled', async () => {
    let cancelled = false;
    const done = warmCoverImages(['a', 'b'], () => cancelled);
    cancelled = true;
    FakeImage.created[0]!.finish();
    await done;

    expect(FakeImage.created).toHaveLength(1);
  });
});
