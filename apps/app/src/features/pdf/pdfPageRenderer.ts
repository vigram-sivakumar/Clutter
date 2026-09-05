import { OutputScale } from 'pdfjs-dist';
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist';
// The reference-viewer wrapper around the bare `TextLayer` primitive —
// deliberately NOT `TextLayer` from the `pdfjs-dist` root import. See this
// module's own investigation notes, carried over from `PdfPageCanvas.tsx`,
// for why. Same package, a different bundle (`pdfjs-dist/web/pdf_viewer.mjs`).
import { TextLayerBuilder } from 'pdfjs-dist/web/pdf_viewer.mjs';

// pdf.js's own default cap (its reference viewer's AppOptions.maxCanvasPixels)
// — bounds a single page's backing-store pixel count so a high-dpr display
// at a high zoom doesn't grow the canvas unbounded; see this module's own
// devicePixelRatio comment below for why a cap is needed at all.
const MAX_CANVAS_PIXELS = 33_554_432;

export interface RenderPdfPageOptions {
  readonly page: PDFPageProxy;
  readonly canvas: HTMLCanvasElement;
  /** Mount point for the `TextLayerBuilder`'s own `.textLayer` div (it owns/creates that div itself; this is a pure mount point, replaced via `replaceChildren`). */
  readonly textLayerContainer: HTMLElement;
  /** The `--scale-factor` CSS variable is set here — see this module's own comment on that step for why it must live on the container that hosts both the canvas and the text layer. */
  readonly containerEl: HTMLElement;
  readonly scale: number;
}

export interface RenderPdfPageHandle {
  /** Cancels any in-flight canvas render and text-layer render — safe to call unconditionally, including when nothing is in flight. */
  cancel(): void;
}

/**
 * Renders exactly one PDF page into a caller-supplied canvas + text-layer
 * mount point — the single-page-render primitive originally inlined in
 * `PdfPageCanvas.tsx`'s own `useEffect`, extracted so a second, non-React
 * consumer (the inline Markdown PDF embed widget, a raw-DOM CodeMirror
 * `WidgetType` — no React tree is ever mounted inside one, see
 * `ImageWidget.ts`) can reuse the exact same rendering logic instead of a
 * second implementation. `PdfPageCanvas.tsx` itself is now a thin
 * `useEffect` wrapper around this function; its own behavior (and its
 * existing DPI/`--scale-factor`/text-layer tests) are unchanged — this is
 * the same code, relocated, not rewritten.
 *
 * Owns nothing about zoom policy, page navigation, visibility tracking, or
 * toolbar chrome — purely "given a page, a scale, and where to draw, keep
 * the visual + text output painted to match," exactly as `PdfPageCanvas`
 * already documented for itself.
 *
 * Two layers, kept in lockstep, mirroring pdfjs-dist's own reference
 * viewer pattern:
 *  - the `<canvas>` — backing-store sized by `devicePixelRatio` (via
 *    `OutputScale`, capped at `MAX_CANVAS_PIXELS`) while its CSS box stays
 *    at the logical viewport size — without this, the canvas is
 *    under-resolved by exactly `devicePixelRatio` at *every* zoom level
 *    identically, which reads as a blur that only "goes away" once glyphs
 *    are large enough for the deficit to stop being visible.
 *  - a `TextLayerBuilder` — real DOM text runs positioned exactly over the
 *    canvas, giving selectable/copyable text. Deliberately
 *    `TextLayerBuilder` (`pdfjs-dist/web/pdf_viewer.mjs`), not the bare
 *    `TextLayer` primitive: real natural cross-span/cross-line selection in
 *    Chromium/WebKit needs the `.endOfContent` sentinel element and the
 *    `.selecting`-class/`selectionchange` listener machinery
 *    `TextLayerBuilder` owns internally — PDF.js's own reference
 *    selection-compatibility layer, not something reimplemented here.
 *
 * Callers must invoke `cancel()` when the page/scale changes or the
 * consumer unmounts — pdfjs-dist's own `page.render()`/
 * `TextLayerBuilder.cancel()` guard against a second render starting on
 * the same canvas/text layer while one is still running, which a fast
 * zoom-in/zoom-out (or, for the embed widget, a fast page-nav) sequence
 * would otherwise trigger.
 */
export function renderPdfPage({
  page,
  canvas,
  textLayerContainer,
  containerEl,
  scale,
}: RenderPdfPageOptions): RenderPdfPageHandle {
  let renderTask: RenderTask | null = null;
  let textLayerBuilder: TextLayerBuilder | null = null;
  let cancelled = false;

  void (async () => {
    const viewport = page.getViewport({ scale });
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    // `--scale-factor` is a REQUIRED piece of PDF.js's own text-layer
    // contract, not something TextLayer/TextLayerBuilder/
    // setLayerDimensions ever set themselves — pdf.js's reference viewer
    // (pdf_viewer.mjs) always sets it on a page-level container itself.
    // Without it, every `calc(var(--scale-factor) * Npx)` expression
    // pdf.js's own TextLayer uses for each span's font-size is invalid at
    // computed-value time and silently falls back to the inherited
    // font-size instead of the PDF's actual scaled font size, which is
    // what produces wrong-but-plausible-looking selection geometry.
    containerEl.style.setProperty('--scale-factor', String(viewport.scale));

    // The canvas's backing store must be sized in *device* pixels (viewport
    // size × devicePixelRatio), while its CSS box stays at the logical
    // viewport size — otherwise, on any HiDPI display, the canvas is
    // permanently under-resolved by exactly devicePixelRatio, at every
    // zoom level equally.
    const outputScale = new OutputScale();
    const backingPixels = viewport.width * outputScale.sx * viewport.height * outputScale.sy;
    if (backingPixels > MAX_CANVAS_PIXELS) {
      const budgetScale = Math.sqrt(MAX_CANVAS_PIXELS / backingPixels);
      outputScale.sx *= budgetScale;
      outputScale.sy *= budgetScale;
    }

    canvas.width = Math.floor(viewport.width * outputScale.sx);
    canvas.height = Math.floor(viewport.height * outputScale.sy);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    if (cancelled) {
      return;
    }

    renderTask = page.render({
      canvasContext: context,
      viewport,
      // Draw commands are authored in the viewport's own (CSS-pixel)
      // coordinate space; this stretches them to fill the larger,
      // devicePixelRatio-scaled backing store — the same mechanism pdf.js's
      // own reference viewer uses (OutputScale + render's `transform` param).
      transform: outputScale.scaled ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0] : undefined,
    });

    renderTask.promise.catch(() => {
      // A cancelled in-flight render (superseded by a newer scale/page
      // request) rejects by design — nothing to surface as an error here;
      // callers own their own document-level error state.
    });

    if (cancelled) {
      return;
    }

    textLayerBuilder = new TextLayerBuilder({ pdfPage: page });
    textLayerContainer.replaceChildren(textLayerBuilder.div);

    try {
      await textLayerBuilder.render(viewport);
    } catch {
      // Same "a cancelled in-flight render rejects by design" contract as
      // `renderTask.promise.catch(() => {})` above, now applied to the
      // text-layer half too — confirmed as a real, pre-existing bug (not
      // hypothetical): `textLayerBuilder.cancel()` (this handle's own
      // `cancel()`, below) rejects this exact `await` with pdf.js's own
      // `AbortException: TextLayer task cancelled`, and because this whole
      // function body is an async IIFE invoked via `void (async () =>
      // {...})()`, an unguarded rejection here had nowhere to go but an
      // unhandled promise rejection — reproducible on every legitimate
      // cancellation (a resize commit's own `renderHandle?.cancel()` +
      // fresh `renderCurrentPage()`, a fast page-nav, a widget teardown),
      // not just a resize-specific one.
    }
  })();

  return {
    cancel() {
      cancelled = true;
      renderTask?.cancel();
      textLayerBuilder?.cancel();
    },
  };
}
