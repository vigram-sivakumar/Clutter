import { useMemo, useRef } from 'react';

import { renderMarkdownBlocks } from '@features/markdown/render/renderMarkdownBlocks';
import { useHasBeenNearViewport } from '../../card/useHasBeenNearViewport';
import {
  useCanvasScale,
  type DocumentPreviewResolvers,
} from './DocumentPreview';
import './DocumentPreview.css';
import './PageCanvasPreview.css';

export interface PageCanvasPreviewProps {
  /** The note's body Markdown (no frontmatter). */
  markdown: string;
  /** The persisted cover reference; shown at the top of the canvas when it resolves and is not hidden. */
  cover?: string | null;
  coverHidden?: boolean;
  coverPositionAbove?: number;
  resolvers?: DocumentPreviewResolvers;
  /** Extra class on the viewport (e.g. the headless inset). */
  className?: string;
}

/**
 * A note's cover + body as ONE canonical page canvas (`--note-card-canvas-width`
 * wide, in document pixels), scaled as a unit to the width it is given — the
 * cover and the text keep the same proportions at every size. No header: the
 * host owns whatever sits around it. Inert (`pointer-events: none`,
 * `aria-hidden`) — never a click target. Reuses DocumentPreview's viewport,
 * canvas and block typography (DocumentPreview.css) and its measured scale.
 */
export function PageCanvasPreview({
  markdown,
  cover,
  coverHidden,
  coverPositionAbove,
  resolvers,
  className,
}: PageCanvasPreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  // Parsed/rendered only once the card is near the viewport (a grid can hold hundreds), then kept.
  const shouldRender = useHasBeenNearViewport(viewportRef);
  const scale = useCanvasScale(viewportRef);
  const body = useMemo(
    () => (shouldRender ? renderMarkdownBlocks(markdown, resolvers) : null),
    [shouldRender, markdown, resolvers]
  );
  const coverUrl =
    cover && !coverHidden
      ? (resolvers?.resolveCoverImage?.(cover) ?? null)
      : null;

  return (
    <div
      ref={viewportRef}
      className={['document-preview', 'page-canvas-preview', className].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      {shouldRender && (
      <div
        className="document-preview__canvas"
        style={
          scale === null
            ? { visibility: 'hidden' }
            : ({ '--document-preview-scale': scale } as React.CSSProperties)
        }
      >
        {coverUrl && (
          <img
            className="page-canvas-preview__cover"
            src={coverUrl}
            alt=""
            draggable={false}
            loading="lazy"
            style={{ objectPosition: `50% ${coverPositionAbove ?? 50}%` }}
          />
        )}
        <div className="document-preview__body">{body}</div>
      </div>
      )}
    </div>
  );
}
