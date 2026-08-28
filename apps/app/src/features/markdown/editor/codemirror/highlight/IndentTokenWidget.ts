import { WidgetType, type Rect } from '@codemirror/view';

/**
 * The rendered form of one complete leading-indentation token (a run of
 * `indentUnit.length` spaces, or a single tab) — an empty, text-less
 * element that `Decoration.replace()`s the token's real characters in
 * `leadingIndentDecoration.ts`, rather than a `Decoration.mark` wrapping
 * them in place.
 *
 * Why replace instead of mark: CM6's own coordinate-mapping code —
 * `coordsAtPos` (caret placement) and `posAtCoords` (mouse hit-testing) —
 * measures a `Decoration.mark`'s wrapped text by querying a DOM `Range`
 * over the *real characters*, never the mark span's own CSS box
 * (`TextTile.coordsIn`/`InlineCoordsScan.scanText` in `@codemirror/view`).
 * A mark that's visually widened past its text's natural glyph width
 * (exactly what the previous `.cm-indent` mark + `inline-block; width`
 * did) therefore desyncs from both: the caret can render inside the
 * token instead of at its edge, and clicking within the token's visual
 * box can resolve to a document position before the click, not under it
 * — confirmed by direct measurement in both directions (coordsAtPos and
 * posAtCoords), not just the caret-only symptom the previous
 * `IndentEndAnchorWidget` attempt patched.
 *
 * A `Decoration.replace({widget})`, by contrast, is measured by both
 * `coordsAtPos` and `posAtCoords` via the widget's *own DOM element*
 * (`WidgetTile.coordsIn` -> `dom.getClientRects()`, and the equivalent
 * `nodeType == 1` branch in `InlineCoordsScan.scanTile`) — the same
 * mechanism, in both directions, measuring the same box. There is no
 * second, narrower coordinate system to fall out of sync with. This is
 * also why `Decoration.widget` (a *point* decoration, not a replacement)
 * can never fully solve this either: `@codemirror/view`'s own
 * `scanTile` unconditionally excludes point widgets from `posAtCoords`
 * hit-testing (`flags & TileFlag.PointWidget`), by design — a widget
 * decoration and a replace decoration get different internal flags
 * (`Before`/`After` vs. `IncStart`/`IncEnd`) specifically because they
 * answer different questions: "insert extra rendered content here" vs.
 * "this range's own real content, use my box instead."
 *
 * The real whitespace character(s) this replaces stay exactly where they
 * are in `state.doc` — this is rendering-only, same invariant every other
 * decoration in this file already holds. `Decoration.replace` hides the
 * DOM for its range but the underlying document text, cursor positions,
 * and edit operations are untouched; CM6 does not make replaced ranges
 * atomic for cursor movement on its own (confirmed directly: stepping
 * ArrowLeft/ArrowRight through a replaced token still visits every
 * character position one at a time, the same as before this change) —
 * only an explicit `EditorView.atomicRanges` facet entry would do that,
 * and none is registered here.
 *
 * Same empty-element pattern as `ConcealedMarkerWidget.ts`, for the same
 * reason: an element with no text content owes its box to ordinary,
 * uncontested CSS (`width`, `height`) rather than fighting a real
 * glyph's font metrics.
 */
export class IndentTokenWidget extends WidgetType {
  /**
   * The number of real document characters this one widget replaces (2
   * for a default-`indentUnit` space run, 1 for a tab — always the
   * replaced range's own length, read by `leadingIndentDecoration.ts` at
   * the same point it decides the range, never assumed/hardcoded here).
   * Used only by `coordsAt` below, to interpolate a logical position's
   * offset *within* this token into a fraction of the token's own
   * rendered width — this has no effect on the document, on which
   * characters exist, or on how many there are; it only changes where
   * `coordsAtPos`-driven callers (the caret, selection-rectangle edges)
   * render a position that's already valid today.
   */
  constructor(readonly length: number) {
    super();
  }

  /**
   * Deliberately NOT `true`. `WidgetType`'s own default (`false`) is
   * correct here and must stay — confirmed by an isolated repro, not
   * assumed: when multiple adjacent tokens on a line share one `eq()
   * -> true` widget (mirroring `ConcealedMarkerWidget`'s pattern, which
   * is safe there because concealed markers are rarely directly
   * adjacent), and an edit shrinks the token count, `@codemirror/view`'s
   * DOM reconciliation can leave a stale extra widget element behind —
   * the returned `DecorationSet` is correct (verified directly: exactly
   * one range for the new, shorter indentation), but the rendered DOM
   * still shows the old, larger count. Forcing `false` (i.e. "always
   * redraw, never reuse a neighboring widget's DOM node") removes the
   * false positive: `eq` normally exists so CM6 can skip re-creating a
   * widget's DOM when nothing changed, but that reuse decision is
   * apparently made in a way that isn't reliably position-aware for
   * runs of adjacent, structurally-identical replace-widgets. An empty,
   * content-less span has no meaningful redraw cost, so there's no
   * performance reason to risk it. `Decoration.mark` (this file's
   * approach before 2026-08-28) never had this failure mode because
   * marks have no widget `eq()`/redraw lifecycle at all.
   */
  override eq(): boolean {
    return false;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-indent-token';
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }

  /**
   * Gives each of this token's internal document positions (there are
   * `this.length + 1` of them: one before the first replaced character,
   * one after each character, matching ordinary per-character caret
   * stops) its own distinct point along the token's rendered width,
   * instead of every internal position collapsing to whichever DOM rect
   * `dom.getClientRects()` happens to return.
   *
   * Confirmed by direct measurement (not assumed) that this is safe to
   * add: `coordsAt` is the *only* thing that changes. It is consulted
   * exclusively by the doc-position-to-screen direction (`coordsAtPos`,
   * called by `drawSelection()`'s caret layer and by
   * `rectanglesForRange`'s selection-edge computation, `@codemirror/
   * view`'s only two call sites for `WidgetType.coordsAt`) — the
   * opposite, screen-to-doc direction (`posAtCoords`, mouse hit-testing)
   * measures this widget's real `dom.getClientRects()` directly and never
   * calls this method at all, so this has zero effect on click
   * resolution. It's also never consulted by cursor-movement commands
   * (`moveByChar` et al., which operate purely on `state.doc`/
   * `state.selection`) or by Backspace/Delete (`deleteCharBackward`/
   * `deleteCharForward`, purely `state.doc`-text-driven) — verified
   * identical with and without this override in an isolated harness.
   *
   * `pos` is `@codemirror/view`'s own offset into this widget (0 to
   * `this.length`, inclusive) — not something this method invents;
   * `pos / this.length` is exactly "how far through the replaced range
   * is this logical position," which linear interpolation across the
   * widget's own measured box turns into "how far through the rendered
   * token." Reads `dom.getBoundingClientRect()` fresh on every call
   * (real, current DOM geometry — never a hardcoded or assumed width),
   * so this automatically tracks `--marker-width`, a changed
   * `indentUnit` length, zoom, or font-size changes with no code change
   * here.
   *
   * Vertical geometry (`top`/`bottom`) is passed through unmodified from
   * the same measured box — only the horizontal coordinate is
   * interpolated. There is deliberately no `transform`/pixel-offset/
   * fixed-height logic here: the box's own `top`/`bottom` are already
   * correct (this widget's CSS gives it real, non-zero height — see
   * `.cm-indent-token` in `MarkdownEditor.css`), so introducing a second,
   * separate vertical calculation would only risk *creating* a mismatch
   * that doesn't otherwise exist.
   */
  override coordsAt(dom: HTMLElement, pos: number, _side: number): Rect | null {
    const box = dom.getBoundingClientRect();
    const fraction = this.length > 0 ? pos / this.length : 0;
    const x = box.left + box.width * fraction;
    return { left: x, right: x, top: box.top, bottom: box.bottom };
  }
}
