import { syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import {
  type TokenNodePredicate,
  type TokenNodeRange,
} from '../semanticToken/tokenEngagement';
import { isMarkEngaged, type MarkEngagementMode, type MarkRangeSelector } from './liveMarkDecoration';

/**
 * Fixes the one gap `liveMarkDecoration.ts`'s empty `Decoration.replace({})`
 * genuinely leaves: a real mouse click at the pixel boundary between an
 * at-rest collapsed marker run and the construct's visible text is
 * ambiguous DOM hit-testing, not an application bug — confirmed by direct
 * browser reproduction (mounting the production `MarkdownEditor`, clicking,
 * and reading `window.getSelection()`, not merely `posAtCoords()` theory).
 * The collapsed marker range renders zero pixels, so a click aimed at "just
 * past the last visible character" and a click aimed at "the invisible
 * marker that used to sit there" land on the exact same pixel; the browser's
 * native `caretPositionFromPoint` breaks the tie by always resolving to
 * whichever side has real, rendered DOM content — i.e. the *near* edge of
 * the collapsed range, never the far one. `posAtCoords` then hands CM6 that
 * near-edge position verbatim, and `isTokenEngaged`
 * (`semanticToken/tokenEngagement.ts`) correctly-but-unhelpfully treats it
 * as "inside the construct," revealing markers CM6 had no reason to reveal.
 *
 * This is a pure DOM hit-testing artifact of zero-width `Decoration.replace`
 * ranges specifically — WikiLink doesn't share it (confirmed by the same
 * direct-click reproduction): its at-rest widget renders real, non-zero
 * pixels, so a click at its edge is an ordinary unambiguous DOM boundary.
 * That's also why this is a *sibling* to `semanticToken/tokenSelectionSnap.ts`
 * rather than a reuse of it — `tokenSelectionSnap` treats an entire at-rest
 * node as one opaque, snap-anywhere-inside atomic unit (correct for a
 * single-glyph widget with no meaningful "middle"), which would wrongly
 * snap an ordinary click landing in the *middle of real visible text*
 * (`Bo|ld`) to one of the construct's edges. This mechanism only snaps a
 * position that falls within a *marker* sub-range specifically — the exact
 * same `MarkRangeSelector` each construct already supplies to
 * `liveMarkDecoration` for hiding those markers in the first place. No
 * construct-specific code lives here or anywhere that calls this: emphasis,
 * headings, and any future marker-hiding construct get this fix for free
 * simply by going through `liveMarkDecoration`, which wires this extension
 * in alongside its decoration `ViewPlugin` (see that module).
 *
 * Scoped to `Transaction.userEvent === 'select.pointer'` — the exact tag
 * CM6's own mouse click/drag selection handling applies (confirmed against
 * `@codemirror/view`'s installed source, not assumed) — so this:
 *  - never touches keyboard-driven cursor motion (tagged `select.keyboard`),
 *    which must keep stepping through marker positions one character at a
 *    time as a user arrows into an engaged construct;
 *  - never touches a directly-dispatched programmatic selection with no
 *    `userEvent` at all, matching the pre-existing, deliberately-asserted
 *    behavior in `emphasisMarkerDecoration.test.ts` that a bare
 *    `{selection: {anchor: n}}` lands exactly at `n`, unmoved, even inside
 *    a collapsed marker range.
 *
 * `getMarkRanges` is checked against every `isConstructNode` ancestor of
 * the position, not just the innermost — this is what makes nested markup
 * (`***bold italic***`) resolve outward through both delimiter layers in
 * one click rather than stopping at the inner one.
 *
 * The snap *destination* (`markBoundaryRange`) is branched on
 * `engagementMode` the same way `isMarkEngaged` already branches the
 * engagement *decision* — for a real reason, not just for symmetry: in
 * `'node-range'` mode the containing node genuinely is the engagement
 * unit (an entire `*emphasis*` span), so snapping to its own edges is
 * correct there. In `'physical-line'` mode the mark's own physical line
 * is the unit instead — a `Blockquote` node can span many lines (lazy
 * continuation nests a later line's `QuoteMark` inside an earlier line's
 * own `Paragraph`, see `liveMarkDecoration.ts`'s `isMarkEngaged` doc
 * comment), so using the *node's* `[from, to)` here snapped a click near
 * an unengaged marker to the start/end of the entire multi-line
 * blockquote instead of a boundary on the marker's own line — confirmed
 * concretely: clicking into the concealed marker on the middle line of
 * `"> hey\n>> come on\n>> Man"` (with `>> Man` engaged) landed the caret
 * at document position 0. Fixed by deriving the boundary from
 * `state.doc.lineAt(mark.from)` instead of the node — the exact same
 * "which physical line does this mark belong to" fact `isMarkEngaged`
 * already keys off, just supplying its `.from`/`.to` as the snap target
 * range rather than only using it for the boolean.
 */
export function liveMarkSelectionSnap(
  isConstructNode: TokenNodePredicate,
  getMarkRanges: MarkRangeSelector,
  engagementMode: MarkEngagementMode = 'node-range'
): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (tr.docChanged || !tr.selection || !tr.isUserEvent('select.pointer')) {
      return tr;
    }

    const range = tr.selection.main;
    const anchor = snapPosition(tr.startState, range.anchor, isConstructNode, getMarkRanges, engagementMode);
    const head = snapPosition(tr.startState, range.head, isConstructNode, getMarkRanges, engagementMode);

    if (anchor === range.anchor && head === range.head) {
      return tr;
    }

    return { selection: EditorSelection.single(anchor, head), scrollIntoView: tr.scrollIntoView };
  });
}

/**
 * The boundary a mark should snap toward. `'node-range'`/function modes
 * use the containing node's own span (unchanged, intentional — see this
 * file's doc comment); `'physical-line'` mode uses the mark's own
 * physical line instead of the containing node's span, which can cover
 * many lines for a construct like `Blockquote`.
 */
function markBoundaryRange(
  state: EditorState,
  node: SyntaxNode,
  engagementMode: MarkEngagementMode,
  mark: TokenNodeRange
): TokenNodeRange {
  if (engagementMode === 'physical-line') {
    const line = state.doc.lineAt(mark.from);
    return { from: line.from, to: line.to };
  }

  return { from: node.from, to: node.to };
}

function snapPosition(
  state: EditorState,
  pos: number,
  isConstructNode: TokenNodePredicate,
  getMarkRanges: MarkRangeSelector,
  engagementMode: MarkEngagementMode
): number {
  let candidate = pos;

  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
    node;
    node = node.parent
  ) {
    if (!isConstructNode(node.name)) {
      continue;
    }

    for (const mark of getMarkRanges(node, state)) {
      if (isMarkEngaged(state, node, getMarkRanges, engagementMode, mark)) {
        continue;
      }

      if (candidate < mark.from || candidate > mark.to) {
        continue;
      }

      const range = markBoundaryRange(state, node, engagementMode, mark);
      const leadingDistance = mark.from - range.from;
      const trailingDistance = range.to - mark.to;
      candidate = leadingDistance <= trailingDistance ? range.from : range.to;
    }
  }

  return candidate;
}
