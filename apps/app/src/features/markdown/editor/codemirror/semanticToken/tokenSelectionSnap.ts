import { EditorSelection, EditorState, type Extension } from '@codemirror/state';

import { findAtRestTokenAt, type TokenNodePredicate } from './tokenEngagement';

/**
 * Empirically-motivated correction for the one case native `atomicRanges`
 * genuinely doesn't cover: a selection spanning fully across an at-rest
 * token from outside to outside already, correctly, stays
 * collapsed/atomic natively — no correction needed there. But a
 * directly-dispatched selection whose endpoint lands *strictly inside* an
 * at-rest node's range is not auto-corrected at all; the endpoint just
 * lands exactly where dispatched. That's exactly what a real
 * mouse-drag-then-mouseup produces (a `posAtCoords`-derived position
 * dispatched as-is), so it's a genuine gap, not a hypothetical one.
 *
 * Fix: any selection endpoint landing strictly inside an at-rest node
 * (never exactly at a boundary, which is intentionally left alone —
 * that's engagement's own inclusive-boundary rule, not this one) snaps to
 * whichever boundary is nearer. Shared by every semantic inline construct
 * kind; `isTokenNode` is the only kind-specific input.
 */
export function tokenSelectionSnap(isTokenNode: TokenNodePredicate): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (tr.docChanged || !tr.selection) {
      return tr;
    }

    const range = tr.selection.main;
    const anchor = snapPosition(tr.startState, range.anchor, isTokenNode);
    const head = snapPosition(tr.startState, range.head, isTokenNode);

    if (anchor === range.anchor && head === range.head) {
      return tr;
    }

    return { selection: EditorSelection.single(anchor, head), scrollIntoView: tr.scrollIntoView };
  });
}

function snapPosition(state: EditorState, pos: number, isTokenNode: TokenNodePredicate): number {
  const node = findAtRestTokenAt(state, pos, isTokenNode);
  if (!node || pos <= node.from || pos >= node.to) {
    return pos;
  }

  const distanceToStart = pos - node.from;
  const distanceToEnd = node.to - pos;
  return distanceToStart <= distanceToEnd ? node.from : node.to;
}
