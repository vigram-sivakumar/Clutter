import type { Extension } from '@codemirror/state';
import { type EditorView, keymap } from '@codemirror/view';

import { findTokenAt, type TokenNodePredicate, type TokenNodeRange } from './tokenEngagement';
import type { GetTokenActivation } from './tokenMouseHandlers';

/**
 * A genuine, non-obvious consequence of the already-locked inclusive-
 * boundary engagement rule: `node.from` and `node.to` themselves are
 * ALWAYS already engaged — the instant a caret reaches either one, the
 * containment check is satisfied, so the node is never "still at rest" at
 * its own boundary. "Adjacent to an at-rest node" is therefore
 * structurally one position *outside* the boundary — `node.from - 1`
 * (immediately before) or `node.to + 1` (immediately after) — never the
 * boundary position itself. Every function below checks the corrected,
 * one-step-away position. Shared by every semantic inline construct kind;
 * `isTokenNode` is the only kind-specific input to the hop functions.
 */

/**
 * Plain `cursorCharRight`/`Left` do NOT hop over an at-rest token at all —
 * they move one grapheme at a time and enter character-by-character the
 * instant they reach the near boundary, failing the locked "atomic,
 * doesn't disrupt fast navigation" requirement. The fix: when the caret
 * sits one position before an at-rest token and the user presses further
 * in that direction, jump straight to the token's near boundary (the one
 * facing the direction of approach) instead of taking a single step.
 * Landing there is immediately engaged (same inclusive-boundary rule),
 * which is what gives keyboard-only users an entry path — and crucially,
 * entry happens from whichever side the caret approached from, never the
 * opposite side (product decision: the caret must never appear to have
 * "passed through" the token to its far side in one press).
 */
export function hopRight(view: EditorView, isTokenNode: TokenNodePredicate): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) {
    return false;
  }

  const node = findTokenAt(state, sel.head + 1, isTokenNode);
  if (!node || node.from !== sel.head + 1) {
    return false;
  }

  view.dispatch({ selection: { anchor: node.from } });
  return true;
}

export function hopLeft(view: EditorView, isTokenNode: TokenNodePredicate): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) {
    return false;
  }

  const node = findTokenAt(state, sel.head - 1, isTokenNode);
  if (!node || node.to !== sel.head - 1) {
    return false;
  }

  view.dispatch({ selection: { anchor: node.to } });
  return true;
}

/**
 * Activates a token as if it had been clicked, given the caret is one
 * position before or after (i.e. structurally adjacent to, per the note
 * above) an at-rest token.
 *
 * NOT wired to any key by `tokenKeymap` below (deliberately — see that
 * function's own comment): kept as a plain, directly-callable function
 * rather than deleted, since the underlying "is the caret adjacent to
 * this token" logic has its own value independent of how — or whether —
 * a caller chooses to trigger activation from it.
 */
export function activateAdjacentToken(
  view: EditorView,
  isTokenNode: TokenNodePredicate,
  getActivation: GetTokenActivation
): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) {
    return false;
  }

  const nodeBefore = findTokenAt(state, sel.head + 1, isTokenNode);
  const nodeAfter = findTokenAt(state, sel.head - 1, isTokenNode);
  const node: TokenNodeRange | null =
    nodeBefore && nodeBefore.from === sel.head + 1
      ? nodeBefore
      : nodeAfter && nodeAfter.to === sel.head - 1
        ? nodeAfter
        : null;
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
 * Key bindings only — mouse interaction is a separate mechanism
 * (`tokenMouseHandlers.ts`), since `keymap` has no path to mouse events at
 * all. Shared by every semantic inline construct kind.
 *
 * No `Enter` binding: an earlier version bound Enter (adjacent to an
 * at-rest token) to `activateAdjacentToken`, matching
 * docs/editor-architecture-decisions.md's "keyboard-only activation gap"
 * entry — but that collided with the far more common case of a user
 * simply pressing Enter to start a new line, whose caret happens to land
 * one position past a token (e.g. a trailing space, or an existing blank
 * line right after it): Enter would silently activate/navigate instead of
 * inserting a newline. Per explicit product decision, activation is
 * mouse-only — `getActivation` is still accepted here (part of this
 * function's stable signature) but is intentionally unused; deliberately
 * NOT reintroduced under a different key (e.g. Mod-Enter) either. This is
 * a known, deliberate divergence from that ADR entry, not an oversight.
 */
export function tokenKeymap(
  isTokenNode: TokenNodePredicate,
  _getActivation: GetTokenActivation
): Extension {
  return keymap.of([
    { key: 'ArrowRight', run: (view) => hopRight(view, isTokenNode) },
    { key: 'ArrowLeft', run: (view) => hopLeft(view, isTokenNode) },
  ]);
}
