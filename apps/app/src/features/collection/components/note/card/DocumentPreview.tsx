import { useLayoutEffect, useState } from 'react';

import type { CompactMarkdownResolvers } from '@features/markdown/render/renderCompactMarkdown';
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
export function useCanvasScale(ref: React.RefObject<HTMLElement | null>): number | null {
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
