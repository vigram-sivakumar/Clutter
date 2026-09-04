import { useEffect, useRef, useState } from 'react';
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist';

import './pdfWorker';

export type PdfDocumentState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly doc: PDFDocumentProxy; readonly numPages: number };

/**
 * Loads a PDF document from a loadable URL (see `PdfOverlay`'s own
 * `resolveResourceUrl` — the same `Application.resolveResourceImageUrl`
 * every image call site already uses, kind-agnostic despite its name).
 * Deliberately just `{status, doc, numPages}` — no page-render concern
 * here, that's `PdfPageCanvas`'s own job once a `doc` is available.
 *
 * A corrupted/invalid/unsupported PDF surfaces as `getDocument().promise`
 * rejecting (pdfjs-dist's own `InvalidPDFException`/`MissingPDFException`/
 * etc.) — collapsed to a single `'error'` status, matching the broken-
 * resource pattern `ImageWidget`'s own `renderBroken()` already
 * establishes (one generic broken state, not per-failure-reason UI).
 */
export function usePdfDocument(url: string): PdfDocumentState {
  const [state, setState] = useState<PdfDocumentState>({ status: 'loading' });
  // Guards against setting state from a stale load after the url changes or
  // the component unmounts mid-fetch — the same cancellation-guard shape
  // every other async-effect-with-state hook in this codebase already uses.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setState({ status: 'loading' });

    const loadingTask = getDocument(url);

    loadingTask.promise
      .then((doc) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setState({ status: 'ready', doc, numPages: doc.numPages });
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setState({ status: 'error' });
      });

    return () => {
      requestIdRef.current++;
      void loadingTask.destroy();
    };
  }, [url]);

  return state;
}
