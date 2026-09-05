import type { EditorView } from '@codemirror/view';

import { getAvailableViewerWidth } from '@features/pdf/pdfFitWidth';

import type { MediaAlignment } from './mediaPresentationModel';

/**
 * Applies a persisted `width` value (`mediaPresentationModel.ts`'s
 * encoding: 1–10 proportional, 11 = full/default, 12+ pixel) to `target` —
 * the element that should actually carry the width. `ImageWidget.ts`
 * always passes its outer container, for both Fill and Fit alike — the
 * custom-width feature is mode-agnostic; only the container's own
 * height/crop behavior differs by mode (`.cm-image-container--fill`/
 * `--fit`, MarkdownEditor.css). Neither mode's own `<img>` ever receives
 * a width of its own — it's always `width: 100%` of whatever the
 * container resolves to. `PdfEmbedWidget.ts` likewise always passes its
 * outer container (a PDF has no per-mode sizing mechanism to interact
 * with). Purely a static value read from persisted Markdown — never a
 * drag/pointer interaction; the `ResizeObserver` below only ever reacts
 * to the *editor's* own column resizing.
 *
 * Three cases, matching the locked width encoding:
 * - **11 (full/default)**: clears any inline width — falls back to
 *   whatever the mode's own CSS already does (100% for Fill, natural size
 *   capped at `max-width: 100%` for Large/Fit/PDF). No observer needed —
 *   this is the pre-existing, already-fluid behavior.
 * - **1–10 (proportional)**: a CSS `calc()` percentage of the target's own
 *   containing block — inherently responsive to the editor's content
 *   width changing (pure CSS, re-resolved by the browser on every layout),
 *   so this needs no `ResizeObserver` either.
 * - **12+ (pixel)**: an absolute size, which the locked "minimum/maximum
 *   clamp... when rendering" requirement still ties to the *current*
 *   available content width — the one case that genuinely needs to react
 *   live to the editor resizing. A `ResizeObserver` on `view.contentDOM`
 *   (the same "available Markdown content width" source
 *   `getAvailableViewerWidth` is reused against everywhere else in this
 *   milestone) re-clamps and reapplies on every resize, mirroring
 *   `PdfEmbedWidget.ts`'s own established "observe, recompute, reapply"
 *   pattern for its per-page fit-to-width scale.
 *
 * `observerHolder` is a plain `{ current }` box the caller owns (mirrors
 * `PdfEmbedWidget.ts`'s own plain-closure, non-CM6-state ephemeral fields)
 * — this function disconnects whatever observer it previously created
 * before deciding whether a new one is needed, so calling it again (a
 * resize preview, a resize commit, or an unrelated decoration rebuild) is
 * always safe to just call outright rather than requiring the caller to
 * diff old vs. new width itself.
 */
export interface ResizeObserverHolder {
  current: ResizeObserver | null;
}

export function applyMediaWidth(
  target: HTMLElement,
  resizeHeightTarget: HTMLElement | null,
  width: number,
  view: EditorView,
  observerHolder: ResizeObserverHolder
): void {
  observerHolder.current?.disconnect();
  observerHolder.current = null;

  if (width === 11) {
    target.style.removeProperty('width');
    resizeHeightTarget?.style.removeProperty('height');
    return;
  }

  if (width >= 1 && width < 11) {
    target.style.width = `calc(${width} / 11 * 100%)`;
    resizeHeightTarget?.style.setProperty('height', 'auto');
    return;
  }

  // Real, confirmed bug (found via real-browser reproduction, an external
  // URL image in Fit mode): `ResizeObserver` fires on *any* content-box
  // size change of the observed element — width **or** height — but this
  // observer's own job is purely width-driven ("keep re-clamped when the
  // *editor's* width changes"). `view.contentDOM`'s height is driven by
  // its total content height, which legitimately keeps changing for a
  // while after a Fit-mode resize: the `<img>` is `width: 100%; height:
  // auto`, and a still-loading/decoding image (an external URL fetched
  // over the network, not yet in cache — a local Vault asset resolves
  // near-instantly, which is why this was so much harder to reproduce
  // there) can repaint at a taller or shorter natural size across several
  // frames as more of it decodes, each one changing `view.contentDOM`'s
  // height and re-firing this observer — even though the *width* this
  // observer actually cares about never changed at all. Unconditionally
  // rewriting `target.style.width` on every one of those firings (the
  // previous version of this function) was itself enough extra
  // recurring layout work, stacked on top of the image's own genuine
  // reflows, to trip Chrome's "ResizeObserver loop completed with
  // undelivered notifications" loop-detection heuristic — confirmed
  // directly: reproducible with an external URL image, not with a local
  // asset, and the warning began immediately after a resize commit, not
  // during the live drag itself (matching "still decoding/repainting"
  // timing, not anything drag-specific). Skipping the write whenever the
  // *width* measurement genuinely hasn't changed — the only thing this
  // observer should ever act on — breaks that cycle without touching
  // what it does on an actual editor-width change.
  let lastAppliedAvailable: number | null = null;
  const applyClampedPixelWidth = () => {
    const available = getAvailableViewerWidth(view.contentDOM);
    if (available === lastAppliedAvailable) {
      return;
    }
    lastAppliedAvailable = available;
    const min = available / 11;
    const clamped = available <= 0 ? width : Math.min(available, Math.max(min, width));
    target.style.width = `${clamped}px`;
  };
  applyClampedPixelWidth();
  resizeHeightTarget?.style.setProperty('height', 'auto');

  const observer = new ResizeObserver(applyClampedPixelWidth);
  observer.observe(view.contentDOM);
  observerHolder.current = observer;
}

/** Stops and clears a width observer — called from a widget's own `destroy()`, mirroring `PdfEmbedWidget.ts`'s own teardown of its per-page resize observer. */
export function disconnectMediaWidthObserver(observerHolder: ResizeObserverHolder): void {
  observerHolder.current?.disconnect();
  observerHolder.current = null;
}

/**
 * Applies alignment via a `data-align` attribute, left blank for the
 * default ('left' — no attribute needed, matching this milestone's
 * "defaults should remain implicit" convention carried into rendering).
 * The corresponding CSS lives per-widget (`MarkdownEditor.css`/
 * `PdfEmbedWidget.css`) because *how* an element centers/right-aligns
 * itself differs by its own box type — `ImageWidget`'s container is
 * `inline-flex` (the widget-buffer spacing fix), so centering uses the
 * `position: relative; left: 50%/100%; transform: translateX(...)`
 * technique against its own `.cm-line` (see `MarkdownEditor.css`'s own
 * comment for why, and for why `margin: auto` doesn't self-center an
 * inline-level box), while `PdfEmbedWidget`'s container is a plain
 * `display: block` box, which a direct `margin-inline`/`margin-left` rule
 * centers/right-aligns normally. Both approaches are scoped to the widget
 * container element alone — neither ever touches `.cm-line`/`.cm-content`'s
 * own alignment, so the raw Markdown source never visually moves. This
 * function only ever sets the one attribute both rule sets key off of.
 */
export function applyMediaAlignment(container: HTMLElement, alignment: MediaAlignment): void {
  if (alignment === 'left') {
    delete container.dataset.align;
  } else {
    container.dataset.align = alignment;
  }
}

/** A single measured rendered box — `getBoundingClientRect()`'s own width/height, not any CSS-declared value. */
export interface MeasuredBox {
  readonly width: number;
  readonly height: number;
}

/** Measures `el`'s current *rendered* size — always a concrete pair of numbers, regardless of whether the CSS that produced them is `auto`, `fit-content`, `100%`, or an explicit length. This is what `flipDimensionTransition` needs on both sides of a change: a CSS `transition` can only interpolate between two lengths, never between a length and a sizing keyword. */
export function measureBox(el: HTMLElement): MeasuredBox {
  const rect = el.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

export interface FlipDimensionEntry {
  readonly el: HTMLElement;
  readonly property: 'width' | 'height';
  readonly from: number;
  readonly to: number;
}

/**
 * A FLIP-style ("First, Last, Invert, Play") measured dimension
 * transition — the fix for switching between two rendering modes whose
 * own CSS uses different *kinds* of sizing (Fill's `width: 100%`/
 * `height: 400px` vs. Fit's `width: auto`/`height: auto`, both ultimately
 * driven by `.tok-image`/`.cm-image-container`'s own class-based rules).
 * A CSS `transition` genuinely cannot animate between two values unless
 * both resolve to the same *kind* — two lengths interpolate; a length and
 * a sizing keyword (`auto`, `fit-content`) never do, so simply declaring
 * `transition: width 160ms ease` on the element (already present,
 * `MarkdownEditor.css`) has no visible effect across a mode switch even
 * though it's exactly what the width-only/alignment-only case *does*
 * relies on (both endpoints are already concrete lengths there, and that
 * case was already smooth before this function existed).
 *
 * The caller is expected to have *already* applied the target mode's own
 * final, correct declarative CSS (classes, `applyMediaWidth`, etc.)
 * before calling this — `to` should be measured from that already-correct
 * end state, not hand-computed. This function's own job is purely the
 * temporary bridge: pin every entry to its own `from` (a synchronous,
 * single-reflow "freeze" of the box at its pre-change size, even though
 * the underlying CSS now says otherwise), then release to `to` — the
 * already-declared CSS `transition` animates the rest, no
 * `requestAnimationFrame`/`setTimeout` involved anywhere in this
 * function. Once each entry whose `from`/`to` genuinely differ has fired
 * its own real `transitionend`, this removes that entry's inline pin —
 * at that exact moment the box is already at the identical computed
 * size the caller's own declarative CSS already describes, so releasing
 * back to it produces no visual jump, and future ordinary layout (an
 * editor resize, e.g.) responds fluidly again exactly as before any of
 * this ran.
 *
 * Entries whose `from`/`to` are equal (nothing to animate — e.g. a mode
 * switch that happens to leave the image's own width unchanged, only its
 * height differing) are skipped entirely: no pin is ever set for them
 * and no `transitionend` is ever awaited, since none would fire.
 *
 * **Cleanup also fires on `transitioncancel`, not only `transitionend`
 * (2026-09, fixing a real stuck-inline-style bug).** A *running*
 * transition that gets interrupted — this same function called again
 * for the same element/property before the first one finishes, e.g. a
 * second mode toggle inside the 160ms window — never fires
 * `transitionend` for the interrupted one; per the CSS Transitions spec,
 * an interrupted transition fires `transitioncancel` instead, and
 * `transitionend` simply never happens for it. The interrupted call's
 * own cleanup closure was therefore leaking, permanently: its pin was
 * already overwritten by the second call's own pin/release (harmless on
 * its own), but its listener stayed attached, unfired, forever. That's
 * not just a leak — it's what let a *later, unrelated* switch's own
 * measurement get poisoned: `measureBox` (`ImageWidget.ts`) reads the
 * container's actual rendered box, and once *any* switch fails to clean
 * up its own inline `height`/`width` pin, every subsequent switch's own
 * `getBoundingClientRect()` reads that stale inline value as the
 * *current, real* size — including for the "before" measurement of the
 * next switch. If the stale value happens to equal what the next
 * switch's own "after" measurement would otherwise be different from
 * has drifted, `|from - to|` can land back under this function's own
 * `0.5` change threshold, silently skipping the property entirely —
 * leaving the stale inline value in place, forever, confirmed to
 * reproduce the exact reported symptom (`.cm-image-container` stuck at
 * `height: 400px` after switching to Fit, indefinitely). Listening for
 * `transitioncancel` alongside `transitionend`, both driving the exact
 * same cleanup, closes this without any new state: whichever fires
 * first still only runs the cleanup once (removing both listeners
 * together) — `entry.el.style.removeProperty(entry.property)` is
 * idempotent regardless of which event triggered it.
 *
 * **Confirmed insufficient on its own (2026-09, same bug report,
 * continued investigation) — event-based cleanup cannot be the *only*
 * defense.** Reproducing live in a real WebKit engine (Playwright's
 * `webkit`, matching this app's own Tauri/WKWebView runtime — never
 * reproducible in Chromium or jsdom) and instrumenting all four
 * transition events directly on the element showed WebKit not reliably
 * firing *either* `transitionend` or `transitioncancel` for
 * `.cm-image-container`'s own `height` transition specifically — with no
 * interruption, no rapid toggling, a single ordinary Fit↔Fill switch,
 * non-deterministically across otherwise-identical runs (the `<img>`'s
 * own height transition on the same element tree settled reliably every
 * time; only the container's did not). Once neither event fires, this
 * function's own inline pin is permanently stuck, and — per this
 * function's own doc comment above — poisons every later measurement
 * too. The actual fix is in `ImageWidget.ts`'s `updateDOM`: it now
 * proactively clears any stale inline `height` on the container *before*
 * measuring anything, on every call, regardless of whether a previous
 * transition's own end/cancel event ever fired — the same
 * "authoritative value re-applied unconditionally every call" property
 * `applyMediaWidth` already gives `width`, extended to `height`. This
 * function's own `transitioncancel` listener is kept as reasonable
 * defense-in-depth for the *documented*, spec-true interrupted-transition
 * case (still correct, still worth having) — just not sufficient by
 * itself for the specific WebKit non-firing behavior found here.
 */
export function flipDimensionTransition(entries: readonly FlipDimensionEntry[]): void {
  const changing = entries.filter((entry) => Math.abs(entry.from - entry.to) > 0.5);
  if (changing.length === 0) {
    return;
  }

  for (const entry of changing) {
    entry.el.style.setProperty(entry.property, `${entry.from}px`);
  }
  // Forces one synchronous style/layout flush so the browser commits the
  // `from` pin as a genuinely-previously-rendered state before the next
  // write below — without this, both writes land in the same style
  // recalculation pass and the browser has nothing to transition *from*,
  // so no animation plays at all (the same reason a bare "set final
  // value" never animated in the first place).
  void changing[0]!.el.offsetHeight;

  for (const entry of changing) {
    const onSettled = (event: TransitionEvent) => {
      if (event.target !== entry.el || event.propertyName !== entry.property) {
        return;
      }
      entry.el.removeEventListener('transitionend', onSettled);
      entry.el.removeEventListener('transitioncancel', onSettled);
      entry.el.style.removeProperty(entry.property);
    };
    entry.el.addEventListener('transitionend', onSettled);
    entry.el.addEventListener('transitioncancel', onSettled);
  }

  for (const entry of changing) {
    entry.el.style.setProperty(entry.property, `${entry.to}px`);
  }
}
