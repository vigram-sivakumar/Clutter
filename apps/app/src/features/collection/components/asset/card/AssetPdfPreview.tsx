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
  /**
   * The wrapper's class — defaults to the card's own `asset-card__pdf`. The
   * table's media cell passes its own so the same first-page rendering can be
   * sized as a thumbnail without inheriting the card's layout.
   */
  readonly className?: string;
}

interface PreviewSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Page 1, scaled to cover the preview like an image's cover fit — at least
 * the preview's width, and at least its height when the page is too short to
 * fill it — through the existing PDF viewer pieces. A taller page is clipped
 * at the bottom (the page stays top-aligned), a wider one equally at both
 * sides. Mounted only once the card is near the screen.
 */
function FirstPage({ url, size }: { readonly url: string; readonly size: PreviewSize }) {
  const state = usePdfDocument(url);
  const [base, setBase] = useState<PreviewSize | null>(null);

  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }
    let cancelled = false;
    void state.doc.getPage(1).then((page) => {
      if (!cancelled) {
        const { width, height } = page.getViewport({ scale: 1 });
        setBase({ width, height });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (state.status === 'error') {
    return <AppIcon className="asset-card__fallback-icon" icon="pdf" />;
  }
  if (state.status !== 'ready' || base === null || size.width <= 0) {
    return null;
  }

  return (
    <PdfPageCanvas
      doc={state.doc}
      pageNumber={1}
      scale={coverScale(size, base)}
      onVisible={noop}
    />
  );
}

function coverScale(size: PreviewSize, base: PreviewSize): number {
  const fitWidth = computeFitScale(size.width, base.width);
  // Height isn't known until measured (computeFitScale would answer 1, not "no constraint").
  return size.height > 0 ? Math.max(fitWidth, computeFitScale(size.height, base.height)) : fitWidth;
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
export function AssetPdfPreview({ url, className = 'asset-card__pdf' }: AssetPdfPreviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useHasBeenNearViewport(ref);
  const [size, setSize] = useState<PreviewSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {near && <FirstPage url={url} size={size} />}
    </div>
  );
}
