import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { CompactMarkdownResolvers } from '@features/markdown/render/renderCompactMarkdown';
import { renderMarkdownBlocks } from '@features/markdown/render/renderMarkdownBlocks';
import './DocumentPreview.css';

/**
 * The injected resolution a DocumentPreview needs — the existing page
 * resolvers (WikiLink/Tag/page-embed/embed-image/image-src, built in
 * PageHost from the same factories the editor uses) plus
 * `resolveCoverImage`, `Application.resolveCoverImageForDisplay`'s shape
 * (a persisted cover reference -> a loadable URL, `null` when none).
 */
export interface DocumentPreviewResolvers extends CompactMarkdownResolvers {
  readonly resolveCoverImage?: (cover: string) => string | null;
}

export interface DocumentPreviewProps {
  /** The note's body Markdown (`EffectivePage.markdown` — no frontmatter). */
  markdown: string;
  resolvers?: DocumentPreviewResolvers;
}

/**
 * The canvas scale: (width available to the content) / (the fixed canvas
 * width), measured in JS and handed to CSS as a plain number. Deliberately
 * not a CSS expression (`tan(atan2(100cqw - …))`, container-unit division):
 * that depends on the webview evaluating CSS math inside a custom property,
 * and where it can't (the Tauri webview), the whole `transform` is dropped
 * and the canvas shows at its full, unscaled width. A measured number works
 * everywhere. `null` until the first measurement (the canvas stays hidden, so
 * there is no unscaled flash), and in environments with no layout at all.
 *
 * The canvas width itself is read from `--note-card-canvas-width`
 * (NoteCardGrid.css), the one place that number is defined.
 */
function useCanvasScale(ref: React.RefObject<HTMLElement | null>): number | null {
  const [scale, setScale] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const measure = () => {
      const style = getComputedStyle(element);
      const canvasWidth = parseFloat(style.getPropertyValue('--note-card-canvas-width'));
      const available = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (canvasWidth > 0 && available > 0) {
        setScale(available / canvasWidth);
      }
    };

    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return scale;
}

/** How far outside the viewport (px) a card may be before its preview is first rendered. */
const PRELOAD_MARGIN_PX = 400;

/**
 * True once the element has come within `PRELOAD_MARGIN_PX` of the
 * viewport — and stays true afterwards (the observer disconnects), so
 * scrolling back never re-parses. Environments without
 * `IntersectionObserver` (jsdom, very old webviews) render immediately.
 */
function useHasBeenNearViewport(ref: React.RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;
    if (near || !element) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: `${PRELOAD_MARGIN_PX}px` }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near, ref]);

  return near;
}

/**
 * The card's content section: a *fixed document canvas* seen through a window,
 * not responsive Markdown. The canvas always lays out at the same width
 * (`--note-card-canvas-width`), so line breaks, block heights, tables and
 * images are identical at every card size; only `transform: scale()` changes
 * (DocumentPreview.css derives the scale from the card width), and the
 * viewport clips whatever the scaled canvas leaves outside. This applies to
 * the content only — the cover is its own section of the card (NoteCard),
 * outside the canvas and not scaled with it.
 *
 * Rendering is `renderMarkdownBlocks` (shared Lezer parser, bounded
 * extraction, no CodeMirror, no EditorView, no anchors), mounted lazily by
 * `useHasBeenNearViewport`. The canvas is `pointer-events: none` and
 * `aria-hidden` — the enclosing card is the only interactive target. No
 * padding of its own beyond a 4px inline inset (icon-glyph alignment): the
 * card owns the padding and the gaps.
 */
export function DocumentPreview({ markdown, resolvers }: DocumentPreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const shouldRender = useHasBeenNearViewport(viewportRef);

  const scale = useCanvasScale(viewportRef);

  const body = useMemo(
    () => (shouldRender ? renderMarkdownBlocks(markdown, resolvers) : null),
    [shouldRender, markdown, resolvers]
  );

  return (
    <div ref={viewportRef} className="document-preview" aria-hidden="true">
      {shouldRender && (
        <div
          className="document-preview__canvas"
          // Scale is measured, not computed in CSS (see useCanvasScale); hidden until known.
          style={
            scale === null
              ? { visibility: 'hidden' }
              : ({ '--document-preview-scale': scale } as React.CSSProperties)
          }
        >
          <div className="document-preview__body">{body}</div>
        </div>
      )}
    </div>
  );
}
