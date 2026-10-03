import { useEffect, useRef, useState } from 'react';

import { AppIcon } from '@shared/icon';
import { PdfPageCanvas } from '@features/pdf/PdfPageCanvas';
import { usePdfDocument } from '@features/pdf/usePdfDocument';
import { computeFitScale } from '@features/pdf/pdfZoom';
import '@features/pdf/PdfViewer.css';

import { useHasBeenNearViewport } from '../../card/useHasBeenNearViewport';

export interface AssetPdfPreviewProps {
  /** The resolved, loadable PDF URL (`Application.resolveResourceImageUrl`, the same one the PDF viewer opens). */
  readonly url: string;
}

/** Page 1, fit to the preview's width, through the existing PDF viewer pieces. Mounted only once the card is near the screen. */
function FirstPage({ url, width }: { readonly url: string; readonly width: number }) {
  const state = usePdfDocument(url);
  const [baseWidth, setBaseWidth] = useState<number | null>(null);

  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }
    let cancelled = false;
    void state.doc.getPage(1).then((page) => {
      if (!cancelled) {
        setBaseWidth(page.getViewport({ scale: 1 }).width);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (state.status === 'error') {
    return <AppIcon className="asset-card__fallback-icon" icon="pdf" />;
  }
  if (state.status !== 'ready' || baseWidth === null || width <= 0) {
    return null;
  }

  return (
    <PdfPageCanvas
      doc={state.doc}
      pageNumber={1}
      scale={computeFitScale(width, baseWidth)}
      onVisible={noop}
    />
  );
}

function noop(): void {
  // The viewer tracks the "current page" from this; a one-page preview has nothing to track.
}

/**
 * The asset card's PDF representation: the first page, rendered by the same
 * pdf.js pieces the PDF viewer uses (`usePdfDocument` + `PdfPageCanvas`) — no
 * new PDF loading path. Lazy: nothing is fetched or parsed until the card is
 * near the viewport (the shared `useHasBeenNearViewport`). Shows the PDF icon
 * while loading is impossible to render or if the file fails to load.
 */
export function AssetPdfPreview({ url }: AssetPdfPreviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useHasBeenNearViewport(ref);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const measure = () => setWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="asset-card__pdf">
      {near && <FirstPage url={url} width={width} />}
    </div>
  );
}
