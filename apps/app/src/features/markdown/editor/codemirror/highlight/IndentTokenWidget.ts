import { WidgetType } from '@codemirror/view';

/**
 * The rendered form of one leading-indentation *character* — a single
 * space or a single tab — that `Decoration.replace()`s it in
 * `leadingIndentDecoration.ts`, rather than a `Decoration.mark` wrapping
 * it in place. One document character, one widget: there is no grouping
 * of multiple characters into a single wider token any more (that was
 * this file's design through 2026-08-28 — see git history for the
 * `coordsAt`-interpolation approach it required and why it was retired:
 * a per-character widget gives every logical position its own real DOM
 * node, so CM6 never needs a synthetic coordinate override to tell two
 * internal positions apart).
 *
 * Why replace instead of mark: CM6's own coordinate-mapping code —
 * `coordsAtPos` (caret placement) and `posAtCoords` (mouse hit-testing) —
 * measures a `Decoration.mark`'s wrapped text by querying a DOM `Range`
 * over the *real characters*, never the mark span's own CSS box
 * (`TextTile.coordsIn`/`InlineCoordsScan.scanText` in `@codemirror/view`).
 * A mark visually widened past its text's natural glyph width therefore
 * desyncs from both directions — confirmed by direct measurement, not
 * just inferred. `Decoration.replace`'s widget, by contrast, is measured
 * by *both* `coordsAtPos` and `posAtCoords` via the widget's own DOM
 * element's box (`WidgetTile.coordsIn` -> `dom.getClientRects()`, and the
 * equivalent `nodeType == 1` branch in `InlineCoordsScan.scanTile`) — the
 * same mechanism, in both directions, measuring the same box.
 *
 * `px` is the visual width in pixels — derived from the `--md-indent`
 * CSS custom property and the 4-space-per-level indentation model:
 * one space gets `--md-indent / 4` pixels, one tab gets `--md-indent`
 * pixels. Clutter's own stated rule: "1 space = one quarter of an
 * indentation level, 1 tab = one full indentation level, independent
 * of column," not traditional tab-stop semantics.
 * Passed in by `leadingIndentDecoration.ts`, never computed here.
 * See `design-system/markdownIndent.ts` for token resolution details.
 *
 * The real whitespace character this replaces stays exactly where it is
 * in `state.doc` — this is rendering-only, same invariant every other
 * decoration in this file already holds. `Decoration.replace` hides the
 * DOM for its range but the underlying document text, cursor positions,
 * and edit operations are untouched; CM6 does not make a replaced
 * character atomic for cursor movement on its own (confirmed directly:
 * stepping ArrowLeft/ArrowRight through leading whitespace still visits
 * every character position one at a time) — only an explicit
 * `EditorView.atomicRanges` facet entry would do that, and none is
 * registered here.
 */
export class IndentTokenWidget extends WidgetType {
  constructor(readonly px: number) {
    super();
  }

  /**
   * Deliberately NOT `true`. `WidgetType`'s own default (`false`) is
   * correct here and must stay — confirmed by an isolated repro, not
   * assumed: when multiple adjacent widgets on a line share one `eq()
   * -> true` widget, and an edit shrinks the whitespace-character count,
   * `@codemirror/view`'s DOM reconciliation can leave a stale extra
   * widget element behind — the returned `DecorationSet` is correct
   * (verified directly: exactly the right number of ranges for the new,
   * shorter indentation), but the rendered DOM still shows the old,
   * larger count. Forcing `false` (i.e. "always redraw, never reuse a
   * neighboring widget's DOM node") removes the false positive: `eq`
   * normally exists so CM6 can skip re-creating a widget's DOM when
   * nothing changed, but that reuse decision is apparently made in a way
   * that isn't reliably position-aware for runs of adjacent,
   * structurally-identical replace-widgets. An empty, content-less span
   * has no meaningful redraw cost, so there's no performance reason to
   * risk it. `Decoration.mark` never had this failure mode because marks
   * have no widget `eq()`/redraw lifecycle at all.
   */
  override eq(): boolean {
    return false;
  }

  /**
   * A single non-breaking space, painted transparent and clipped by the
   * fixed `width`/`overflow: hidden` in `.cm-indent-token` (MarkdownEditor.css)
   * — not decorative, load-bearing for vertical geometry. See that CSS
   * rule's own doc comment for the full measurement: an *empty*
   * `inline-block` with `height: auto` collapses to 0 height (CSS2.1
   * §10.6.7), which is what forced the old `height: 1em` fallback — but
   * `1em` (the font-size alone) undershoots the line's actual rendered
   * text-cursor height (measured in the real app: 16px vs. the real
   * cursor's 19px, for a 16px/1.5-line-height configuration), producing
   * the reported vertical caret shift when moving between indentation
   * and text. A real (if invisible) character gives the box a natural,
   * font-metric-driven height — the same mechanism real text's own
   * height comes from — so it tracks the line's actual font/line-height
   * automatically, with no pixel value hardcoded anywhere in this file.
   *
   * `aria-hidden="true"`: this placeholder character has no meaning to
   * announce; screen readers should skip it entirely, the same as the
   * `cm-widgetBuffer` accessory elements CM6 itself already marks
   * `aria-hidden` around every replace-widget.
   */
  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-indent-token';
    span.style.width = `${this.px}px`;
    span.textContent = ' ';
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
