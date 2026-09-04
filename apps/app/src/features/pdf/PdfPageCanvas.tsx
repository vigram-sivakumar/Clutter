import { useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import { renderPdfPage, type RenderPdfPageHandle } from './pdfPageRenderer';

export interface PdfPageCanvasProps {
  readonly doc: PDFDocumentProxy;
  readonly pageNumber: number;
  readonly scale: number;
  /**
   * Fired when this page crosses the visibility threshold that makes it
   * "the" current page — see `PdfViewer`'s own `IntersectionObserver`-based
   * page-indicator tracking. Absent from this component's own render
   * concern; it only reports, `PdfViewer` decides what counts as current.
   */
  onVisible(pageNumber: number): void;
}

/**
 * Renders exactly one PDF page — the single-page-render primitive
 * `PdfViewer`'s vertical page stack mounts one of per page. Owns nothing
 * about zoom policy, page navigation, or the toolbar; only "given a page
 * and a scale, keep this page's visual + text output painted to match."
 *
 * The actual canvas/text-layer rendering (viewport computation,
 * `--scale-factor`, HiDPI `OutputScale` backing-store sizing,
 * `TextLayerBuilder`) lives in `pdfPageRenderer.ts`'s `renderPdfPage` —
 * extracted so the inline Markdown PDF embed widget
 * (`codemirror/pdf/PdfEmbedWidget.ts`, a raw-DOM CodeMirror `WidgetType`
 * with no React tree available to it) can reuse the exact same rendering
 * logic instead of a second implementation. This component is now just the
 * React lifecycle (mount refs, re-render on `[doc, pageNumber, scale]`
 * change, cancel on cleanup) plus visibility tracking.
 */
export function PdfPageCanvas({ doc, pageNumber, scale, onVisible }: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderHandleRef = useRef<RenderPdfPageHandle | null>(null);

  useEffect(() => {
    let cancelled = false;

    void doc.getPage(pageNumber).then((page) => {
      if (cancelled) {
        return;
      }

      const canvas = canvasRef.current;
      const textLayerContainer = textLayerContainerRef.current;
      const containerEl = containerRef.current;
      if (!canvas || !textLayerContainer || !containerEl) {
        return;
      }

      renderHandleRef.current?.cancel();
      renderHandleRef.current = renderPdfPage({ page, canvas, textLayerContainer, containerEl, scale });
    });

    return () => {
      cancelled = true;
      renderHandleRef.current?.cancel();
    };
  }, [doc, pageNumber, scale]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onVisible(pageNumber);
          }
        }
      },
      // Fires once a page is the dominant visible content, not on the
      // first sliver crossing into view — keeps the page indicator from
      // flickering between two adjacent pages during a scroll.
      { threshold: 0.5 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [pageNumber, onVisible]);

  return (
    <div ref={containerRef} className="pdf-viewer__page" data-page-number={pageNumber}>
      <canvas ref={canvasRef} className="pdf-viewer__page-canvas" />
      {/* Pure mount point — TextLayerBuilder creates and owns its own
          `.textLayer` div (appended here via replaceChildren), it does not
          accept an externally-supplied container the way the bare
          TextLayer primitive did. No CSS of its own: the mounted
          `.textLayer` div is itself `position: absolute; inset: 0`
          (pdf.js's own CSS, see PdfViewer.css), which resolves against
          `.pdf-viewer__page`'s own `position: relative` regardless of this
          intermediate static wrapper. */}
      <div ref={textLayerContainerRef} />
    </div>
  );
}
