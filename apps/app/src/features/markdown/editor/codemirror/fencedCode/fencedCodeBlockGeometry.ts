import { BlockType, type BlockInfo, type EditorView } from '@codemirror/view';

/**
 * Shared geometry helpers for "what is this `FencedCode` node's own real
 * visual extent" — extracted from `highlight/fencedCodeBackgroundLayer.ts`
 * (its original, sole consumer) once `fencedCodeHoverMouseHandlers.ts`
 * needed the identical computation for a different purpose (confirming a
 * hover hit is genuinely within a block's own rendered bounds, not just
 * that some position resolved to it — see that file's own doc comment).
 * Two independent consumers needing the same non-trivial geometry is
 * exactly the case this codebase's own conventions call for extracting,
 * not duplicating a second copy.
 */

/**
 * `view.lineBlockAt(pos)` can return a *composite* block, not a single
 * physical line's own bounds — confirmed live, not assumed: a leading
 * block-level widget (e.g. `blockSeparatorDecoration.ts`'s own separator)
 * sitting immediately before a line gets merged by CM6's own height-map
 * into one combined `BlockInfo` whose `.top` is the *widget's* top, not
 * the line's. `BlockInfo.type` being an array of sub-blocks in exactly
 * this case is documented public API ("When querying lines, this may be
 * an array of all the blocks that make up the line") — resolving to the
 * `Text` sub-block's own bounds is the sanctioned way to get the real
 * line geometry, not a workaround.
 */
export function textBlock(block: BlockInfo): BlockInfo {
  if (!Array.isArray(block.type)) {
    return block;
  }
  return block.type.find((sub) => sub.type === BlockType.Text) ?? block;
}

/**
 * The document-relative screen-coordinate origin — confirmed against the
 * installed source's own private `getBase(view)` helper (used internally
 * by `RectangleMarker.forRange`, not exported): the `scrollDOM`'s own
 * screen rect, adjusted for its current scroll offset. Reimplemented here
 * rather than assumed, since it's the one piece of geometry math both of
 * this module's consumers need to convert a raw `event.clientX`/`clientY`
 * (viewport-relative, changes with scroll) into the same document-relative
 * space `view.lineBlockAt(...).top`/`RectangleMarker` already use (which
 * does not change with scroll) — comparing the two coordinate spaces
 * directly, without this conversion, is a real bug this module's own
 * hover consumer hit live (screen Y compared against document-relative
 * bounds, silently always failing whenever the page was scrolled at all
 * from its initial position).
 */
export function docRelativeBase(view: EditorView): { left: number; top: number } {
  const rect = view.scrollDOM.getBoundingClientRect();
  return {
    left: rect.left - view.scrollDOM.scrollLeft,
    top: rect.top - view.scrollDOM.scrollTop,
  };
}

/**
 * The real, rendered vertical bounds `[top, bottom]` of a `FencedCode`
 * node — exactly `[first owned line's own top, last owned line's own
 * bottom]`, never wider. `node.to` may coincide with the synthetic empty
 * line CM6 adds after a trailing newline (which has no `FencedCode` owner
 * of its own), so `lastRealPos` probes one position back, the same guard
 * `fencedCodeBlockLineDecoration.ts`'s own `--last` computation already
 * established. A folded block's hidden lines contribute zero height to
 * this computation (CM6's heightmap already excludes folded ranges), so
 * a collapsed block's bounds shrink to its one remaining visible line
 * automatically.
 */
export function fencedCodeVisualBounds(
  view: EditorView,
  node: { from: number; to: number }
): { top: number; bottom: number } {
  const lastRealPos = node.to > node.from ? node.to - 1 : node.to;
  const topBlock = textBlock(view.lineBlockAt(node.from));
  const bottomBlock = textBlock(view.lineBlockAt(lastRealPos));
  return { top: topBlock.top, bottom: bottomBlock.bottom };
}
