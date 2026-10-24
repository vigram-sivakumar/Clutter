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
  // The token's actual rendered boxes first: one per visual line it occupies. A single box from its two endpoints
  // is only right for a token on one line — see `renderedTokenRects`.
  const rects = renderedTokenRects(view, node);
  if (rects.length > 0) {
    return rects.some((rect) => x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top && y <= rect.bottom);
  }

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
 * The boxes a token is really painted in — one per visual line it spans — read from the DOM it renders to, never
 * derived from its two endpoint positions.
 *
 * Why not the endpoints: when text soft-wraps, a position that sits exactly at a wrap point has two visual places,
 * and `coordsAtPos(node.from, 1)` returns the one at the END of the previous line (a zero-width box beside the
 * space the line broke at), not where the token actually starts. A date reference that wraps to the next line then
 * got a hit box running from the end of the line above to the end of the token — missing most of its own text and
 * covering its neighbours — so a click on it was rejected as "not on the token", fell through to CM6's caret
 * placement, and engaged the token's raw Markdown instead of activating it.
 *
 * Zero-width boxes (collapsed ranges and caret-like slivers at a boundary) are ignored; they are where the
 * endpoint trick goes wrong. Returns `[]` when the layout cannot be measured (no `Range` geometry, as in jsdom, or
 * nothing painted), and the caller falls back to the endpoints.
 */
export function renderedTokenRects(
  view: EditorView,
  node: TokenNodeRange
): readonly { left: number; right: number; top: number; bottom: number }[] {
  if (typeof document === 'undefined') {
    return [];
  }
  const range = document.createRange();
  if (typeof range.getClientRects !== 'function') {
    return [];
  }
  try {
    const start = view.domAtPos(node.from, 1);
    const end = view.domAtPos(node.to, -1);
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
  } catch {
    return [];
  }
  return Array.from(range.getClientRects()).filter((rect) => rect.width > 0.5 && rect.height > 0);
}

/**
 * Where a ⌘-click puts the caret inside the token it landed on. Supplying one to `tokenMouseHandlers` turns the
 * ⌘-click on that kind into "edit": the token's raw source is revealed (the caret inside it is what engages it, the
 * same way arrowing into it does) and nothing is activated. Kinds that do not supply one are untouched by ⌘.
 */
export type TokenEditCaret = (view: EditorView, node: TokenNodeRange) => number;

/** The press that edits instead of activating: ⌘ on macOS, Ctrl elsewhere — CM6's own "add a cursor" modifier. */
export function isTokenEditPress(event: MouseEvent): boolean {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || '');
  return mac ? event.metaKey : event.ctrlKey;
}

/**
 * The ⌘-click decision, with an explicit position like `handleTokenClick` (and for the same reason). When a token is
 * at rest at `pos`, puts the caret at `caretFor(node)` — inside the token, so it reveals its source — and returns
 * `true`; anything else returns `false` and the click is left to CM6 (a second cursor, ordinarily). A read-only view
 * has nothing to edit, so it declines too and the ordinary activation applies.
 */
export function handleTokenEditClick(
  view: EditorView,
  pos: number,
  isTokenNode: TokenNodePredicate,
  caretFor: TokenEditCaret
): boolean {
  if (view.state.readOnly) {
    return false;
  }
  const node = findAtRestTokenAt(view.state, pos, isTokenNode);
  if (!node) {
    return false;
  }
  const caret = Math.min(Math.max(caretFor(view, node), node.from), node.to);
  view.dispatch({ selection: { anchor: caret }, userEvent: 'select.pointer', scrollIntoView: true });
  view.focus();
  return true;
}

/**
 * Mouse interaction, built on `EditorView.domEventHandlers` — the actual
 * CM6 mechanism for DOM-event-level interaction. Deliberately not the
 * keymap facet, which dispatches key bindings only and has no path to
 * mouse events at all. Shared by every semantic inline construct kind;
 * `isTokenNode`/`getActivation` are the only kind-specific inputs, and `editCaret` (optional) opts the kind in to
 * ⌘-click editing — see `TokenEditCaret`. A ⌘-click that is not on one of the kind's tokens is never intercepted.
 */
export function tokenMouseHandlers(
  isTokenNode: TokenNodePredicate,
  getActivation: GetTokenActivation,
  editCaret?: TokenEditCaret
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

      if (editCaret && isTokenEditPress(event) && handleTokenEditClick(view, pos, isTokenNode, editCaret)) {
        event.preventDefault();
        return true;
      }

      const handled = handleTokenClick(view, pos, event.altKey, isTokenNode, getActivation);
      if (handled) {
        event.preventDefault();
      }
      return handled;
    },
  });
}
