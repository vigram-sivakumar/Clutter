import { getDocument } from 'pdfjs-dist';

import './pdfWorker';

/**
 * A PDF's first page as a small image, for list rows (the CM6 completion popup builds plain DOM,
 * so it cannot mount the React `AssetPdfPreview` the collection cards use).
 *
 * The result is a PNG data URL, cropped to cover a square `size` CSS pixels wide (top-aligned, so
 * the page's title area is what shows), drawn at `devicePixelRatio`. Cached per URL and size:
 * a popup re-renders its rows on every keystroke, and each must not re-parse the PDF. Resolves to
 * `null` for an unreadable PDF or a missing 2D context, so the caller can keep its icon.
 */
const cache = new Map<string, Promise<string | null>>();

export function renderPdfThumbnail(url: string, size: number): Promise<string | null> {
  const key = `${size}|${url}`;
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  const promise = render(url, size).catch(() => null);
  cache.set(key, promise);
  return promise;
}

async function render(url: string, size: number): Promise<string | null> {
  const loadingTask = getDocument(url);
  try {
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);
    const pixelRatio = window.devicePixelRatio || 1;
    const base = page.getViewport({ scale: 1 });
    // Scale so the page's width fills the square; a taller page is cropped at the bottom.
    const viewport = page.getViewport({ scale: (size * pixelRatio) / base.width });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(size * pixelRatio);
    canvas.height = Math.floor(size * pixelRatio);
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    // pdf.js leaves unpainted areas transparent; a page is white.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL('image/png');
  } finally {
    void loadingTask.destroy();
  }
}
