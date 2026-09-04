import { useCallback, useRef, useState } from 'react';

import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
import type { LocationPathFormat } from '@core/presentation/getLocationPathRepresentations';

import { usePdfDocument } from './usePdfDocument';
import { PdfPageCanvas } from './PdfPageCanvas';
import { PdfViewerMoreActions } from './PdfViewerMoreActions';
import { DEFAULT_ZOOM_INDEX, ZOOM_LEVELS_PERCENT, stepZoomIndex, zoomPercentAt } from './pdfZoom';

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
 * canonical zoom sequence (`ZOOM_LEVELS_PERCENT`, default 100%) with a
 * percentage indicator, page navigation with a current-page indicator, and
 * a real selectable/copyable text layer (`PdfPageCanvas`'s own
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

  // The canonical zoom level is an INDEX into ZOOM_LEVELS_PERCENT, never a
  // freestanding float — this is what makes "zoom in" / "zoom out" a pure
  // step between fixed, predefined values instead of a repeated
  // multiply/divide of the previous scale (the source of the old 98%/96%
  // drift). Starts at exactly 100% on every mount — a fresh `PdfViewer`
  // mount is exactly what happens each time a PDF is opened (`PdfOverlay`
  // only ever renders one at a time, always via `resource: null → real
  // resource`, never swapping `url` under a persisting instance), so no
  // separate "reset zoom when the document changes" effect is needed.
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [currentPage, setCurrentPage] = useState(1);

  const zoomIn = useCallback(() => {
    setZoomIndex((current) => stepZoomIndex(current, 'in'));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomIndex((current) => stepZoomIndex(current, 'out'));
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
  // The canonical percentage IS the displayed value — never derived from
  // `scale` (which is itself derived FROM this, one line below, for the
  // one place PDF.js actually needs a fraction: `getViewport({scale})`).
  // `zoomIndex` is always kept in [0, length-1] by zoomIn/zoomOut/the
  // initial state, so this index access is always defined — the `?? 100`
  // is a type-level safety net only, never an actual runtime fallback.
  const zoomPercent = zoomPercentAt(zoomIndex);
  const scale = zoomPercent / 100;

  return (
    <div className="pdf-viewer">
      <div className="pdf-viewer__toolbar">
        <span className="pdf-viewer__title" title={title}>
          {title}
        </span>

        <div className="pdf-viewer__toolbar-controls">
          {state.status === 'ready' && (
            <>
              <div className="pdf-viewer__control-group">
                <Button
                  size="small"
                  variant="ghost"
                  interaction="subtle"
                  isIconOnly
                  onClick={zoomOut}
                  disabled={zoomIndex <= 0}
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
                  disabled={zoomIndex >= ZOOM_LEVELS_PERCENT.length - 1}
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
        {state.status === 'loading' && (
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
