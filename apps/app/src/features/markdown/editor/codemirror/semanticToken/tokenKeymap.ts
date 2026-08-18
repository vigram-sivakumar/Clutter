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
 * in that direction, jump straight to the far boundary instead of taking
 * a single step. Landing there is immediately engaged (same
 * inclusive-boundary rule), which is what gives keyboard-only users an
 * entry path.
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

  view.dispatch({ selection: { anchor: node.to } });
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

  view.dispatch({ selection: { anchor: node.from } });
  return true;
}

/**
 * Enter, when the caret is one position before or after (i.e. structurally
 * adjacent to, per the note above) an at-rest token: activates it, the
 * same action a click would perform — the keyboard-only path to
 * activation, since the hop gestures above only ever get a keyboard user
 * *into* editing, never invoke activation on their own.
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
 */
export function tokenKeymap(
  isTokenNode: TokenNodePredicate,
  getActivation: GetTokenActivation
): Extension {
  return keymap.of([
    { key: 'ArrowRight', run: (view) => hopRight(view, isTokenNode) },
    { key: 'ArrowLeft', run: (view) => hopLeft(view, isTokenNode) },
    { key: 'Enter', run: (view) => activateAdjacentToken(view, isTokenNode, getActivation) },
  ]);
}
