import type { EditorView } from '@codemirror/view';

/**
 * Pixel-width calculators for each list-marker kind, feeding
 * `listLineDecoration.ts`'s hanging-indent padding. Read-only geometry —
 * this file never renders anything and never touches
 * `listMarkerDecoration.ts`'s own (locked) marker rendering; it only
 * reproduces, as numbers, the footprint that rendering already produces.
 *
 * **A marker's real footprint is its own box width *plus* its own
 * trailing margin** — not the box alone. Every marker kind reserves a
 * gap after itself via a real CSS margin, not shared spacing owned by
 * this file or by `.cm-list-line`: bullets via `.cm-bullet-list-marker--glyph`'s
 * `margin-right: var(--md-marker-text-gap)` (+4px), ordered markers via
 * `.cm-list-marker`'s `margin-inline-end: var(--space-4)` (+4px, a
 * *different* 4px than the `padding-left` already counted inside the
 * marker's own box), and the task checkbox via `.cm-task-checkbox`'s
 * `margin-right: calc(var(--md-marker-text-gap) - 5px)` (**-1px** — the
 * one kind whose gap is *negative*). Missing this the first time around
 * produced a confirmed, live, reproducible bug: every wrapped row landed
 * exactly `4px` (bullet/ordered) or `1px` (task) off from its own item's
 * first-line text — a real per-kind constant, not noise — traced by
 * comparing the marker's own measured `getBoundingClientRect()` against
 * where the following real text actually started.
 *
 * Rather than hand-copy these three different margin *formulas* into
 * this file (a second, driftable place they could disagree with the CSS
 * — exactly what `.cm-ordered-list-marker`'s `padding-left` token
 * promotion elsewhere in this file was written to avoid), each is read
 * once from a synthetic, detached probe element carrying the *exact*
 * class list the real marker/checkbox uses, via `getComputedStyle()` —
 * the same "one source of truth, read once, cache" contract this file's
 * other geometry already follows. `getComputedStyle()` resolves a
 * `calc()`/custom-property margin to a final px value without requiring
 * the probe to be part of any real layout, so this needs no viewport
 * attachment, no `.cm-content` context, and has no dependency on
 * `listMarkerDecoration.ts`'s own decoration/paint state.
 */

let cachedFixedMarkerWidthPx: number | null = null;

function readPxCustomProperty(propertyName: string, fallback: number): number {
  const computed = getComputedStyle(document.documentElement)
    .getPropertyValue(propertyName)
    .trim();
  const match = computed.match(/^([\d.]+)px$/);
  return match ? parseFloat(match[1]!) : fallback;
}

/**
 * The fixed marker *box* footprint shared by bullets and task checkboxes
 * — `var(--md-marker-width)`, read once and cached. Callers wanting the
 * real, complete footprint (box + trailing margin) should use
 * `getBulletMarkerFootprintPx()`/`getTaskMarkerFootprintPx()` below
 * instead — this is exported for cases that specifically need the box
 * alone (e.g. as the ordered marker's own floor).
 */
export function getFixedMarkerWidthPx(): number {
  if (cachedFixedMarkerWidthPx === null) {
    cachedFixedMarkerWidthPx = readPxCustomProperty('--md-marker-width', 24);
  }
  return cachedFixedMarkerWidthPx;
}

let cachedOrderedMarkerPaddingPx: number | null = null;

/**
 * `.cm-ordered-list-marker`'s own `padding-left` — `var(--md-marker-text-gap)`
 * (see that rule's own doc comment in `MarkdownEditor.css` for why it was
 * promoted from a bare `4px` literal to this token specifically so this
 * file can read the identical value, not a hand-copied duplicate). This
 * is *inside* the marker's own border-box (part of `min-width`'s
 * resolution), distinct from `getOrderedMarkerTrailingGapPx()`'s margin,
 * which is outside it.
 */
function getOrderedMarkerPaddingPx(): number {
  if (cachedOrderedMarkerPaddingPx === null) {
    cachedOrderedMarkerPaddingPx = readPxCustomProperty('--md-marker-text-gap', 4);
  }
  return cachedOrderedMarkerPaddingPx;
}

/**
 * `.cm-bullet-list-marker--glyph`'s/`.cm-list-marker`'s/`.cm-task-checkbox`'s
 * own margin rules are all scoped `.cm-editor <selector>` (a descendant
 * combinator) — they only resolve against a probe that is actually
 * mounted *inside* an element carrying the `cm-editor` class, never
 * against `document.body` directly (confirmed live: a `document.body`-attached
 * probe read back `margin-right: 0px`, silently no-oping this entire
 * calculation — the actual root cause of this file's own live
 * regression, found *after* the first "fix," not before). `view.dom` is
 * CM6's own editor root and already carries `cm-editor`
 * (`EditorView.dom`'s documented contract), so the probe is appended
 * there — `visibility: hidden` and `position: absolute` keep it out of
 * both paint and layout of the real content.
 *
 * `probe.getBoundingClientRect()` immediately after insertion, its result
 * discarded, forces a synchronous layout pass before `getComputedStyle`
 * reads the margin — a reasonable safeguard in any engine, kept even
 * though it turned out not to be the actual fix for the live WKWebView
 * bug (see `getBulletMarkerTrailingGapPx()`'s own doc comment for what
 * was: not caching this read).
 */
function readMarginPx(
  view: EditorView,
  tagName: 'span' | 'button',
  className: string,
  marginProperty: 'marginRight' | 'marginInlineEnd'
): number {
  const probe = document.createElement(tagName);
  probe.className = className;
  probe.style.cssText = 'position:absolute; visibility:hidden; pointer-events:none;';
  view.dom.appendChild(probe);
  probe.getBoundingClientRect(); // force layout before reading computed style — see doc comment above
  const raw = getComputedStyle(probe)[marginProperty];
  view.dom.removeChild(probe);

  const match = raw.match(/^(-?[\d.]+)px$/);
  return match ? parseFloat(match[1]!) : 0;
}

/**
 * `.cm-bullet-list-marker--glyph`'s own `margin-right`, read from a probe
 * carrying the identical class list `listMarkerDecoration.ts` renders.
 *
 * **Deliberately not cached** (unlike every other value in this file) —
 * confirmed live, in a genuinely fresh Tauri/WKWebView process (not
 * stale HMR state), that caching this specific read is unsafe: the very
 * first call happens during the editor's initial construction, which
 * can race the page's own first-ever layout pass in WKWebView. A probe
 * inserted-measured-removed before that first layout has settled reads
 * back `marginRight: "0px"`, even though the identical CSS rule was
 * simultaneously confirmed correct (`"4px"`) both on the real,
 * already-laid-out marker element and via the exact same probe technique
 * run manually well after the page had settled. Caching that one bad
 * early read made it permanent — no later, correct measurement ever got
 * a chance to overwrite it, since nothing in the app calls
 * `refreshListMarkerWidthCache()` at runtime. Recomputing every call
 * costs one detached DOM node insert/measure/remove — negligible next to
 * `buildListLineDecorations()`'s own per-rebuild work, and it self-heals
 * the moment the page has had any real layout at all.
 */
function getBulletMarkerTrailingGapPx(view: EditorView): number {
  return readMarginPx(
    view,
    'span',
    'cm-marker cm-bullet-list-marker cm-bullet-list-marker--glyph cm-bullet-list-marker--dash',
    'marginRight'
  );
}

/**
 * `.cm-list-marker`'s own `margin-inline-end` (shared tint/spacing class
 * ordered markers compose), read from a probe. Not cached — see
 * `getBulletMarkerTrailingGapPx()`'s own doc comment for why.
 */
function getOrderedMarkerTrailingGapPx(view: EditorView): number {
  return readMarginPx(
    view,
    'span',
    'cm-marker cm-list-marker cm-ordered-list-marker',
    'marginInlineEnd'
  );
}

/**
 * `.cm-task-checkbox`'s own `margin-right` — the one kind whose gap is
 * negative. Not cached — see `getBulletMarkerTrailingGapPx()`'s own doc
 * comment for why.
 */
function getTaskMarkerTrailingGapPx(view: EditorView): number {
  return readMarginPx(view, 'button', 'cm-task-checkbox', 'marginRight');
}

/**
 * A bullet marker's complete real footprint — fixed box width plus its
 * own trailing margin.
 */
export function getBulletMarkerFootprintPx(view: EditorView): number {
  return getFixedMarkerWidthPx() + getBulletMarkerTrailingGapPx(view);
}

/**
 * The task checkbox's complete real footprint — fixed box width plus its
 * own (negative) trailing margin. Uniform regardless of the concealed
 * marker's bullet/ordered kind or digit count — see this module's own
 * doc comment and `taskCheckboxDecoration.ts`'s for why the whole
 * `marker + separator + [ ]` run collapses to just this one widget.
 */
export function getTaskMarkerFootprintPx(view: EditorView): number {
  return getFixedMarkerWidthPx() + getTaskMarkerTrailingGapPx(view);
}

let cachedMarkerFont: string | null = null;

/**
 * The font `.cm-ordered-list-marker` actually renders in — read from the
 * editor's own `contentDOM` (not hardcoded, not read from
 * `document.documentElement`), since the marker inherits font-family/size
 * from `.cm-content` (`MarkdownEditor.css`'s `font-family: var(--font-sans)`
 * rule) and a future compact-mode/zoom variant could give different
 * editor instances different font sizes. Confirmed live: this exact
 * `${fontWeight} ${fontSize} ${fontFamily}` string, fed to
 * `measureText()`, reproduces the real rendered marker width to
 * sub-pixel precision.
 */
function readMarkerFont(view: EditorView): string {
  if (cachedMarkerFont === null) {
    const style = getComputedStyle(view.contentDOM);
    cachedMarkerFont = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  }
  return cachedMarkerFont;
}

let cachedMeasureContext: CanvasRenderingContext2D | null | undefined;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (cachedMeasureContext === undefined) {
    cachedMeasureContext = document.createElement('canvas').getContext('2d');
  }
  return cachedMeasureContext;
}

/**
 * An ordered marker's real box footprint (not including its own trailing
 * margin — see `getOrderedMarkerFootprintPx()` for the complete value) —
 * `markerText` is the raw source text of the marker *and* its real
 * separator (e.g. `"10. "`), the same range `listMarkerDecoration.ts`'s
 * own `Decoration.mark` wraps. Reproduces `.cm-ordered-list-marker`'s own
 * box model exactly: `min-width` floor, else natural content width
 * (measured) plus `padding-left`, `box-sizing: border-box`.
 *
 * ch-based/digit-count-based CSS formulas were tried and rejected —
 * confirmed live, not assumed: in the app's actual `--font-sans` stack,
 * "10. " and "99. " are both 2-digit markers but render at genuinely
 * different widths (~28.875px vs ~31.75px, a ~2.875px gap), proving the
 * font's digits are not tabular/uniform-width, so no formula based on
 * digit *count* alone can reproduce the real footprint. What *does*
 * reproduce it exactly (same live measurement, matched to sub-pixel
 * precision for 1/2/3-digit markers) is `CanvasRenderingContext2D.measureText()`
 * run against the marker's own real text, in the same font the marker
 * actually renders in — a deterministic text-metrics computation, not a
 * live layout read of an already-painted marker element. In an
 * environment with no canvas 2D context (e.g. jsdom without the
 * `canvas` npm package), it falls back to the fixed floor width.
 */
function getOrderedMarkerBoxWidthPx(view: EditorView, markerText: string): number {
  const floor = getFixedMarkerWidthPx();
  const ctx = getMeasureContext();
  if (!ctx) {
    return floor;
  }

  ctx.font = readMarkerFont(view);
  const textWidth = ctx.measureText(markerText).width;
  return Math.max(floor, textWidth + getOrderedMarkerPaddingPx());
}

/**
 * An ordered marker's complete real footprint — measured box width plus
 * its own trailing margin.
 */
export function getOrderedMarkerFootprintPx(view: EditorView, markerText: string): number {
  return getOrderedMarkerBoxWidthPx(view, markerText) + getOrderedMarkerTrailingGapPx(view);
}

/**
 * The real, rendered width of a task item's own unconcealed separator
 * text — the one real character (occasionally more, per CommonMark's
 * 1-4-space allowance) between `TaskMarker`'s own `]` and the item's real
 * content, which `taskCheckboxDecoration.ts` deliberately leaves as
 * ordinary, visible source text (its own concealed range ends exactly at
 * `TaskMarker.to`, never past it — confirmed by reading that file
 * directly, not assumed). Missing this was a real, live, reproducible
 * bug: every task item's wrapped row landed short of its own first-line
 * text by exactly one space glyph's width (confirmed live: 4.1875px in
 * the app's actual font, matching `measureText(' ')` in that same font
 * to the sub-pixel).
 *
 * `separatorText` is ordinary prose text, not marker text — but it
 * inherits the identical font as the marker (`.cm-content`'s own
 * `font-family`/`font-size`, per `MarkdownEditor.css`), so reusing
 * `readMarkerFont()`'s cached string (rather than a second, independent
 * font read) is correct, not a naming mismatch: that function's own doc
 * comment already frames it as "the font the marker renders in," which
 * for plain, unstyled body text is the same font the whole line renders
 * in. In an environment with no canvas 2D context, this degrades to `0`
 * — the same "no exact measurement available" fallback
 * `getOrderedMarkerBoxWidthPx()` uses for its own floor, rather than a
 * fabricated constant.
 */
export function getTaskSeparatorWidthPx(view: EditorView, separatorText: string): number {
  if (separatorText.length === 0) {
    return 0;
  }

  const ctx = getMeasureContext();
  if (!ctx) {
    return 0;
  }

  ctx.font = readMarkerFont(view);
  return ctx.measureText(separatorText).width;
}

/**
 * Refresh every cached value here — call when the design tokens, theme,
 * or editor font change, mirroring `markdownIndent.ts`'s own
 * `refreshMarkdownIndent()`. The three trailing-margin readers
 * (`getBulletMarkerTrailingGapPx`/`getOrderedMarkerTrailingGapPx`/
 * `getTaskMarkerTrailingGapPx`) aren't cached at all, so there's nothing
 * to reset for them — see their own doc comments for why.
 */
export function refreshListMarkerWidthCache(): void {
  cachedFixedMarkerWidthPx = null;
  cachedOrderedMarkerPaddingPx = null;
  cachedMarkerFont = null;
  cachedMeasureContext = undefined;
}
