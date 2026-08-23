import { Prec, type ChangeSpec, type EditorState, type Extension, type StateCommand, type Text } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import {
  changesForDelta,
  contentColumn,
  dedentDeltaFor,
  enclosingListItem,
  owningListItem,
} from './listIndentKeymap';

/**
 * Backspace subtree-awareness + ordered-list renumbering — the one gap
 * `@codemirror/lang-markdown`'s own `deleteMarkupBackward` has no
 * configuration seam to close (it is upstream code, not Clutter's), per
 * `docs/` audit findings (`markdown_keyboard_architecture_audit_part2.md`
 * §7.1/§7.3): its "delete one level of indentation" branch is a single,
 * local `{ from, to }` edit confined to the current line, with zero
 * awareness of a nested subtree beneath it, and it never calls
 * `renumberList` at all (unlike `insertNewlineContinueMarkup`'s own 3 call
 * sites for Enter).
 *
 * This module supplements, never replaces, `deleteMarkupBackward` — it
 * claims Backspace only for the narrow set of marker-removal-boundary
 * cases that are unsafe for lang-markdown's own single-line edit (a nested
 * item about to lose its marker, or any item leaving an `OrderedList`'s
 * numbered sequence), and returns `false` for every other Backspace
 * context so `deleteMarkupBackward` (and `emojiListKeymap.ts`'s own
 * marker handling, for `EmojiList`) continues to own everything it
 * already correctly owns — the exact coexistence pattern
 * `emojiListKeymap()` already proves out for Enter/Backspace in `EmojiList`
 * context (see that file's own doc comment).
 *
 * A TOP-LEVEL item that owns a nested subtree, whose own marker is being
 * removed with no shallower level to dedent to, is a separate, narrower
 * case (`wouldMergeSubtreeWithFollowingList`, below): if demoting it would
 * merge its children into an immediately-following same-marker-family
 * list, the operation is refused outright — Backspace is consumed but the
 * document is left unchanged — rather than either duplicating
 * `deleteMarkupBackward`'s own (bug-producing) edit or attempting a
 * blank-line separator, which was tried and confirmed empirically
 * (this module's own test suite) not to work: a blank line never splits
 * two adjacent same-marker `BulletList`s into separate tree nodes in this
 * parser, only a differing marker family does. No content this keystroke
 * doesn't directly target is ever rewritten.
 */

/**
 * Whether `item` is the first `ListItem` child of its own enclosing list —
 * the one case lang-markdown's own marker-removal skips straight to full
 * single-line deletion, never the two-stage blank-then-delete sequence.
 * Compared by `.from`, not object identity — separate tree traversals are
 * not guaranteed to return reference-equal `SyntaxNode`s for the same
 * position, the identical lesson `listIndentKeymap.ts`'s own
 * `dedupeToRoots` is already built around.
 */
function isFirstListItem(item: SyntaxNode): boolean {
  return item.parent?.firstChild?.from === item.from;
}

/**
 * The marker "family" a `ListItem` participates in — the bullet character
 * itself (`-`/`*`/`+`) for a `BulletList` item, or just the delimiter
 * character (`.`/`)`) for an `OrderedList` item, deliberately excluding
 * the literal number. Two adjacent lists merge into one `List` node in
 * this grammar if and only if their marker families match — confirmed
 * empirically (see this module's own test suite): a blank line alone
 * never splits them, only a differing family (or a genuinely different
 * intervening block) does.
 */
function markerFamilyOfListItem(state: EditorState, item: SyntaxNode): string | null {
  const marker = item.firstChild;
  if (!marker || marker.name !== 'ListMark') {
    return null;
  }
  const text = state.doc.sliceString(marker.from, marker.to);
  const isOrdered = item.parent?.name === 'OrderedList';
  return isOrdered ? text.slice(-1) : text;
}

/**
 * Whether demoting `listItem` (a top-level item with no shallower level
 * to dedent to) would merge its own nested subtree into `listItem`'s
 * immediately-following sibling — the exact, narrow B11 condition: the
 * subtree's own first-level marker family matches the following
 * sibling's, so once `listItem` stops being a `ListItem` at all, nothing
 * in the grammar keeps the two lists apart (see the module doc comment's
 * "known, deliberately unresolved residual," now handled by refusal
 * rather than left silently broken).
 */
function wouldMergeSubtreeWithFollowingList(state: EditorState, listItem: SyntaxNode): boolean {
  const childList = listItem.getChild('BulletList') ?? listItem.getChild('OrderedList');
  if (!childList) {
    return false;
  }
  const nextSibling = listItem.nextSibling;
  if (!nextSibling || nextSibling.name !== 'ListItem') {
    return false;
  }
  const childFirstItem = childList.firstChild;
  if (!childFirstItem || childFirstItem.name !== 'ListItem') {
    return false;
  }
  const childFamily = markerFamilyOfListItem(state, childFirstItem);
  const nextFamily = markerFamilyOfListItem(state, nextSibling);
  return childFamily !== null && childFamily === nextFamily;
}

interface OrderedItemNumber {
  readonly prefixLength: number;
  readonly matchLength: number;
  readonly value: number;
}

function parseItemNumber(item: SyntaxNode, doc: Text): OrderedItemNumber | null {
  const text = doc.sliceString(item.from, Math.min(item.to, item.from + 12));
  const match = /^(\s*)(\d+)[.)]/.exec(text);
  if (!match) {
    return null;
  }
  const [, leading, digits] = match;
  return { prefixLength: leading!.length, matchLength: leading!.length + digits!.length, value: +digits! };
}

/**
 * Renumbers every `ListItem` sibling after `removed` to a consecutive
 * sequence starting from `removed`'s own previous sibling's number + 1 (or
 * 1, if `removed` had no previous sibling) — the Backspace-side mirror of
 * `insertNewlineContinueMarkup`'s own `renumberList` (not exported by
 * `@codemirror/lang-markdown`, so reimplemented here against the same
 * `ListItem`-sibling-chain shape rather than imported).
 */
function renumberFollowing(doc: Text, changes: ChangeSpec[], removed: SyntaxNode): void {
  const prevSibling = removed.prevSibling;
  const prevNumber = prevSibling && prevSibling.name === 'ListItem' ? parseItemNumber(prevSibling, doc)?.value ?? null : null;
  let expected = (prevNumber ?? 0) + 1;

  for (let node: SyntaxNode | null = removed.nextSibling; node; node = node.nextSibling) {
    if (node.name !== 'ListItem') {
      continue;
    }
    const info = parseItemNumber(node, doc);
    if (!info) {
      break;
    }
    if (info.value !== expected) {
      changes.push({ from: node.from + info.prefixLength, to: node.from + info.matchLength, insert: String(expected) });
    }
    expected += 1;
  }
}

export const deleteMarkupBackwardSubtreeAware: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  if (!range.empty) {
    return false;
  }

  const pos = range.from;
  const { doc } = state;
  const line = doc.lineAt(pos);
  const listItem = owningListItem(state, pos);
  if (!listItem) {
    return false;
  }

  // Only the item's own marker line — a continuation line's Backspace is
  // already correct (lazy continuation) and out of this module's scope.
  const itemLine = doc.lineAt(listItem.from);
  if (itemLine.number !== line.number) {
    return false;
  }

  const contentCol = contentColumn(state, listItem);
  if (pos - line.from !== contentCol) {
    return false;
  }

  const enclosingList = listItem.parent;
  if (!enclosingList || (enclosingList.name !== 'BulletList' && enclosingList.name !== 'OrderedList')) {
    return false;
  }

  const isOrdered = enclosingList.name === 'OrderedList';
  const parentItem = enclosingListItem(listItem);
  const first = isFirstListItem(listItem);
  const prefixText = line.text.slice(0, contentCol);
  const risky = first || /^\s*$/.test(prefixText);

  if (!risky && !isOrdered) {
    // The safe, width-preserving "replace marker with blank" case, in a
    // BulletList — deleteMarkupBackward already handles this correctly
    // and no subtree/renumber concern applies. Defer entirely.
    return false;
  }

  const changes: ChangeSpec[] = [];

  if (risky && parentItem) {
    // A nested item (native list marker, or the internal space of a
    // nested task marker — same boundary, same fix) about to have its
    // marker destroyed outright by lang-markdown's own single-line
    // "delete one level of indentation" branch. Dedent the item's whole
    // subtree by one level instead, preserving the marker (and any
    // checkbox) rather than deleting it — the same "promote by one
    // level" operation Shift-Tab already performs correctly.
    //
    // Deliberately does not renumber here even when the enclosing list is
    // Ordered: the item is being relocated (promoted), not removed from
    // its list's numbering — it keeps its own literal number, and
    // whatever the promoted-from list's remaining items should be
    // numbered as is an independent, genuinely nested-ordered-list
    // question this milestone does not resolve (out of the plan's tested
    // scope, §9.1/§9.2 of the implementation plan).
    const delta = dedentDeltaFor(state, listItem);
    if (delta === null) {
      return false;
    }
    changes.push(...changesForDelta(state, listItem, -delta));
  } else if (risky && !parentItem) {
    // Top-level item losing its own marker entirely, with no shallower
    // level to dedent to (the "impossible operation" case — mirrors
    // dedentListItem's own contract of doing nothing further when
    // already top-level).
    //
    // If this item also owns a nested subtree AND demoting it would merge
    // that subtree into an immediately-following same-marker-family list
    // (confirmed empirically — see markerFamilyOfListItem's own doc
    // comment — that a blank line never prevents this merge, only a
    // differing marker family does), refuse the operation outright:
    // consume the keystroke, make no change. This is the B11 case,
    // narrowly scoped to exactly this condition — no marker rewriting, no
    // separator insertion, nothing touching content this keystroke didn't
    // directly target.
    if (wouldMergeSubtreeWithFollowingList(state, listItem)) {
      return true;
    }
    if (!isOrdered) {
      // Nothing this module can usefully add here — defer to
      // deleteMarkupBackward's own identical single-line edit.
      return false;
    }
    changes.push({ from: line.from, to: pos });
    renumberFollowing(doc, changes, listItem);
  } else {
    // !risky && isOrdered: the safe "replace marker with blank" case,
    // intercepted only to keep the ordered list's remaining numbers
    // correct — same resulting text lang-markdown's own blank-replace
    // branch would produce (spaceBefore is already whitespace, so
    // replacing the whole marker-to-content span with matching-width
    // blanks is textually identical to its narrower in-place edit).
    changes.push({ from: line.from, to: line.from + contentCol, insert: ' '.repeat(contentCol) });
    renumberFollowing(doc, changes, listItem);
  }

  if (changes.length === 0) {
    return false;
  }

  dispatch(state.update({ changes, userEvent: 'delete' }));
  return true;
};

export function listDeleteKeymap(): Extension {
  return Prec.high(keymap.of([{ key: 'Backspace', run: deleteMarkupBackwardSubtreeAware }]));
}
