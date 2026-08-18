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
 * The actual click/Alt-click decision logic, factored out from the
 * `posAtCoords`-based DOM wiring below so it's directly testable with an
 * explicit position — `posAtCoords` relies on real text-layout geometry
 * (`Range.getClientRects`) that jsdom does not implement at all, so tests
 * exercise this function directly rather than synthesizing coordinates
 * jsdom can't resolve. Works correctly in a real browser regardless.
 *
 * Returns `true` if a token was at `pos` and something happened (so the
 * caller knows to `preventDefault()`), `false` otherwise.
 */
export function handleTokenClick(
  view: EditorView,
  pos: number,
  altKey: boolean,
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

  if (altKey) {
    // Engage: place the caret at the end of the raw text (a defined,
    // deterministic position — exact placement is an implementation
    // detail, not an architecture question).
    view.dispatch({ selection: { anchor: node.to - 1 } });
    return true;
  }

  activate();
  return true;
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

      const handled = handleTokenClick(view, pos, event.altKey, isTokenNode, getActivation);
      if (handled) {
        event.preventDefault();
      }
      return handled;
    },
  });
}
