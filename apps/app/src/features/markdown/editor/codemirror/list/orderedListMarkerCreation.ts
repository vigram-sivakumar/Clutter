import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type StateCommand } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { classifyMarkerText } from './listMarkerDecoration';
import { isRiskyRenumberRewrite, listItemLiteralNumber } from './orderedListRenumbering';

/**
 * The `Space` keybinding that completes a bare ordered-list marker
 * (`1.` → `1. `, `99.` → `99. `) into a real, structurally-numbered list
 * item — the marker-creation half of the numbering feature; recognition
 * itself is entirely the grammar's job (`listMarkerParagraphInterrupt.ts`),
 * this command only ever decides whether the digit run needs correcting,
 * never whether the line is a list at all.
 *
 * **Detection needs no provisional reparse, unlike
 * `orderedListTabNormalization.ts`.** Confirmed directly (real
 * `EditorState`, before any Space is dispatched): a bare ordered marker
 * with no separator yet — `"Paragraph\n99."`, `"5. One\n6. Two\n99."`,
 * `"1. One\n5. Two\n99."` alike — is *already* a real `ListItem`/
 * `ListMark`/`OrderedList` in the **current** tree, in every case this
 * command cares about: `listMarkerParagraphInterrupt`'s own `endLeaf`
 * predicate matches a bare marker with zero separator just as readily as
 * one with a separator (its trailing group is optional), and a bare next
 * item within an already-open list has no `breaking`-gate restriction at
 * all natively. Inserting the Space itself never changes tree topology —
 * it only adds a character inside an already-recognized `ListItem` — so
 * the destination `OrderedList`'s own sibling structure can be read
 * straight from the current, pre-Space tree with zero reparse step. This
 * is the "cleanest existing mechanism" this feature's own investigation
 * asked to identify: no new tree-walk primitive, no provisional-state
 * machinery duplicating `orderedListTabNormalization.ts`'s own (that
 * module's provisional reparse exists specifically to detect a
 * *membership change* Phase A's whitespace edit might have caused — this
 * command's Space keystroke never moves anything between lists, so
 * nothing here needs that comparison).
 *
 * **Baseline policy — reused, not reimplemented.** Per product decision:
 * "the baseline is the immediately preceding existing sibling's literal
 * number." Since this command only ever fires on a `ListItem` that is,
 * by construction, the *last* child of its `OrderedList` (nothing has
 * been typed after it yet), "the immediately preceding sibling" is
 * simply `listItem.prevSibling` — no need for
 * `orderedListTabNormalization.ts`'s own `planDestinationRenumbering`
 * walk (built for the Tab case's more general shape: potentially
 * *several* newly-joined items, and pre-existing items that may follow
 * them). `listItemLiteralNumber` (`orderedListRenumbering.ts`, shared
 * with that module) is the one piece actually reused — the same digit-run
 * extraction, not a second copy of it.
 *
 * **Isolated new list**: no preceding sibling → baseline `0` → correct
 * number `1`. This deliberately mirrors `planDestinationRenumbering`'s
 * own convention for an empty destination (`baseline` defaults to `0`
 * when nothing precedes the joined block) — reusing the same "no
 * predecessor means baseline zero" fact, not inventing a second rule for
 * the isolated case.
 *
 * **Delimiter preservation**: the rewrite, when needed, only ever
 * replaces `[marker.from, marker.from + digits.length)` — the digit run
 * alone. The delimiter character (`.`/`)`) is never part of the range,
 * so it is never touched, for either delimiter, unconditionally.
 *
 * **Bullets are untouched by construction, not by a special-case guard**:
 * `classifyMarkerText` returning `'bullet'` (or `null`) makes this
 * command return `false` immediately, falling through to CM6's ordinary
 * default Space handling — bullets have no numbering concept to
 * normalize, and this command never inspects, decorates, or rewrites
 * anything about them.
 *
 * **Manual number edits are untouched by construction, not by a special-
 * case guard, either.** This command's own guard requires the cursor to
 * sit *exactly* at `marker.to` *and* at the physical line's own end — the
 * one shape a bare, just-typed marker with nothing after it produces. A
 * manual edit of an *existing*, already-content-bearing item's digit run
 * (`3` → `99` in `"3. Three"`) never satisfies this shape (the line's own
 * end is well past the marker), so it is dispatched as an ordinary
 * character-replacement transaction with this command never entering the
 * picture at all — matching `orderedListTabNormalization.ts`'s own
 * identical invariant #3 ("a manually retyped digit never passes through
 * this module at all").
 */
function precedingSiblingListItem(item: SyntaxNode): SyntaxNode | null {
  for (let sib = item.prevSibling; sib; sib = sib.prevSibling) {
    if (sib.name === 'ListItem') {
      return sib;
    }
  }
  return null;
}

export const insertOrderedListMarkerSeparator: StateCommand = ({ state, dispatch }) => {
  const { selection } = state;
  if (selection.ranges.length !== 1 || !selection.main.empty) {
    return false;
  }

  const pos = selection.main.head;
  const line = state.doc.lineAt(pos);
  if (pos !== line.to) {
    return false;
  }

  let listItem: SyntaxNode | null = null;
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (node.name === 'ListItem') {
      listItem = node;
      break;
    }
  }
  if (!listItem || listItem.parent?.name !== 'OrderedList') {
    return false;
  }

  const marker = listItem.firstChild;
  if (!marker || marker.name !== 'ListMark' || marker.to !== pos) {
    return false;
  }

  const markerText = state.sliceDoc(marker.from, marker.to);
  if (classifyMarkerText(markerText) !== 'ordered') {
    return false;
  }

  const info = listItemLiteralNumber(state, listItem);
  if (!info) {
    return false;
  }

  const preceding = precedingSiblingListItem(listItem);
  const precedingInfo = preceding ? listItemLiteralNumber(state, preceding) : null;
  const baseline = precedingInfo ? precedingInfo.literal : 0;
  const correctNumber = baseline + 1;

  const changes: { from: number; to: number; insert: string }[] = [{ from: pos, to: pos, insert: ' ' }];
  if (
    correctNumber !== info.literal &&
    !isRiskyRenumberRewrite(state, info.marker.from, info.marker.from + info.digits.length, String(correctNumber).length)
  ) {
    changes.push({ from: info.marker.from, to: info.marker.from + info.digits.length, insert: String(correctNumber) });
  }

  const changeSet = state.changes(changes);
  dispatch(
    state.update({
      changes,
      selection: EditorSelection.cursor(changeSet.mapPos(pos, 1)),
      scrollIntoView: true,
      userEvent: 'input.type',
    })
  );
  return true;
};
