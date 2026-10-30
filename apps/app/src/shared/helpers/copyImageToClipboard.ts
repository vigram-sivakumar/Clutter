import type { CopyNotifier } from './copyWithFeedback';

/** An image's file bytes. Its kind is read from the bytes themselves (`sniffImageType`), never from a declared type. */
export interface ImageBytes {
  readonly bytes: Uint8Array;
}

/** The image is a kind that cannot be put on the clipboard (SVG, a document, a damaged file): reported as such, not as a failure of the clipboard. */
export class UnsupportedImageError extends Error {
  constructor() {
    super('This kind of image can’t be copied.');
    this.name = 'UnsupportedImageError';
  }
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  signature.every((byte, index) => bytes[offset + index] === byte);

/**
 * The MIME type a bitmap image's own bytes say it is — not what a server or a file name claims, which are often
 * wrong — or null for anything that is not a raster format a webview can decode.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  if (startsWith(bytes, [0x42, 0x4d])) return 'image/bmp';
  return null;
}

/**
 * The image as PNG data: the one image type every clipboard accepts (WebKit's and Chromium's `ClipboardItem` alike),
 * so a JPEG, WebP, GIF or AVIF is decoded and redrawn as PNG. A PNG goes through untouched. Rejects with
 * `UnsupportedImageError` for anything else.
 */
export async function imageBytesToPng({ bytes }: ImageBytes): Promise<Blob> {
  const type = sniffImageType(bytes);

  if (!type) {
    throw new UnsupportedImageError();
  }

  const source = new Blob([bytes as BlobPart], { type });

  if (type === 'image/png') {
    return source;
  }

  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(source);
  } catch {
    throw new UnsupportedImageError();
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);

    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));

    if (!png) {
      throw new UnsupportedImageError();
    }

    return png;
  } finally {
    bitmap.close();
  }
}

/**
 * Puts an image on the system clipboard as image data — what pasting into another app's image field takes — through
 * the web `ClipboardItem` API, which the desktop webview (WebKit) and the browser both have; the Tauri build has no
 * clipboard plugin and none is needed for this.
 *
 * `load` is started and the clipboard write is made in the same turn, with the pending PNG handed to `ClipboardItem` as
 * a promise: WebKit only allows a clipboard write inside the user's click, and fetching or reading the image
 * takes longer than that.
 */
export async function copyImageToClipboard(load: () => Promise<ImageBytes>): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('Copying images isn’t supported here.');
  }

  const png = load().then(imageBytesToPng);

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  } catch (error) {
    // A write that failed because the image could not be loaded or decoded says why, not "not allowed".
    await png;
    throw error;
  }
}

/**
 * Copies an image and says so: `message` only once the clipboard accepted it; an unsupported kind of image, a failed
 * download or a refused clipboard each give an error toast — never a success before the write finished, and never an
 * unhandled rejection.
 */
export async function copyImageWithFeedback(
  load: () => Promise<ImageBytes>,
  message: string,
  notifier?: CopyNotifier
): Promise<void> {
  try {
    await copyImageToClipboard(load);
  } catch (error) {
    const text = error instanceof UnsupportedImageError ? error.message : 'Couldn’t copy the image';
    if (notifier) {
      notifier.fail(text, error instanceof UnsupportedImageError ? undefined : error);
    } else {
      console.error(text, error);
    }
    return;
  }

  notifier?.show({ text: message });
}
