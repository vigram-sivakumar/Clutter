import type { EditorView } from '@codemirror/view';

import { getAvailableViewerWidth } from '@features/pdf/pdfFitWidth';

import type { MediaAlignment, MediaPresentationMode } from './mediaPresentationModel';

/**
 * The same clamp `applyMediaWidth`'s own 12+ pixel-width branch applies —
 * extracted so a live pointer-drag resize (`image/imageResizeHandle.ts`,
 * `pdf/pdfResizeHandle.ts`) can clamp its own in-flight width identically
 * to how the persisted value gets clamped every time it's later applied.
 * Without this, a drag could commit a width the very next render then
 * silently re-clamps to something smaller/larger, snapping visibly on
 * the first reload/unrelated re-render after the drag ends. Shared here
 * — not duplicated per widget — because both call sites need the exact
 * same number, not merely a similar one.
 */
export function clampMediaWidth(view: EditorView, rawWidth: number): number {
  const available = getAvailableViewerWidth(view.contentDOM);
  if (available <= 0) {
    return Math.max(1, rawWidth);
  }
  const min = available / 11;
  return Math.min(available, Math.max(min, rawWidth));
}

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

/**
 * Applies a persisted Fill-mode container height (resize milestone) —
 * the container-height counterpart to `applyMediaWidth` above, called
 * alongside it by `ImageWidget.ts`. **Fit's own height always stays
 * CSS-derived `auto`** (`.tok-image--fit`'s own rule, MarkdownEditor.css)
 * regardless of what `height` holds — a Fit image's persisted height is
 * dormant (see `mediaPresentationModel.ts`'s `ImagePresentation.height`
 * doc comment), so this function's own `mode !== 'fill'` branch always
 * clears any inline height rather than ever applying one, the same way
 * it does for `height === null` (never resized — falls back to
 * `.cm-image-container--fill`'s own CSS default of 400px, exactly
 * mirroring `applyMediaWidth`'s `width === 11` default-clears-inline
 * case).
 *
 * Called with **both** the previous and the next widget's own
 * mode/height by `ImageWidget.updateDOM` — once for `from` (before
 * `applyMediaWidth`/class toggling, replacing what used to be an
 * unconditional blind `container.style.removeProperty('height')`) so
 * the FLIP "start" measurement reflects the image's *actual* previous
 * rendered height rather than always the CSS default, and again for
 * `this` (after class toggling) to set the real target. Unconditionally
 * reapplying on every call is what keeps this self-healing against a
 * stuck inline pin exactly the way `applyMediaWidth` already is (see
 * that function's own doc comment) — the earlier blind-clear was doing
 * this same self-heal, just without the ability to correctly restore a
 * genuine persisted Fill height in the process.
 */
export function applyMediaHeight(container: HTMLElement, mode: MediaPresentationMode, height: number | null): void {
  if (mode !== 'fill' || height === null) {
    container.style.removeProperty('height');
    return;
  }
  container.style.height = `${height}px`;
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
/**
 * The cleanup still waiting on a `transitionend` for each element/property a FLIP pinned. Needed
 * because that event is not reliable (WebKit, see `ImageWidget.updateDOM`): when it never comes the
 * listener stays armed, and the next UNRELATED transition of the same property — the one that plays
 * when a resize drag ends — would fire it and strip the inline size the drag had just set, snapping
 * the embed back to its default size (the first drag after a mode switch "didn't take").
 */
interface PendingFlip {
  /** Stops waiting for this pin's own release without touching the inline size (a newer animation is taking over it). */
  readonly supersede: () => void;
  /** Releases the pin now — if it is still ours — and stops waiting for it. */
  readonly settle: () => void;
  /** What the caller had declared inline for this property before this animation pinned over it. */
  readonly declared: string;
}

const pendingFlips = new WeakMap<HTMLElement, Map<string, PendingFlip>>();

/** If the animation stalls (no `transitionend`, as in WebKit), the pins are still released after this long. */
const FLIP_FALLBACK_MS = 600;

/**
 * Releases every FLIP pin still pending on `el` right away, as if its animation had just finished.
 * Called when something else takes over the element's size (a resize drag starts): a pin left
 * behind would hold the box at its animation size — including the other dimension that was pinned
 * alongside it — and a cleanup still armed would later strip whatever that drag set.
 */
export function cancelPendingDimensionTransitions(el: HTMLElement): void {
  for (const pending of Array.from(pendingFlips.get(el)?.values() ?? [])) {
    pending.settle();
  }
}

export function flipDimensionTransition(entries: readonly FlipDimensionEntry[]): void {
  // An element is animating if either of its dimensions genuinely changes. BOTH of its dimensions
  // are then pinned for the animation — even one whose start and end are equal. Otherwise that one
  // is left to the layout, which derives it from the other (an image's automatic height follows its
  // width), so while the width moves the height wanders — growing and then snapping back — instead
  // of staying put.
  const animating = new Set(entries.filter((entry) => Math.abs(entry.from - entry.to) > 0.5).map((entry) => entry.el));
  const changing = entries.filter((entry) => animating.has(entry.el));
  if (changing.length === 0) {
    return;
  }

  // A previous FLIP of the same property that never settled is superseded by this one. What is
  // inline now is that one's pin, not anything the caller declared — so the value to go back to is
  // the one IT recorded.
  const inherited = new Map<FlipDimensionEntry, string>();
  for (const entry of changing) {
    const pending = pendingFlips.get(entry.el)?.get(entry.property);
    if (pending) {
      inherited.set(entry, pending.declared);
      pending.supersede();
    }
  }

  // What the caller has already declared inline for each property (a saved pixel width, a saved
  // Fill height) — read before pinning over it. Releasing a pin means going back to THIS, not
  // clearing the property: clearing would delete a saved size that is meant to stay.
  const declared = new Map<FlipDimensionEntry, string>(
    changing.map((entry) => [entry, inherited.get(entry) ?? entry.el.style.getPropertyValue(entry.property)])
  );

  // The `from` pin is a jump back to the size the box already had — never itself animated.
  for (const el of animating) {
    el.style.setProperty('transition', 'none');
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
  for (const el of animating) {
    el.style.removeProperty('transition');
  }

  // Only release a pin if it is still OUR pin: anything else that has since set this size (a drag,
  // or the persisted size being re-applied) must be left alone. Compared as numbers — the browser
  // rounds what it stores (`459.328125px` reads back as `459.328px`), so a string comparison would
  // never match a fractional size and the pin would be left stuck.
  const release = (entry: FlipDimensionEntry) => {
    const pinned = Number.parseFloat(entry.el.style.getPropertyValue(entry.property));
    if (Number.isFinite(pinned) && Math.abs(pinned - entry.to) < 0.01) {
      const original = declared.get(entry) ?? '';
      if (original === '') {
        entry.el.style.removeProperty(entry.property);
      } else {
        entry.el.style.setProperty(entry.property, original);
      }
    }
  };
  const moving = (entry: FlipDimensionEntry) => Math.abs(entry.from - entry.to) > 0.5;

  for (const entry of changing) {
    // A dimension that doesn't change has no transition of its own, so no event of its own: it is
    // released together with the dimension of the same element that does.
    const companions = moving(entry) ? changing.filter((other) => other.el === entry.el && !moving(other)) : [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const supersede = () => {
      entry.el.removeEventListener('transitionend', onEvent);
      entry.el.removeEventListener('transitioncancel', onEvent);
      clearTimeout(timer);
      pendingFlips.get(entry.el)?.delete(entry.property);
    };
    const settle = () => {
      supersede();
      release(entry);
      companions.forEach(release);
    };
    const onEvent = (event: TransitionEvent) => {
      if (event.target === entry.el && event.propertyName === entry.property) {
        settle();
      }
    };
    if (moving(entry)) {
      entry.el.addEventListener('transitionend', onEvent);
      entry.el.addEventListener('transitioncancel', onEvent);
    }
    timer = setTimeout(settle, FLIP_FALLBACK_MS);
    const forEl = pendingFlips.get(entry.el) ?? new Map<string, PendingFlip>();
    forEl.set(entry.property, { supersede, settle, declared: declared.get(entry) ?? '' });
    pendingFlips.set(entry.el, forEl);
  }

  for (const entry of changing) {
    entry.el.style.setProperty(entry.property, `${entry.to}px`);
  }
}
