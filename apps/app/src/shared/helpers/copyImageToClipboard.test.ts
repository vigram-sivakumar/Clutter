// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { copyImageToClipboard, copyImageWithFeedback, imageBytesToPng, sniffImageType, UnsupportedImageError } from './copyImageToClipboard';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const AVIF = Uint8Array.from([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const HTML = new TextEncoder().encode('<!doctype html><html></html>');

/** A `ClipboardItem` that keeps what it was given, so a test can see what would reach the clipboard. */
class FakeClipboardItem {
  constructor(readonly items: Record<string, Promise<Blob> | Blob>) {}
}

let write: ReturnType<typeof vi.fn>;

beforeEach(() => {
  write = vi.fn(async (items: FakeClipboardItem[]) => {
    // Like the real clipboard, wait for every pending value; a rejected one rejects the write.
    for (const item of items) await Promise.all(Object.values(item.items));
  });
  vi.stubGlobal('ClipboardItem', FakeClipboardItem);
  Object.defineProperty(navigator, 'clipboard', { value: { write, writeText: vi.fn() }, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sniffImageType', () => {
  it.each([
    ['PNG', PNG, 'image/png'],
    ['JPEG', JPEG, 'image/jpeg'],
    ['GIF', GIF, 'image/gif'],
    ['WebP', WEBP, 'image/webp'],
    ['AVIF', AVIF, 'image/avif'],
  ])('reads %s from its own bytes', (_name, bytes, type) => {
    expect(sniffImageType(bytes)).toBe(type);
  });

  it('is null for SVG, HTML and unknown bytes — it never trusts a declared type', () => {
    expect(sniffImageType(SVG)).toBeNull();
    expect(sniffImageType(HTML)).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe('imageBytesToPng', () => {
  it('passes a PNG through untouched, as image data', async () => {
    const blob = await imageBytesToPng({ bytes: PNG });

    expect(blob.type).toBe('image/png');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(PNG);
  });

  it('redraws a JPEG as a PNG', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4, height: 3, close })));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) =>
      callback(new Blob(['png'], { type: type ?? '' }))
    );

    const blob = await imageBytesToPng({ bytes: JPEG });

    expect(blob.type).toBe('image/png');
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalled();
  });

  it.each([['SVG', SVG], ['HTML', HTML]])('refuses %s as an unsupported image', async (_name, bytes) => {
    await expect(imageBytesToPng({ bytes })).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it('refuses an image the webview cannot decode', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('bad'))));

    await expect(imageBytesToPng({ bytes: GIF })).rejects.toBeInstanceOf(UnsupportedImageError);
  });
});

describe('copyImageToClipboard', () => {
  it('writes one image/png item — image data, never text — and no plain-text entry', async () => {
    await copyImageToClipboard(async () => ({ bytes: PNG }));

    expect(write).toHaveBeenCalledTimes(1);
    const [items] = write.mock.calls[0] as [FakeClipboardItem[]];
    expect(items).toHaveLength(1);
    expect(Object.keys(items[0]!.items)).toEqual(['image/png']);
    const blob = await items[0]!.items['image/png'];
    expect((blob as Blob).type).toBe('image/png');
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('makes the clipboard write in the same turn it starts loading, so the click still counts as the user gesture', () => {
    let loaded = false;
    void copyImageToClipboard(async () => {
      await Promise.resolve();
      loaded = true;
      return { bytes: PNG };
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(loaded).toBe(false);
  });

  it('rejects with the loading error when the image cannot be fetched or read', async () => {
    await expect(copyImageToClipboard(async () => Promise.reject(new Error('Could not download x (404).')))).rejects.toThrow(
      'Could not download x (404).'
    );
  });

  it('rejects as unsupported for an image kind that cannot be copied', async () => {
    await expect(copyImageToClipboard(async () => ({ bytes: SVG }))).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it('rejects with the clipboard’s own error when it refuses the write', async () => {
    write.mockRejectedValueOnce(new Error('NotAllowedError'));

    await expect(copyImageToClipboard(async () => ({ bytes: PNG }))).rejects.toThrow('NotAllowedError');
  });

  it('says so when the runtime has no image clipboard', async () => {
    vi.stubGlobal('ClipboardItem', undefined);

    await expect(copyImageToClipboard(async () => ({ bytes: PNG }))).rejects.toThrow('isn’t supported');
  });
});

describe('copyImageWithFeedback', () => {
  const notifier = () => ({ show: vi.fn(), fail: vi.fn() });

  it('shows the success message only after the clipboard accepted the image', async () => {
    const n = notifier();
    let accepted = false;
    write.mockImplementationOnce(async () => {
      await Promise.resolve();
      accepted = true;
    });
    n.show.mockImplementation(() => expect(accepted).toBe(true));

    await copyImageWithFeedback(async () => ({ bytes: PNG }), 'Image copied', n);

    expect(n.show).toHaveBeenCalledWith({ text: 'Image copied' });
    expect(n.fail).not.toHaveBeenCalled();
  });

  it('reports an unsupported kind of image with its own message, and no success', async () => {
    const n = notifier();

    await copyImageWithFeedback(async () => ({ bytes: SVG }), 'Image copied', n);

    expect(n.fail).toHaveBeenCalledWith('This kind of image can’t be copied.', undefined);
    expect(n.show).not.toHaveBeenCalled();
  });

  it.each([
    ['a network failure', async () => Promise.reject(new Error('offline'))],
    ['a permission error', async () => Promise.reject(new Error('forbidden by scope'))],
  ])('reports %s as an error toast with no success and no unhandled rejection', async (_name, load) => {
    const n = notifier();

    await expect(copyImageWithFeedback(load, 'Image copied', n)).resolves.toBeUndefined();

    expect(n.fail).toHaveBeenCalledWith('Couldn’t copy the image', expect.any(Error));
    expect(n.show).not.toHaveBeenCalled();
  });

  it('reports a refused clipboard write', async () => {
    const n = notifier();
    write.mockRejectedValueOnce(new Error('NotAllowedError'));

    await copyImageWithFeedback(async () => ({ bytes: PNG }), 'Image copied', n);

    expect(n.fail).toHaveBeenCalledWith('Couldn’t copy the image', expect.any(Error));
    expect(n.show).not.toHaveBeenCalled();
  });

  it('logs instead of throwing when there is no notifier', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(copyImageWithFeedback(async () => Promise.reject(new Error('x')), 'Image copied')).resolves.toBeUndefined();

    expect(log).toHaveBeenCalled();
  });
});
