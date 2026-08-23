import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { findAtRestTokenAt, type TokenNodePredicate, type TokenNodeRange } from './tokenEngagement';

/**
 * Resolves a token occurrence to its `activate()` callback, or `null` if
 * the occurrence turns out not to be a valid instance of the kind (e.g. a
 * stale-tree scan failure) — kind-specific scanning/resolution stays
 * entirely behind this callback; this module never inspects the node's
 * content itself.
 */
export type GetTokenActivation = (
  view: EditorView,
  node: TokenNodeRange
) => (() => void) | null;

/**
 * The actual click decision logic, factored out from the `posAtCoords`-based
 * DOM wiring below so it's directly testable with an explicit position —
 * `posAtCoords` relies on real text-layout geometry (`Range.getClientRects`)
 * that jsdom does not implement at all, so tests exercise this function
 * directly rather than synthesizing coordinates jsdom can't resolve. Works
 * correctly in a real browser regardless.
 *
 * `_altKey` is accepted (kept in the signature — every caller, including
 * every kind-specific wrapper and its tests, still passes it) but no
 * longer changes behavior — a click always activates. It previously
 * dispatched a custom selection to "engage" the token instead of
 * activating it; that was Clutter-authored cursor repositioning with no
 * CM6 equivalent, removed as part of the cursor/selection behavior reset
 * (placing the caret inside a token to edit it is ordinary
 * click-to-position-cursor, which CM6 already does natively once this
 * handler declines to intercept the click).
 *
 * Returns `true` if a token was at `pos` and something happened (so the
 * caller knows to `preventDefault()`), `false` otherwise.
 */
export function handleTokenClick(
  view: EditorView,
  pos: number,
  _altKey: boolean,
  isTokenNode: TokenNodePredicate,
  getActivation: GetTokenActivation
): boolean {
  const node = findAtRestTokenAt(view.state, pos, isTokenNode);
  if (!node) {
    return false;
  }

  const activate = getActivation(view, node);
  if (!activate) {
    return false;
  }

  activate();
  return true;
}

/**
 * Verifies the actual click coordinates fall within the token's real
 * rendered bounding box, not just that `posAtCoords` resolved *a*
 * position touching the token's range.
 *
 * Root cause this exists to close (reproduced and confirmed directly,
 * not assumed): `posAtCoords` resolves any click to the *nearest*
 * character position, including clicks that land past the last rendered
 * character on a line — there is nothing else there to resolve to, so
 * CM6's own inline coordinate scan (`@codemirror/view`'s `posAtCoords`,
 * `InlineCoordsScan`) snaps to the end of the line's actual content. When
 * a token (e.g. a WikiLink) is the last thing on its line, that snapped
 * position is exactly the token's own `to` boundary — which
 * `findAtRestTokenAt`'s inclusive `pos <= node.to` check (correctly, for
 * a real boundary click) treats as a hit. The result: a click anywhere
 * in the empty space to the right of a line-ending token — which can
 * visually span most of a wide editor pane — resolves to the identical
 * document position as clicking the token itself, and activates it.
 * Confirmed empirically: for `This is a reference [[Project/Project A]]`
 * (a 41-character line, WikiLink range `[20, 41]`), `pos = 41` — the
 * line's own end — matches the WikiLink via `findAtRestTokenAt`, exactly
 * as a real end-of-token click would.
 *
 * A pure document-position check cannot distinguish these two cases —
 * they are, by construction, the same position. Only the actual pixel
 * coordinates can: a genuine click on or immediately at the token's
 * rendered edge falls within its bounding box; a click far to the right,
 * merely resolved to the same position for lack of anything closer,
 * does not.
 *
 * `null` from `coordsAtPos` (geometry unavailable — no measured layout,
 * as in jsdom-based tests, or the position isn't currently rendered)
 * falls back to `true` rather than blocking activation on a check that
 * can't be performed — preserving prior behavior for anything unable to
 * measure real coordinates, rather than introducing a new failure mode.
 */
export function isWithinTokenBounds(
  view: EditorView,
  node: TokenNodeRange,
  x: number,
  y: number
): boolean {
  const startRect = view.coordsAtPos(node.from, 1);
  const endRect = view.coordsAtPos(node.to, -1);
  if (!startRect || !endRect) {
    return true;
  }

  const left = Math.min(startRect.left, endRect.left);
  const right = Math.max(startRect.right, endRect.right);
  const top = Math.min(startRect.top, endRect.top);
  const bottom = Math.max(startRect.bottom, endRect.bottom);

  return x >= left && x <= right && y >= top && y <= bottom;
}

/**
 * Mouse interaction, built on `EditorView.domEventHandlers` — the actual
 * CM6 mechanism for DOM-event-level interaction. Deliberately not the
 * keymap facet, which dispatches key bindings only and has no path to
 * mouse events at all. Shared by every semantic inline construct kind;
 * `isTokenNode`/`getActivation` are the only kind-specific inputs.
 */
export function tokenMouseHandlers(
  isTokenNode: TokenNodePredicate,
  getActivation: GetTokenActivation
): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0) {
        return false;
      }

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) {
        return false;
      }

      // Reject before handleTokenClick's own (position-only) lookup runs
      // — see isWithinTokenBounds's doc comment for exactly why a
      // position match alone isn't sufficient here.
      const node = findAtRestTokenAt(view.state, pos, isTokenNode);
      if (node && !isWithinTokenBounds(view, node, event.clientX, event.clientY)) {
        return false;
      }

      const handled = handleTokenClick(view, pos, event.altKey, isTokenNode, getActivation);
      if (handled) {
        event.preventDefault();
      }
      return handled;
    },
  });
}
