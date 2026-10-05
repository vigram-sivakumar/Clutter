import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useHasBeenNearViewport } from './useHasBeenNearViewport';
import './ScaledCanvas.css';

export interface ScaledCanvasProps {
  /** The width, in px, the children are authored at (scale 1). */
  designWidth: number;
  /**
   * Render the children only once the canvas is near the viewport (then keep them), so a long
   * grid doesn't render hundreds of canvases up front. Default true.
   */
  lazy?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Lays its children out at `designWidth` — their canonical 1× size — and
 * scales the whole composition to the width it is given, so nothing inside is
 * "responsive": there is one design and this only picks the scale. Its own
 * height follows the scaled content.
 *
 * The scale is measured in JS and handed to CSS as a plain number, not
 * computed in CSS (a webview that can't evaluate CSS math inside a custom
 * property would drop the whole transform and show the canvas unscaled). The
 * canvas stays hidden until the first measurement, so there is no unscaled
 * flash. It is inert: no pointer events, hidden from assistive tech.
 * Knows nothing about what it scales.
 */
export function ScaledCanvas({ designWidth, lazy = true, className, children }: ScaledCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const shouldRender = useHasBeenNearViewport(viewportRef, lazy);
  const [scale, setScale] = useState<number | null>(null);
  const [canvasHeight, setCanvasHeight] = useState(0);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const canvas = canvasRef.current;
    const measure = () => {
      if (viewport.clientWidth > 0 && designWidth > 0) {
        setScale(viewport.clientWidth / designWidth);
      }
      if (canvas) {
        setCanvasHeight(canvas.offsetHeight);
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    if (canvas) {
      observer.observe(canvas);
    }
    return () => observer.disconnect();
  }, [designWidth, shouldRender]);

  const viewportStyle =
    scale !== null && canvasHeight > 0
      ? ({ height: canvasHeight * scale } as CSSProperties)
      : undefined;
  const canvasStyle = {
    width: designWidth,
    ...(scale === null ? { visibility: 'hidden' } : { '--scaled-canvas-scale': scale }),
  } as CSSProperties;

  return (
    <div
      ref={viewportRef}
      className={['scaled-canvas', className].filter(Boolean).join(' ')}
      style={viewportStyle}
      aria-hidden="true"
    >
      {shouldRender && (
        <div ref={canvasRef} className="scaled-canvas__canvas" style={canvasStyle}>
          {children}
        </div>
      )}
    </div>
  );
}
