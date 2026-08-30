import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { ChangeDesc, ChangeSpec, EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { resolveLineIndentContext } from '../indent/markdownIndentContext';
import {
  isRiskyRenumberRewrite,
  listItemLiteralNumber,
  renumberSequentialTail,
  type RenumberEdit,
} from './orderedListRenumbering';

/**
 * Tab/Shift-Tab's own ordered-list numbering normalizer — the Phase C/D
 * half of the design docs/list-item-architecture-odr.md §16.8 already
 * proposed and this module implements: Phase A (the flat, per-physical-
 * line `±INDENT_STEP_SPACES` whitespace edit in `markdownIndentKeymap.ts`)
 * is computed and applied completely unchanged; this module only ever
 * runs *after*, on the resulting whitespace edit, to answer one question
 * per touched line — "did this line's own ordered-list membership
 * genuinely change?" — and, only when the answer is yes, plans the
 * numbering rewrites needed to keep both the list it left and the list it
 * joined internally consistent.
 *
 * **Locked invariants this module must never violate** (product decision,
 * 2026-08-30):
 * 1. It never influences *how much* a line indents — `lineIndentChange`'s
 *    own arithmetic is not read, called, or duplicated here; this module
 *    only ever consumes the `RenumberEdit[]` Phase A already produced, as
 *    opaque `{from,to,insert}` facts about which lines changed.
 *  2. It never inspects marker *width* to decide indentation, nesting, or
 *    membership — every structural question ("which `OrderedList` does
 *    this line belong to," "is it still a `ListItem` at all") is answered
 *    exclusively by resolving positions in the real parsed tree
 *    (`resolveInner`/ancestor walks), the same "ask the parser, never
 *    infer from characters" principle this codebase applies everywhere
 *    else (§1, §7, §9, §14.9, §16.1).
 * 3. It never fires for a plain text edit — its only entry point,
 *    `planOrderedListNormalization`, is called *exclusively* from
 *    `markdownIndentMore`/`markdownIndentLess` with Phase A's own changes
 *    as input; a manually retyped digit never passes through this module
 *    at all, so manual number edits remain completely unrestricted by
 *    construction, not by a separate guard checking "was this Tab."
 * 4. It never attempts to repair a list a touched line's own edit did
 *    *not* genuinely reparent — a line that is still not recognized as a
 *    `ListItem` after Phase A (docs/list-item-architecture-odr.md §16.2's
 *    two pre-existing Tab/Shift-Tab structural hazards: first-item-
 *    inclusive Tab, partial-group Shift-Tab) is skipped outright, and any
 *    *other*, untouched sibling collateral damage from those hazards is
 *    left exactly as-is — this module only ever plans numbering for lines
 *    the indent command actually touched, never a wider blast radius.
 */

/** A touched physical line that was, in the *original* (pre-Phase-A) tree, an `OrderedList` item's own marker line. */
interface OrderedListCandidate {
  readonly originalMarkerFrom: number;
  readonly originalListItem: SyntaxNode;
  readonly originalOrderedList: SyntaxNode;
}

/**
 * The `ListItem` whose own first child (`ListMark`) starts exactly at
 * `pos`, resolved against `state`'s tree — the same "does a real marker
 * begin exactly here" check `markdownEnterKeymap.ts`'s own
 * `listItemStartingAt` already established for the whole-item-selection
 * Backspace/Delete fix, reused here under a locally descriptive name
 * since a marker *position* (not a selection boundary) is what this
 * module always has on hand.
 */
function listItemWithMarkerAt(state: EditorState, pos: number): SyntaxNode | null {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (node.name === 'ListItem') {
      return node.firstChild?.from === pos ? node : null;
    }
  }
  return null;
}

/** `item`'s own immediate `OrderedList` parent, or `null` if `item` belongs to a `BulletList` (never renumbered) or has no list parent at all. */
function orderedListParent(item: SyntaxNode): SyntaxNode | null {
  return item.parent?.name === 'OrderedList' ? item.parent : null;
}

/**
 * Every distinct touched line (from Phase A's own `changes`, deduplicated
 * by line and sorted by document position so later grouping reflects true
 * document order regardless of how multiple selection ranges were
 * iterated) that was, in the *original* tree, an `OrderedList` item's own
 * marker line. A touched paragraph/heading/blockquote/code line, or a
 * touched `BulletList` item, is never a candidate — there is no ordered
 * numbering for either to ever need normalizing.
 */
function collectOrderedListCandidates(
  state: EditorState,
  phaseAChanges: readonly ChangeSpec[]
): OrderedListCandidate[] {
  const seenLines = new Set<number>();
  const candidates: OrderedListCandidate[] = [];

  for (const change of phaseAChanges) {
    const from = (change as { from?: number }).from;
    if (from === undefined) continue;
    const line = state.doc.lineAt(from);
    if (seenLines.has(line.from)) continue;
    seenLines.add(line.from);

    const context = resolveLineIndentContext(state, line);
    if (context.kind !== 'list') continue;

    const listItem = listItemWithMarkerAt(state, context.markerFrom);
    if (!listItem) continue;
    const orderedList = orderedListParent(listItem);
    if (!orderedList) continue;

    candidates.push({ originalMarkerFrom: context.markerFrom, originalListItem: listItem, originalOrderedList: orderedList });
  }

  return candidates.sort((a, b) => a.originalMarkerFrom - b.originalMarkerFrom);
}

/** One touched item confirmed, against the provisional post-edit tree, to have genuinely changed which `OrderedList` it belongs to. */
interface MovedItem {
  readonly candidate: OrderedListCandidate;
  readonly provisionalMarkerFrom: number;
  readonly newOrderedList: SyntaxNode;
}

/**
 * Resolves, for each candidate, whether Phase A's own whitespace edit
 * actually changed its `OrderedList` membership — the one read-only
 * question this module needs the provisional (post-Phase-A, reparsed)
 * tree for at all. Everything else this module does afterward (source-
 * side gap-closing, destination-side numbering) reads exclusively from
 * the *original* tree/state, since Phase A only ever rewrites a touched
 * line's own leading whitespace, so every sibling line this module cares
 * about next — never itself a touched line — has an identical position
 * and literal text in the original document as it did before the edit.
 *
 * A candidate whose mapped marker position no longer resolves to a real
 * `ListMark`/`ListItem` at all (§16.2's structural hazards) is silently
 * dropped here — per this module's own locked invariant 4, there is
 * nothing valid to normalize for it.
 */
function findMovedItems(
  provisional: EditorState,
  phaseAChangeSet: ChangeDesc,
  candidates: readonly OrderedListCandidate[]
): MovedItem[] {
  const moved: MovedItem[] = [];

  for (const candidate of candidates) {
    const mappedMarkerFrom = phaseAChangeSet.mapPos(candidate.originalMarkerFrom, 1);
    const provisionalItem = listItemWithMarkerAt(provisional, mappedMarkerFrom);
    if (!provisionalItem) continue;

    const newOrderedList = orderedListParent(provisionalItem);
    if (!newOrderedList) continue;

    const mappedOldListFrom = phaseAChangeSet.mapPos(candidate.originalOrderedList.from, 1);
    if (newOrderedList.from === mappedOldListFrom) continue;

    moved.push({ candidate, provisionalMarkerFrom: mappedMarkerFrom, newOrderedList });
  }

  return moved;
}

/**
 * True if `listNode` has at least one direct `ListItem` child whose own
 * marker position is *not* in `excludedMarkerFroms` — i.e., whether this
 * list has any member besides the ones the caller is about to move.
 *
 * The one guard this module needs against a genuine false positive: a
 * fully isolated item (no siblings anywhere, before or after — e.g. a
 * lone `"10. item"` as the entire document) still gets a *new*
 * `OrderedList` tree node identity every time its own leading whitespace
 * changes, because a node's `.from` tracks its own first child's start —
 * confirmed directly (repeatedly Tab-ing such a line without this guard
 * spuriously renamed it to `"1."`, caught by this module's own regression
 * suite, not by inspection). That is never a real membership change —
 * there was no other member before, and there is none after — so
 * `planOrderedListNormalization` skips entirely whenever *neither* the
 * source list(s) a group of items left *nor* the destination list(s) they
 * joined have any other, untouched member at all: nothing genuinely
 * "departed" or "joined" anything, only the touched items themselves
 * relocated as a closed set with zero external context to normalize
 * against. A source or destination that *does* have an untouched member
 * (the ordinary case — §16.2's "existing destination" or "the rest of the
 * list stayed behind") still normalizes exactly as before; this guard
 * only ever suppresses the fully-isolated, no-context case.
 */
function listHasOtherMembers(listNode: SyntaxNode, excludedMarkerFroms: ReadonlySet<number>): boolean {
  for (let child: SyntaxNode | null = listNode.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'ListItem') continue;
    const marker = child.firstChild;
    if (marker && marker.name === 'ListMark' && !excludedMarkerFroms.has(marker.from)) {
      return true;
    }
  }
  return false;
}

/** Groups `moved` by a numeric key, preserving each group's own relative document order. */
function groupBy<T>(items: readonly T[], key: (item: T) => number): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

/**
 * Plans the numbering for one destination `OrderedList` — one or more
 * items have just joined it together (`joinedMarkerFroms`, in provisional
 * coordinates) — by walking the list's own children *in the provisional
 * tree* (the only place its true, post-join document-order membership is
 * visible) exactly once, left to right:
 *
 * - A run of pre-existing (non-joined) items encountered *before* any
 *   joined item establishes `baseline` (the last such item's own literal
 *   number) purely as a seed — never rewritten itself, mirroring
 *   `renumberSequentialTail`'s own "anchor is never rewritten" rule.
 * - Each joined item is assigned `baseline + (its own 1-based position
 *   among the joined items)` — `baseline` defaults to `0` when no
 *   pre-existing item precedes the joined block at all (a genuinely new
 *   list, or joining at an existing list's own very front), so the first
 *   joined item becomes `1`, matching the product decision's own example
 *   (`2. B` + `3. C` → `1. B` + `2. C`) and generalizing it uniformly to
 *   "joining after item N" (→ `N+1`, `N+2`, ...).
 * - A pre-existing item encountered *after* the joined block only shifts
 *   if it is still sequential relative to the *previous* pre-existing
 *   item's own **original** literal number (never a just-rewritten one,
 *   same policy §16.3/`renumberSequentialTail` already establish) — an
 *   irregular run stops being touched at the first break, exactly as
 *   elsewhere. A qualifying item shifts by the joined count, using the
 *   same growth-direction formula `renumberSequentialTail` already
 *   implements for insertion (`original + shift`, `shift > 0` here).
 *
 * Every individual digit-run rewrite — for a joined item's own newly
 * assigned number, and for a shifted pre-existing tail item alike — is
 * filtered through `isRiskyRenumberRewrite` before being kept, so a
 * multi-line item's own descendant content can never be silently broken
 * by either half of this plan.
 *
 * Rewrite positions are read from `provisional` (where the walk happens)
 * and translated back to `state`'s own original coordinates via
 * `inverted` (`phaseAChangeSet.invert(state.doc)`) before being returned
 * — the *only* place in this module that needs that inverse mapping,
 * since every position here, joined or pre-existing, is discovered by
 * walking the destination's post-edit structure, not by reasoning about
 * which original line it came from.
 */
function planDestinationRenumbering(
  provisional: EditorState,
  inverted: ChangeDesc,
  destinationList: SyntaxNode,
  joinedMarkerFroms: ReadonlySet<number>
): RenumberEdit[] {
  const edits: RenumberEdit[] = [];
  let baseline = 0;
  let joinedSeen = 0;
  let prevPreExistingOriginal: number | null = null;
  let pastJoinedBlock = false;

  for (let child: SyntaxNode | null = destinationList.firstChild; child; child = child.nextSibling) {
    const info = listItemLiteralNumber(provisional, child);
    if (!info) break;
    const { marker, digits, literal } = info;
    const isJoined = joinedMarkerFroms.has(marker.from);

    if (isJoined) {
      pastJoinedBlock = true;
      joinedSeen++;
      const newNumber = baseline + joinedSeen;
      if (newNumber !== literal) {
        const from = inverted.mapPos(marker.from, 1);
        const to = inverted.mapPos(marker.from + digits.length, 1);
        if (!isRiskyRenumberRewrite(provisional, marker.from, marker.from + digits.length, String(newNumber).length)) {
          edits.push({ from, to, insert: String(newNumber) });
        }
      }
      continue;
    }

    if (!pastJoinedBlock) {
      // Pre-existing item before the joined block: pure seed, never rewritten.
      baseline = literal;
      prevPreExistingOriginal = literal;
      continue;
    }

    // Pre-existing item after the joined block: shift only if still
    // sequential relative to the previous pre-existing item's own
    // original number.
    if (prevPreExistingOriginal !== null && literal !== prevPreExistingOriginal + 1) break;
    const shiftedNumber: number = literal + joinedSeen;
    if (shiftedNumber !== literal) {
      const from = inverted.mapPos(marker.from, 1);
      const to = inverted.mapPos(marker.from + digits.length, 1);
      if (!isRiskyRenumberRewrite(provisional, marker.from, marker.from + digits.length, String(shiftedNumber).length)) {
        edits.push({ from, to, insert: String(shiftedNumber) });
      }
    }
    prevPreExistingOriginal = literal;
  }

  return edits;
}

/**
 * The single entry point `markdownIndentKeymap.ts` calls after computing
 * Phase A's own per-line whitespace edits — returns the additional
 * `RenumberEdit[]` (empty when nothing needs normalizing, the common
 * case for every non-list line and every list line whose membership
 * didn't change) to append to the same `changes` array before one
 * `state.changes([...phaseAChanges, ...normalizeEdits])` / one dispatch,
 * matching the atomic-transaction guarantee every other list-editing fix
 * in this codebase already provides.
 *
 * `phaseAChanges` is treated as opaque `{from,to,insert}` data — never
 * re-derived, never used for anything except (a) building the provisional
 * state to reparse, and (b) locating which physical lines were touched.
 */
export function planOrderedListNormalization(
  state: EditorState,
  phaseAChanges: readonly ChangeSpec[]
): RenumberEdit[] {
  const candidates = collectOrderedListCandidates(state, phaseAChanges);
  if (candidates.length === 0) {
    return [];
  }

  const phaseAChangeSet = state.changes(phaseAChanges as ChangeSpec[]);
  const provisional = state.update({ changes: phaseAChangeSet }).state;
  ensureSyntaxTree(provisional, provisional.doc.length, 5000);

  const moved = findMovedItems(provisional, phaseAChangeSet, candidates);
  if (moved.length === 0) {
    return [];
  }

  const bySourceList = groupBy(moved, (m) => m.candidate.originalOrderedList.from);
  const byDestinationList = groupBy(moved, (m) => m.newOrderedList.from);

  // Isolated-relocation guard (see `listHasOtherMembers`'s own doc
  // comment): if every source list a group of items left, and every
  // destination list they joined, contains nothing but the touched items
  // themselves, this is a closed set relocating with zero external
  // context — never a genuine departure or join — and must be left
  // completely untouched.
  const anySourceHasOtherMembers = Array.from(bySourceList.values()).some((group) =>
    listHasOtherMembers(
      group[0]!.candidate.originalOrderedList,
      new Set(group.map((m) => m.candidate.originalMarkerFrom))
    )
  );
  const anyDestinationHasOtherMembers = Array.from(byDestinationList.values()).some((group) =>
    listHasOtherMembers(
      group[0]!.newOrderedList,
      new Set(group.map((m) => m.provisionalMarkerFrom))
    )
  );
  if (!anySourceHasOtherMembers && !anyDestinationHasOtherMembers) {
    return [];
  }

  const inverted = phaseAChangeSet.invert(state.doc);
  const edits: RenumberEdit[] = [];

  // Source-side: for every distinct original OrderedList that lost one or
  // more (now-departed) members, close the numbering gap they left behind
  // — reusing `renumberSequentialTail` completely unmodified, anchored at
  // the last departed item in that list's own original sibling order.
  for (const group of bySourceList.values()) {
    const departedItems = group.map((m) => m.candidate.originalListItem);
    const lastDeparted = departedItems[departedItems.length - 1]!;
    edits.push(...renumberSequentialTail(state, lastDeparted, -departedItems.length));
  }

  // Destination-side: for every distinct new OrderedList that gained one
  // or more members, plan its own numbering (new-list-starts-at-1 and
  // join-an-existing-list are the same algorithm — see
  // `planDestinationRenumbering`'s own doc comment).
  for (const group of byDestinationList.values()) {
    const destinationList = group[0]!.newOrderedList;
    const joinedMarkerFroms = new Set(group.map((m) => m.provisionalMarkerFrom));
    edits.push(...planDestinationRenumbering(provisional, inverted, destinationList, joinedMarkerFroms));
  }

  return edits;
}
