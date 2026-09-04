/**
 * The one canonical, ordered list of supported PDF zoom levels — extracted
 * from `PdfViewer.tsx` so a second consumer (the inline Markdown PDF embed
 * widget, `codemirror/pdf/PdfEmbedWidget.ts`) can share the exact same
 * zoom model rather than inventing a second one. The displayed percentage
 * is always exactly one of these values, and it is the SOURCE OF TRUTH:
 * `scale` (what PDF.js's `getViewport({scale})` receives) is derived from
 * it (`percent / 100`), never the reverse. Zoom in/out moves one index in
 * this array, never multiplies/divides the current floating-point scale —
 * that repeated-multiplication approach is what previously produced
 * non-canonical values (98%, 96%, ...) and accumulated float drift. Every
 * value here divides evenly by 100 with an exact IEEE-754 double
 * representation (each is n/4 for some integer n), so `percent / 100` is
 * exact at every level — there is no rounding step to drift across
 * repeated zoom operations.
 */
export const ZOOM_LEVELS_PERCENT = [50, 75, 100, 125, 150, 200, 250, 300, 400] as const;
export const DEFAULT_ZOOM_INDEX = ZOOM_LEVELS_PERCENT.indexOf(100);

/**
 * Steps a zoom index one canonical level in the given direction, clamped to
 * the array's bounds — the one shared implementation of "zoom in"/"zoom
 * out" every PDF zoom control (`PdfViewer`'s toolbar, the inline embed
 * widget's own minimal zoom controls) calls, so clamping/step semantics can
 * never drift between them.
 */
export function stepZoomIndex(index: number, direction: 'in' | 'out'): number {
  if (direction === 'in') {
    return Math.min(ZOOM_LEVELS_PERCENT.length - 1, index + 1);
  }
  return Math.max(0, index - 1);
}

/** The canonical percentage at a given index — never derived any other way. */
export function zoomPercentAt(index: number): number {
  return ZOOM_LEVELS_PERCENT[index] ?? 100;
}
