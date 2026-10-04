import type { ChangeSpec, EditorState } from '@codemirror/state';

/**
 * The change that puts one space at `pos` (a position in `state`'s current document) — so a tag,
 * date or wiki link accepted from autocomplete is already closed off, rendered, and the user can
 * keep typing. None when a space or tab already follows, so accepting never doubles it; the
 * cursor goes one past `pos`'s token end either way (after the new space, or after the existing one).
 *
 * Only the completions that know they just finished a token use this — in their own `apply`, in
 * the same transaction as the insertion, so it is one step to undo. Embeds do not: they open a
 * new line instead.
 */
export function trailingSpaceChange(state: EditorState, pos: number): ChangeSpec | null {
  const next = state.sliceDoc(pos, pos + 1);
  return next === ' ' || next === '\t' ? null : { from: pos, insert: ' ' };
}
