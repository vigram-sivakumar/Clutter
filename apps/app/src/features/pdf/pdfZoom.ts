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

/**
 * The two zoom regimes a PDF viewer can be in:
 *  - `'fit'` — the initial Fit-Width state. `scale` is a precisely computed
 *    PDF.js viewport scale (`availableWidth / pageBaseWidth`, see
 *    `computeFitScale`), not necessarily one of the canonical
 *    `ZOOM_LEVELS_PERCENT` values, and recomputed on every resize.
 *  - `'manual'` — the user has pressed Zoom in/out at least once. `index`
 *    is a canonical `ZOOM_LEVELS_PERCENT` index, exactly the zoom model
 *    this module already had. Never recomputed on resize.
 * The transition is one-directional for the life of a mounted viewer:
 * `stepZoomState` always returns `'manual'`, and nothing transitions back
 * to `'fit'` — once the user has chosen a zoom level, later resizes must
 * not silently override it.
 */
export type PdfZoomState =
  | { readonly kind: 'fit'; readonly scale: number }
  | { readonly kind: 'manual'; readonly index: number };

/** `scale <= 0` (not yet measurable — no container width or page width known yet) falls back to 1 (100%), never a zero/negative/NaN viewport scale. */
export function fitZoomState(scale: number): PdfZoomState {
  return { kind: 'fit', scale: scale > 0 ? scale : 1 };
}

export function manualZoomState(index: number): PdfZoomState {
  return { kind: 'manual', index };
}

/** The PDF.js viewport scale for a zoom state — what `page.getViewport({ scale })` actually receives. */
export function zoomStateScale(state: PdfZoomState): number {
  return state.kind === 'fit' ? state.scale : zoomPercentAt(state.index) / 100;
}

/** The displayed zoom percentage — rounded for presentation in `'fit'` state (the underlying scale used for rendering is never rounded), exact in `'manual'` state. */
export function zoomStateDisplayPercent(state: PdfZoomState): number {
  return state.kind === 'fit' ? Math.round(state.scale * 100) : zoomPercentAt(state.index);
}

/**
 * The PDF.js viewport scale that renders a page of `pageBaseWidth` (its own
 * natural width at scale 1 — `page.getViewport({ scale: 1 }).width`) at
 * exactly `availableWidth` CSS pixels wide, preserving aspect ratio (this
 * is the only dimension solved for — height follows from PDF.js's own
 * viewport math). Pure arithmetic, no DOM: `availableWidth`/`pageBaseWidth`
 * are measured by the caller (`getAvailableViewerWidth` in
 * `pdfFitWidth.ts` for the DOM half). Falls back to 1 (100%) when either
 * input isn't yet known (zero or negative) — the state before the first
 * layout measurement/page load resolves — never a divide-by-zero/NaN
 * scale. The result is not rounded; only its *display* is (see
 * `zoomStateDisplayPercent`).
 */
export function computeFitScale(availableWidth: number, pageBaseWidth: number): number {
  if (availableWidth <= 0 || pageBaseWidth <= 0) {
    return 1;
  }
  return availableWidth / pageBaseWidth;
}

/**
 * Steps zoom by one level in the given direction. From `'manual'`, this is
 * exactly `stepZoomIndex` (canonical index ± 1). From `'fit'`, this is the
 * one place a fit-to-width scale transitions into the canonical sequence:
 * `'in'` moves to the smallest canonical value strictly greater than the
 * current fit percentage; `'out'` moves to the largest canonical value
 * strictly less than it — both clamped to the array's bounds exactly like
 * `stepZoomIndex`. So e.g. a 137% fit scale steps to 150% on zoom in (never
 * 137% -> 125%, the nearest canonical value *below* it) and to 125% on zoom
 * out. The return value is always `'manual'` — see this module's own
 * `PdfZoomState` doc comment for why.
 */
export function stepZoomState(state: PdfZoomState, direction: 'in' | 'out'): PdfZoomState {
  if (state.kind === 'manual') {
    return manualZoomState(stepZoomIndex(state.index, direction));
  }

  const currentPercent = state.scale * 100;
  if (direction === 'in') {
    const index = ZOOM_LEVELS_PERCENT.findIndex((percent) => percent > currentPercent);
    return manualZoomState(index === -1 ? ZOOM_LEVELS_PERCENT.length - 1 : index);
  }
  let index = -1;
  for (let i = ZOOM_LEVELS_PERCENT.length - 1; i >= 0; i--) {
    if (ZOOM_LEVELS_PERCENT[i]! < currentPercent) {
      index = i;
      break;
    }
  }
  return manualZoomState(index === -1 ? 0 : index);
}

/** Whether the given zoom state is already at (or below) the minimum canonical level — used to disable the Zoom out control in both states, matching a fit scale against the same bound a manual index would clamp to. */
export function isZoomOutDisabled(state: PdfZoomState): boolean {
  if (state.kind === 'manual') {
    return state.index <= 0;
  }
  return state.scale * 100 <= ZOOM_LEVELS_PERCENT[0];
}

/** Whether the given zoom state is already at (or above) the maximum canonical level — used to disable the Zoom in control in both states. */
export function isZoomInDisabled(state: PdfZoomState): boolean {
  if (state.kind === 'manual') {
    return state.index >= ZOOM_LEVELS_PERCENT.length - 1;
  }
  return state.scale * 100 >= ZOOM_LEVELS_PERCENT[ZOOM_LEVELS_PERCENT.length - 1]!;
}
