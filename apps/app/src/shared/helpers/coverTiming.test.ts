// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isCoverTimingEnabled, markCoverNavigation, traceCoverImage } from './coverTiming';

function fakeImage(over: Record<string, unknown> = {}) {
  const listeners: Record<string, () => void> = {};
  return {
    complete: true,
    naturalWidth: 4800,
    naturalHeight: 3200,
    decode: vi.fn(async () => {}),
    addEventListener: (name: string, fn: () => void) => (listeners[name] = fn),
    fire: (name: string) => listeners[name]?.(),
    ...over,
  } as unknown as HTMLImageElement & { fire(name: string): void };
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0));
  (globalThis as { __coverTiming?: unknown[] }).__coverTiming = undefined;
});
afterEach(() => {
  localStorage.removeItem('clutter:cover-timing');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('cover timing diagnostic', () => {
  it('is off unless the flag is set, and then measures and logs nothing', async () => {
    const img = fakeImage();

    expect(isCoverTimingEnabled()).toBe(false);
    markCoverNavigation('page-1');
    traceCoverImage(img, { src: 'https://x/a.jpg', retained: false });
    await new Promise((r) => setTimeout(r, 10));

    expect(img.decode).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
    expect((globalThis as { __coverTiming?: unknown[] }).__coverTiming).toBeUndefined();
  });

  it('when on, logs one record per image with each stage, and keeps it on window.__coverTiming', async () => {
    localStorage.setItem('clutter:cover-timing', '1');
    markCoverNavigation('page-2');
    const img = fakeImage();

    traceCoverImage(img, { src: 'https://images.unsplash.com/a.jpg', retained: true });
    img.fire('load');
    await vi.waitFor(() => expect(console.info).toHaveBeenCalledTimes(1));

    const [label, json] = (console.info as unknown as { mock: { calls: string[][] } }).mock.calls[0]!;
    const record = JSON.parse(json!);
    expect(label).toBe('[cover-timing]');
    expect(record).toMatchObject({ src: 'https://images.unsplash.com/a.jpg', completeAtMount: true, retained: true, pixels: '4800x3200' });
    expect(typeof record.navToMount).toBe('number');
    expect(typeof record.decoded).toBe('number');
    expect(typeof record.painted).toBe('number');
    expect((globalThis as { __coverTiming?: unknown[] }).__coverTiming).toHaveLength(1);
  });

  it('traces an element and address once, however often it is asked', async () => {
    localStorage.setItem('clutter:cover-timing', '1');
    const img = fakeImage();

    traceCoverImage(img, { src: 'a', retained: false });
    traceCoverImage(img, { src: 'a', retained: false });
    await vi.waitFor(() => expect(console.info).toHaveBeenCalled());

    expect(img.decode).toHaveBeenCalledTimes(1);
  });

  it('records a decode failure instead of throwing', async () => {
    localStorage.setItem('clutter:cover-timing', '1');
    const img = fakeImage({ decode: vi.fn(async () => Promise.reject(new Error('bad'))), complete: false, naturalWidth: 0 });

    traceCoverImage(img, { src: 'broken', retained: false });
    await vi.waitFor(() => expect(console.info).toHaveBeenCalled());

    const record = JSON.parse((console.info as unknown as { mock: { calls: string[][] } }).mock.calls[0]![1]!);
    expect(record).toMatchObject({ decodeFailed: true, completeAtMount: false, pixels: null });
  });
});
