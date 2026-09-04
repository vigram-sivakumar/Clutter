import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist';

/**
 * Caches an in-flight/loaded `PDFDocumentProxy` per URL, scoped to one
 * `embedLivePreview()` extension instance (one per `EditorView` — see
 * `embedLivePreview.ts`'s own `ViewPlugin`, which owns one of these and
 * destroys it wholesale when the extension itself is torn down).
 *
 * **Why this exists (2026-09 PDF edit-source flicker fix).** A `PdfEmbedWidget`
 * is destroyed and reconstructed from scratch every time its embed's
 * `revealed` flag toggles (Edit source / leave source) — this is not a bug
 * on its own, it's the same `Decoration.replace` → `Decoration.widget`
 * type change `ImageWidget`'s own reveal transition already goes through
 * (`embedLivePreview.ts`/`imageLivePreview.ts`'s shared `buildDecorations`
 * shape), which CM6 always treats as remove-old/add-new regardless of
 * `eq()`. For a standard image this reconstruction is invisible: a fresh
 * `<img src>` for an already-fetched URL resolves from the browser's own
 * HTTP/image cache in a fraction of a frame. A PDF has no such free
 * built-in cache — every fresh `PdfEmbedWidget` calling `getDocument(url)`
 * directly re-issued the full network fetch + pdf.js worker parse from
 * scratch, which is slow enough to be visibly a "disappear, then a loading
 * spinner, then the PDF re-renders" flash rather than one clean transition.
 * Caching the loaded document here — reused across every reconstruction
 * for the same URL — closes that gap: a reveal/hide toggle only re-runs
 * the comparatively fast per-page canvas render (`pdfPageRenderer.ts`), not
 * the network fetch/parse.
 *
 * **Ownership, not per-widget destroy.** Individual `PdfEmbedWidget`
 * instances never call `doc.destroy()` themselves (unlike `usePdfDocument.ts`,
 * whose one-`PdfViewer`-per-open lifecycle makes per-mount destroy correct)
 * — a widget for the same URL is routinely reconstructed many times across
 * a single editing session, and there is no reliable, race-free point at
 * an individual widget's own `destroy()` to know whether some other,
 * about-to-be-mounted widget for the *same* URL still needs the cached
 * document. Ownership is pushed up to this cache's own lifetime instead:
 * `destroyAll()` is called exactly once, when the whole extension is torn
 * down (`embedLivePreview.ts`'s `ViewPlugin.destroy()` — i.e. when the
 * `MarkdownEditor` itself unmounts), which is the one point at which no
 * widget for any URL in this document can possibly still need it.
 */
export interface PdfDocumentCache {
  get(url: string): Promise<PDFDocumentProxy>;
  destroyAll(): void;
}

export function createPdfDocumentCache(): PdfDocumentCache {
  const entries = new Map<string, Promise<PDFDocumentProxy>>();

  return {
    get(url) {
      const existing = entries.get(url);
      if (existing) {
        return existing;
      }

      const promise = getDocument(url).promise;
      entries.set(url, promise);
      // A failed load must not poison the cache forever — a missing/corrupt
      // PDF that's later fixed (rename-back, replaced file) should get a
      // genuinely fresh attempt on the next reveal-toggle/rebuild, not a
      // permanently-rejecting cached promise.
      promise.catch(() => {
        if (entries.get(url) === promise) {
          entries.delete(url);
        }
      });
      return promise;
    },

    destroyAll() {
      for (const promise of entries.values()) {
        promise.then((doc) => doc.destroy()).catch(() => {});
      }
      entries.clear();
    },
  };
}
