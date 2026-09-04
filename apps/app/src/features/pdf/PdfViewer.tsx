import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
import type { LocationPathFormat } from '@core/presentation/getLocationPathRepresentations';

import { usePdfDocument } from './usePdfDocument';
import { PdfPageCanvas } from './PdfPageCanvas';
import { PdfViewerMoreActions } from './PdfViewerMoreActions';
import { getAvailableViewerWidth } from './pdfFitWidth';
import {
  computeFitScale,
  fitZoomState,
  isZoomInDisabled,
  isZoomOutDisabled,
  stepZoomState,
  zoomStateDisplayPercent,
  zoomStateScale,
  type PdfZoomState,
} from './pdfZoom';

import './PdfViewer.css';

export interface PdfViewerProps {
  readonly url: string;
  readonly title: string;
  /**
   * Present only when this PDF resolved to a real `VaultResource`. The
   * "More actions" control also requires at least one action callback
   * below to actually be wired — together these mirror exactly how the
   * Archive-view `ImageOverlay` call site (`PageHost.tsx`) omits
   * `resourceId` entirely and gets no More Actions button at all, versus
   * the Assets-view one, which gets both and shows the full menu.
   */
  readonly resourceId?: string;
  readonly onArchiveResource?: (resourceId: string) => void;
  readonly onRevealResourceInFinder?: (resourceId: string) => void;
  readonly onCopyResourcePath?: (
    resourceId: string,
    format: LocationPathFormat
  ) => void;
  readonly resourceMoveDestinations?: FolderPickerItem[];
  readonly onMoveResource?: (
    resourceId: string,
    destinationFolderId: string | null
  ) => void;
  readonly onCreateFolder?: (name: string) => Promise<string>;
}

/**
 * Owns the PDF.js document/render lifecycle and the viewer chrome around
 * it (toolbar + vertically-scrolling page stack) — `PdfOverlay` owns only
 * the `Overlay` shell around this, never anything PDF.js-shaped, mirroring
 * the split `ImageOverlay`/its plain `<img>` already keep.
 *
 * Stage 1 scope: loading/error states, multi-page vertical scroll, a
 * Fit-Width default (recalculated on resize until the user manually zooms,
 * then a canonical zoom sequence — `ZOOM_LEVELS_PERCENT`, see `pdfZoom.ts`)
 * with a percentage indicator, page navigation with a current-page
 * indicator, and a real selectable/copyable text layer (`PdfPageCanvas`'s own
 * `TextLayerBuilder`, kept aligned with the canvas at every scale) — not a
 * flattened bitmap.
 * No search UI yet (the underlying text layer this would search is in
 * place, just no find bar), no annotations, thumbnails, printing, or
 * download — see the
 * project's PDF research report for why those are later-phase work.
 *
 * No explicit Close control — same as `ImageOverlay`, closing is Escape/
 * backdrop-click, `Overlay`'s own existing behavior (`PdfOverlay`'s own
 * `onClose` wiring), never re-implemented here. The toolbar's own trailing
 * slot is "More actions" instead (`PdfViewerMoreActions` — the same
 * Resource menu the sidebar's own PDF row exposes).
 */
export function PdfViewer({
  url,
  title,
  resourceId,
  onArchiveResource,
  onRevealResourceInFinder,
  onCopyResourcePath,
  resourceMoveDestinations,
  onMoveResource,
  onCreateFolder,
}: PdfViewerProps) {
  const state = usePdfDocument(url);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Zoom starts in `'fit'` state (Fit-Width) on every mount — a fresh
  // `PdfViewer` mount is exactly what happens each time a PDF is opened
  // (`PdfOverlay` only ever renders one at a time, always via
  // `resource: null → real resource`, never swapping `url` under a
  // persisting instance), so no separate "reset zoom when the document
  // changes" effect is needed. `zoomIn`/`zoomOut` (`stepZoomState`) always
  // transition it to `'manual'` and it never transitions back — see
  // `pdfZoom.ts`'s own `PdfZoomState` doc comment.
  const [zoomState, setZoomState] = useState<PdfZoomState>(fitZoomState(1));
  const [currentPage, setCurrentPage] = useState(1);

  // The page's own natural width at scale 1 (`page.getViewport({ scale: 1
  // }).width`) — the `pageBaseWidth` half of the Fit-Width calculation
  // (`computeFitScale`). Fetched once per document (page 1's size is used
  // for the whole document — every page in the stack shares one `scale`
  // already, see the `scale` prop passed to every `PdfPageCanvas` below).
  const [pageBaseWidth, setPageBaseWidth] = useState<number | null>(null);

  useEffect(() => {
    if (state.status !== 'ready') {
      setPageBaseWidth(null);
      return;
    }
    let cancelled = false;
    void state.doc.getPage(1).then((page) => {
      if (cancelled) {
        return;
      }
      setPageBaseWidth(page.getViewport({ scale: 1 }).width);
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  // The `availableWidth` half of the Fit-Width calculation — the scroll
  // container's own content width, kept live via `ResizeObserver` so
  // resizing the overlay/window while still in `'fit'` state recalculates
  // and re-renders at the new fit scale (product requirement: resize).
  const [availableWidth, setAvailableWidth] = useState(0);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    const measure = () => setAvailableWidth(getAvailableViewerWidth(container));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Recomputes the fit scale whenever either half of the calculation
  // changes — but only while still in `'fit'` state; once the user has
  // manually zoomed (`'manual'`), resize must never override their choice.
  useEffect(() => {
    setZoomState((current) => {
      if (current.kind !== 'fit') {
        return current;
      }
      return fitZoomState(computeFitScale(availableWidth, pageBaseWidth ?? 0));
    });
  }, [availableWidth, pageBaseWidth]);

  const zoomIn = useCallback(() => {
    setZoomState((current) => stepZoomState(current, 'in'));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomState((current) => stepZoomState(current, 'out'));
  }, []);

  const goToPage = useCallback((pageNumber: number) => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    const target = container.querySelector<HTMLElement>(
      `[data-page-number="${pageNumber}"]`
    );
    target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  const numPages = state.status === 'ready' ? state.numPages : 0;
  // Toolbar/pages stay gated behind `pageBaseWidth` being known, not just
  // `status === 'ready'` — rendering before the Fit-Width calculation's
  // second half resolves would flash an incorrect 100% (or any other
  // placeholder) before snapping to the real fit scale, which the product
  // requirement explicitly rules out ("Do NOT force the initial view to
  // 100%").
  const ready = state.status === 'ready' && pageBaseWidth !== null;
  const zoomPercent = zoomStateDisplayPercent(zoomState);
  const scale = zoomStateScale(zoomState);

  return (
    <div className="pdf-viewer">
      <div className="pdf-viewer__toolbar">
        <span className="pdf-viewer__title" title={title}>
          {title}
        </span>

        <div className="pdf-viewer__toolbar-controls">
          {ready && (
            <>
              <div className="pdf-viewer__control-group">
                <Button
                  size="small"
                  variant="ghost"
                  interaction="subtle"
                  isIconOnly
                  onClick={zoomOut}
                  disabled={isZoomOutDisabled(zoomState)}
                  aria-label="Zoom out"
                >
                  <AppIcon icon="minus" />
                </Button>
                <span className="pdf-viewer__zoom-indicator">{zoomPercent}%</span>
                <Button
                  size="small"
                  variant="ghost"
                  interaction="subtle"
                  isIconOnly
                  onClick={zoomIn}
                  disabled={isZoomInDisabled(zoomState)}
                  aria-label="Zoom in"
                >
                  <AppIcon icon="plus" />
                </Button>
              </div>

              {numPages > 1 && (
                <div className="pdf-viewer__control-group">
                  <Button
                    size="small"
                    variant="ghost"
                    interaction="subtle"
                    isIconOnly
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    aria-label="Previous page"
                  >
                    <AppIcon icon="arrowLeft" />
                  </Button>
                  <span className="pdf-viewer__page-indicator">
                    {currentPage} / {numPages}
                  </span>
                  <Button
                    size="small"
                    variant="ghost"
                    interaction="subtle"
                    isIconOnly
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage >= numPages}
                    aria-label="Next page"
                  >
                    <AppIcon icon="arrowRight" />
                  </Button>
                </div>
              )}
            </>
          )}

          {resourceId &&
            (onArchiveResource ||
              onRevealResourceInFinder ||
              onCopyResourcePath ||
              onMoveResource) && (
              <PdfViewerMoreActions
                resourceId={resourceId}
                onArchiveResource={onArchiveResource}
                onRevealResourceInFinder={onRevealResourceInFinder}
                onCopyResourcePath={onCopyResourcePath}
                resourceMoveDestinations={resourceMoveDestinations}
                onMoveResource={onMoveResource}
                onCreateFolder={onCreateFolder}
              />
            )}
        </div>
      </div>

      <div className="pdf-viewer__scroll" ref={scrollRef}>
        {(state.status === 'loading' || (state.status === 'ready' && !ready)) && (
          <div className="pdf-viewer__status">
            <span className="pdf-viewer__spinner" aria-hidden="true" />
            <span>Loading PDF…</span>
          </div>
        )}

        {state.status === 'error' && (
          <div className="pdf-viewer__status pdf-viewer__status--error">
            <AppIcon icon="exclamation" />
            <span>Couldn&rsquo;t open this PDF</span>
          </div>
        )}

        {state.status === 'ready' &&
          ready &&
          Array.from({ length: state.numPages }, (_, index) => index + 1).map(
            (pageNumber) => (
              <PdfPageCanvas
                key={pageNumber}
                doc={state.doc}
                pageNumber={pageNumber}
                scale={scale}
                onVisible={setCurrentPage}
              />
            )
          )}
      </div>
    </div>
  );
}
