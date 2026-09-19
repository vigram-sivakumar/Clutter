import { deleteCharForward } from '@codemirror/commands';
import { Prec, type Extension } from '@codemirror/state';
import { keymap, type Command, type KeyBinding } from '@codemirror/view';

/**
 * General editor behavior fix, construct-agnostic: an empty first line has
 * nothing before it for Backspace to delete backward, so CM6's own default
 * `deleteCharBackward` (`@codemirror/commands`) is correctly a no-op there
 * — confirmed directly against the installed source (`deleteByChar`'s own
 * `line.number != 1` guard, which exists specifically to stop backward
 * deletion from ever trying to cross above the document's first line).
 * That's standard, expected behavior for *non-empty* content on line 1 —
 * there is genuinely nothing to merge backward into. But when line 1 is
 * *empty*, the line itself has no content of its own to preserve, and
 * Delete already handles the identical position correctly by merging
 * forward (`deleteCharForward`'s own `line.number != state.doc.lines`
 * check *does* allow crossing forward into line 2, deleting the newline
 * and merging the next line up) — Backspace's own inability to look
 * backward at the document's own edge is exactly why it should fall back
 * to the same forward merge Delete already performs, not remain a no-op.
 *
 * This command is the fix for **both** keys, not just Backspace: Delete
 * already produces the correct *general* result (confirmed above), but at
 * this exact position — cursor at document position 0, on an empty first
 * line — Delete can otherwise be intercepted first by
 * `tableWholeDeletionKeymap.ts`'s own `Prec.highest` arm-trigger whenever
 * the following line happens to be a table's own first line (that
 * trigger's own `isCaretJustAboveTable` check has no requirement that the
 * line above be non-empty). Binding this command to Delete too, and
 * installing it in `buildEditorExtensions.ts` *before*
 * `tableWholeDeletionKeymap()` in the extension array (both are
 * `Prec.highest`; CM6 resolves same-precedence ties by registration
 * order), lets this one narrow, construct-agnostic rule win at this one
 * position for both keys — an empty leading line was never a deliberate
 * "the user is approaching this table to delete it" gesture the way real
 * content immediately above a table is.
 *
 * **Deliberately reuses `deleteCharForward` itself, not a hand-rolled
 * transaction** — per this fix's own "smallest, most general" mandate:
 * the merge-forward behavior already exists and is already correct: this
 * command's only job is deciding *when* to reach for it (empty line 1,
 * collapsed cursor at position 0, at least one more line in the
 * document), never how to perform the merge.
 *
 * **No table-awareness anywhere in this file** — the "never move the root
 * cursor into the table widget" requirement is satisfied entirely by
 * `tableRootSelectionSnap.ts`'s own, already-installed, already-general
 * invariant (root selection is never left resting at `[table.from,
 * table.to]`): if merging this line leaves the cursor exactly at a
 * table's own `.from` (the table was the very next block), that filter —
 * which runs on *every* transaction regardless of origin — relocates it
 * to the nearest safe position on its own, exactly as it already does for
 * every other path that can produce the same violating position (paste,
 * a mouse drag, Shift+Arrow). This command produces a perfectly ordinary
 * `deleteCharForward` transaction; it has no opinion about what follows
 * the deleted line.
 */
const mergeEmptyFirstLineForward: Command = (view) => {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty || sel.head !== 0) {
    return false;
  }
  if (state.doc.lines <= 1) {
    return false;
  }
  if (state.doc.line(1).text.length !== 0) {
    return false;
  }
  return deleteCharForward(view);
};

/**
 * `Prec.highest`, matching `tableWholeDeletionKeymap()` — see this file's
 * own top doc comment for why the two need to be same-precedence (a tie
 * resolved by registration order in `buildEditorExtensions.ts`, this
 * extension listed first) rather than this one simply outranking that
 * one unconditionally.
 */
export function emptyLeadingLineDeletion(): Extension {
  const bindings: readonly KeyBinding[] = [
    { key: 'Backspace', run: mergeEmptyFirstLineForward },
    { key: 'Delete', run: mergeEmptyFirstLineForward },
  ];
  return Prec.highest(keymap.of(bindings));
}
