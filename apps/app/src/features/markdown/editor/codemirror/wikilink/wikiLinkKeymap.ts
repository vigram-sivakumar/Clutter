import type { EditorState, Extension } from '@codemirror/state';
import { keymap, type Command, type EditorView } from '@codemirror/view';

import {
  activateAdjacentToken,
  hopLeft as hopLeftToken,
  hopRight as hopRightToken,
  tokenKeymap,
} from '../semanticToken/tokenKeymap';
import { isTokenEngaged } from '../semanticToken/tokenEngagement';
import { getWikiLinkActivation } from './wikiLinkActivation';
import { referenceZoneAt } from './wikiLinkCompletionSource';
import { findWikiLinkAt, isWikiLinkNode } from './wikiLinkEngagement';
import type { ResolveWikiLink } from './wikiLinkResolution';
import { lastUnescapedSlashOffset } from './wikiLinkScanner';

/**
 * WikiLink-specific entry points onto the generic hop mechanism
 * (`semanticToken/tokenKeymap.ts`) — kept as their own named exports
 * since they're exercised directly in tests.
 */
export function hopRight(view: EditorView): boolean {
  return hopRightToken(view, isWikiLinkNode);
}

export function hopLeft(view: EditorView): boolean {
  return hopLeftToken(view, isWikiLinkNode);
}

/**
 * The concealed-folder-prefix range of the engaged WikiLink at `pos`, if
 * any — `null` when `pos` isn't inside an engaged WikiLink, or the
 * reference has no folder component to conceal. Mirrors exactly what
 * `wikiLinkMarkerDecorations.ts` computes for rendering (same
 * `referenceZoneAt` + `lastUnescapedSlashOffset` composition) — one
 * definition of "where the concealed range is", not two, so the hop
 * commands below can never disagree with what's actually drawn.
 */
function findConcealedRange(state: EditorState, pos: number): { from: number; to: number } | null {
  const node = findWikiLinkAt(state, pos);
  if (!node || !isTokenEngaged(state, node)) {
    return null;
  }

  const zone = referenceZoneAt(state, node.from + 2);
  if (!zone) {
    return null;
  }

  const refText = state.sliceDoc(zone.from, zone.to);
  const slashOffset = lastUnescapedSlashOffset(refText);
  if (slashOffset === null) {
    return null;
  }

  return { from: zone.from, to: zone.from + slashOffset + 1 };
}

/**
 * ArrowLeft/ArrowRight across the concealed folder prefix of an engaged
 * WikiLink — a custom keymap command, deliberately not native
 * `atomicRanges`: the concealed range is never registered atomic (see
 * `wikiLinkMarkerDecorations.ts`'s `concealedFolder` comment for why —
 * this editor has no undo, so atomic deletion is unacceptable), so there's
 * nothing for native cursor-motion atomicity to hook into. This is the
 * same shape as `hopLeft`/`hopRight` above, scoped to the internal
 * concealed boundary instead of the whole node's outer boundary — the two
 * never overlap (one fires from outside the node, the other only once
 * already engaged inside it), so both can be bound to the same keys
 * without conflict.
 */
export function hopOverConcealedLeft(view: EditorView): boolean {
  const sel = view.state.selection.main;
  if (!sel.empty) {
    return false;
  }

  const range = findConcealedRange(view.state, sel.head);
  if (!range || sel.head !== range.to) {
    return false;
  }

  view.dispatch({ selection: { anchor: range.from } });
  return true;
}

export function hopOverConcealedRight(view: EditorView): boolean {
  const sel = view.state.selection.main;
  if (!sel.empty) {
    return false;
  }

  const range = findConcealedRange(view.state, sel.head);
  if (!range || sel.head !== range.from) {
    return false;
  }

  view.dispatch({ selection: { anchor: range.to } });
  return true;
}

/**
 * Enter, when the caret is adjacent to an at-rest WikiLink: activates it,
 * the same action a click would perform — a thin adapter over the generic
 * `activateAdjacentToken` mechanism.
 */
export function activateAdjacent(getResolver: () => ResolveWikiLink | undefined): Command {
  return (view) =>
    activateAdjacentToken(view, isWikiLinkNode, (v, node) => getWikiLinkActivation(v, node, getResolver));
}

/**
 * Key bindings for WikiLinks — a thin adapter over the generic
 * `tokenKeymap` mechanism, shared by every semantic inline construct kind
 * (docs/editor-architecture-decisions.md §11), plus the WikiLink-specific
 * `hopOverConcealedLeft`/`Right` above. Both `ArrowLeft`/`ArrowRight`
 * bindings can coexist on the same keys: `tokenKeymap`'s hop only fires
 * from outside the node, the concealed hop only fires once already
 * engaged inside it — CM6 tries each binding in order and moves on when
 * one returns `false`, so whichever condition doesn't apply simply falls
 * through to the other (or, failing both, to ordinary character motion).
 */
export function wikiLinkKeymap(getResolver: () => ResolveWikiLink | undefined): Extension {
  return [
    tokenKeymap(isWikiLinkNode, (view, node) => getWikiLinkActivation(view, node, getResolver)),
    keymap.of([
      { key: 'ArrowLeft', run: hopOverConcealedLeft },
      { key: 'ArrowRight', run: hopOverConcealedRight },
    ]),
  ];
}
