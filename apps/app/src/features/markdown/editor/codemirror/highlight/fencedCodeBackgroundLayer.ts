import { foldState, syntaxTree } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView, layer, RectangleMarker } from '@codemirror/view';

import { docRelativeBase, fencedCodeVisualBounds } from '../fencedCode/fencedCodeBlockGeometry';

/**
 * The fenced-code card's *background only* — one `RectangleMarker` per
 * visible `FencedCode` node, rendered through CM6's public `layer()`
 * mechanism rather than `Decoration.line`. Everything else the card
 * needs (gutter/padding reservation, line numbers, active-line tint,
 * `--first`/`--last` border/radius) stays exactly where it already was,
 * on `.cm-code-block-line` in `fencedCodeBlockLineDecoration.ts` — this
 * file's only job is the flat color fill, previously
 * `color-mix(..., 55%, transparent)` on that same class.
 *
 * **Why a layer, not a `Decoration.line` background — confirmed, not
 * assumed.** CM6's own author (Marijn Haverbeke, CodeMirror forum,
 * "Line background color and selection layering", Dec 2022) states there
 * are exactly two ways to keep a line background from hiding
 * `drawSelection()`'s own selection highlight: a transparent background,
 * or `layer()` rendering a separate element behind the selection layer.
 * Clutter shipped the first for this construct (the striping/banding bugs
 * this replaces were downstream of that same translucency); this is the
 * second, chosen because it allows a fully opaque surface with no
 * compositing artifact at all.
 *
 * **Positioned behind the selection layer with no explicit z-index of our
 * own.** `layer()`'s own `LayerView.setOrder` computes
 * `zIndex = (above ? 150 : -1) - pos`, where `pos` is this layer's index
 * in one shared `layerOrder` facet array alongside every other registered
 * layer (confirmed directly against the installed
 * `@codemirror/view@6.43.9` source). `drawSelection()` — installed in
 * `createEditorView.ts`, ahead of `...extensions` (where this layer is
 * registered via `buildEditorExtensions.ts`) — contributes its own
 * `cursorLayer`/`selectionLayer` earlier in that same array with plain
 * default precedence (confirmed: `drawSelection()`'s own source returns a
 * bare array, no `Prec` wrapping). Registering this layer anywhere after
 * `drawSelection()` in the extension list therefore *always* gives it a
 * larger `pos`, and so a more negative `zIndex`, than the selection
 * layer — behind it — without this file ever computing or hardcoding a
 * number. Moving `drawSelection()`'s own position, or this layer's
 * position relative to it, would change the ordering; nothing here does
 * either.
 *
 * **One rectangle per block, not one per line — the actual fix, not just
 * a different mechanism for the same shape.** The prior striping bug
 * existed because N stacked per-line boxes each contributed their own
 * paint, and a translucent background let neighboring contributions blend
 * visibly. A single rectangle spanning the whole block has no internal
 * seam to blend at, structurally, regardless of opacity.
 *
 * **Vertical bounds are exactly `[first line's own top, last line's own
 * bottom]` — never wider — verified live, and corrected once after a real
 * discrepancy was found.** `view.lineBlockAt(pos)` does not always return
 * a single physical line's own bounds: when a block-level widget (e.g.
 * `blockSeparatorDecoration.ts`'s own separator) sits immediately before
 * a line, CM6 merges the two into one composite `BlockInfo`, and the
 * naive `.top` read from it is the *widget's* top, not the line's —
 * reproduced directly (a 12px overshoot above the opening-fence line,
 * exactly matching a leading separator's own height) before `textBlock()`
 * (`fencedCode/fencedCodeBlockGeometry.ts` — extracted there once
 * `fencedCodeHoverMouseHandlers.ts` needed the identical geometry for a
 * different purpose) was added to resolve past it via the documented
 * `BlockInfo.type` array contract. With that fix, the rectangle's `top`
 * is the first owned line's own real `.top`, and its height is
 * `lastLineBlock.bottom - firstLineBlock.top` exactly, not padded or
 * extended by any margin of our own. A folded block's hidden lines
 * contribute zero height to this computation (CM6's heightmap already
 * excludes folded ranges), so the rectangle shrinks to exactly the one
 * remaining visible line's own bounds, never the pre-fold size.
 */

const MARKER_CLASS = 'cm-fenced-code-bg';

function buildMarkers(view: EditorView): RectangleMarker[] {
  const markers: RectangleMarker[] = [];
  const seen = new Set<number>();

  // Measured once per build, not per block: the card's horizontal extent
  // matches `.cm-code-block-line`'s own full border-box width exactly
  // (border-left/right stay on that class, unchanged) — `.cm-content`
  // carries no horizontal padding of its own, so its own content rect
  // already is that width, with no extra inset to guess at.
  const contentRect = view.contentDOM.getBoundingClientRect();
  const left = contentRect.left - docRelativeBase(view).left;
  const width = contentRect.width;

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'FencedCode' || seen.has(node.from)) {
          return;
        }
        seen.add(node.from);

        const { top, bottom } = fencedCodeVisualBounds(view, node);
        markers.push(new RectangleMarker(MARKER_CLASS, left, top, width, bottom - top));
      },
    });
  }

  return markers;
}

export function fencedCodeBackgroundLayer(): Extension {
  return layer({
    above: false,
    class: 'cm-fenced-code-bg-layer',
    markers: buildMarkers,
    update(update) {
      return (
        update.docChanged ||
        update.viewportChanged ||
        update.startState.field(foldState, false) !== update.state.field(foldState, false)
      );
      // `update.geometryChanged` (scroll/resize) is deliberately not
      // checked here — `LayerView.update()` already triggers its own
      // remeasure on `update.geometryChanged` regardless of what this
      // callback returns (confirmed directly in the installed source), so
      // duplicating that check here would be dead logic.
    },
  });
}
