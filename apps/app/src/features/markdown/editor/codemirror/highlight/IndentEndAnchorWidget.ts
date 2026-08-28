import { WidgetType } from '@codemirror/view';

/**
 * A zero-width caret-geometry anchor placed immediately after the final
 * `.cm-indent` mark on a line whose content is entirely leading
 * indentation (`leadingIndentDecoration.ts`'s `buildDecorations`).
 *
 * The problem this solves: `.cm-indent` is a `Decoration.mark` — the real
 * whitespace characters stay in the DOM, just wrapped in a span whose CSS
 * (`display: inline-block; width: 20px`) is wider than the characters'
 * own glyphs. CM6's `coordsAtPos` (used by `drawSelection()` to draw the
 * caret) resolves a position at the end of a text node via
 * `Range.getClientRects()` on that *raw text*, which reports the narrow
 * glyph geometry, not the mark's widened box. When real content follows
 * the indentation, the caret position is measured from *that* content's
 * own text node instead, and since normal inline flow places it flush
 * against the mark's box edge, the two coincide — but when nothing
 * follows (a fresh empty indented line, before typing), there's no such
 * node to defer to, so the caret lands inside the last indent token
 * instead of at its right edge. Confirmed by direct measurement; see
 * docs/editor-architecture-decisions.md's caret-vs-indent-box entry.
 *
 * The fix: give CM6 something to measure that already carries the box
 * geometry we want. Unlike a `Decoration.mark`, `WidgetTile.coordsIn`
 * measures a widget via `this.dom.getClientRects()` — the widget
 * element's own box — so a fresh, empty inline element placed right
 * after the last `.cm-indent` mark naturally lands flush against that
 * mark's right edge (the same reason typing a real character there
 * self-corrects the caret today).
 *
 * Same pattern as `ConcealedMarkerWidget.ts` (an empty, text-less DOM
 * element used for its own independent box geometry rather than fighting
 * a real glyph's metrics), for the same underlying reason. `height: 1em`
 * is required, not optional: an empty `inline-block` with `height: auto`
 * collapses to `0` (CSS2.1 §10.6.7), and CM6's own `RectangleMarker.
 * forRange` (`@codemirror/view`) takes the drawn caret's height directly
 * from `coordsAtPos`'s rect — a zero-height anchor would make the caret
 * render zero-height at exactly the position this fixes. See
 * `.cm-marker--concealed` in `MarkdownEditor.css` for the same finding
 * made once already, for the marker-concealment case.
 *
 * `Decoration.widget`, not `Decoration.replace`: this widget adds an
 * extra rendered position, consuming zero document length. It never
 * replaces or hides any real character — the indentation's real
 * whitespace and `.cm-indent`'s own width semantics are untouched.
 */
export class IndentEndAnchorWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-indent-end-anchor';
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
