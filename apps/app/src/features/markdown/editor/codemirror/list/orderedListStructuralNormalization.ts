import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState, type ChangeSet, type Extension } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { markdownLanguageExtension } from '../markdownLanguage';
import {
  findMovedItems,
  groupBy,
  listHasOtherMembers,
  planDestinationRenumbering,
  type OrderedListCandidate,
} from './orderedListTabNormalization';
import { renumberSequentialTail, type RenumberEdit } from './orderedListRenumbering';

/**
 * The transaction-level counterpart to Tab/Shift-Tab's own
 * `orderedListTabNormalization.ts` and Space's own
 * `orderedListMarkerCreation.ts` — the locked product rule
 * (2026-08-30/31 design rounds) is *"whenever an edit causes an
 * `OrderedList`'s structural membership to change, the affected items
 * renumber accordingly"*, stated generally, not *"whenever Tab/Space does
 * it."* Real Enter/Backspace/Delete/selection-delete presses routinely
 * create or remove list-membership boundaries (`docs/durability-model.md`
 * is unrelated; see this module's own investigation reports —
 * `LOCKED_RULES_AUDIT.md`, `BLANK_LINE_BOUNDARY_REPORT.md`,
 * `FINAL_GATE_REPORT.md`, `CHAINING_CLOSED_REPORT.md` — for the full
 * evidence trail) via CM6's own *generic*, Markdown-unaware fallback
 * commands (`insertNewlineAndIndent`, `deleteCharBackward`) whenever this
 * codebase's own Markdown-aware Enter/Backspace commands decline for
 * reasons unrelated to list editing — so no single keymap command is ever
 * the right place to detect this. `EditorState.transactionFilter` is the
 * one CM6 mechanism that sees *every* document-changing transaction
 * regardless of which command (or none) produced it, confirmed (this
 * module's own investigation) to compose safely: a filter's own returned
 * transaction/spec is resolved once, with re-filtering disabled
 * (`resolveTransaction(state, asArray(filtered), false)` — confirmed
 * against the installed `@codemirror/state` source), so this filter can
 * never trigger itself in an infinite loop from its *own* output.
 *
 * **What is, and is not, reused**: the actual numbering business logic —
 * baseline computation, sequential-tail shifting, digit-width risk
 * gating — is 100% `orderedListRenumbering.ts` and
 * `orderedListTabNormalization.ts`'s own `planDestinationRenumbering`
 * (now parameterized by a coordinate mapper so both Tab and this module
 * share the identical implementation; see that function's own doc
 * comment for exactly what changed and why), `findMovedItems`,
 * `listHasOtherMembers`, and `groupBy` — all imported, not reimplemented.
 * The only genuinely new code in this module is **candidate-list
 * discovery**: unlike Tab (which always knows exactly which physical
 * lines it touched) or Space (which always knows it's creating a brand-
 * new marker), a transaction-level filter has no such privileged
 * knowledge of "which lines changed structurally" — it must derive
 * candidate `OrderedList`s purely from the edited ranges' *tree
 * positions*, which is what `nearestOrderedListStructural` and
 * `enclosingOrderedLists` below do.
 *
 * **No hidden state**: every fact this module uses is derived fresh, per
 * transaction, from `tr.startState`'s own tree, `tr.changes`, and one
 * throwaway provisional `EditorState` built for that single transaction
 * and discarded immediately after — nothing is cached, remembered, or
 * tracked across transactions. In particular, this module never asks "did
 * this list used to be numbered N" — only "does this item's own
 * `OrderedList` **parent node identity** differ between the original tree
 * and the post-transaction tree," the same structural-only test every
 * other numbering primitive in this codebase already uses.
 */

// --- candidate-list discovery (new; everything else below is reused) ---

/**
 * Walks outward from `pos` toward `direction`, through zero or more
 * `Paragraph` siblings (the loose-list / lazy-continuation absorption
 * boundary CommonMark itself defines — a blank line between two
 * same-delimiter list items, with no other block between them, never
 * splits the list), looking for the nearest `OrderedList` — the *merge*
 * shape, where structural membership crosses a gap that may include one
 * or more genuinely blank-line-separated paragraphs.
 *
 * Both resolver biases (`-1`/`+1`) are tried: a position sitting exactly
 * in a top-level inter-block gap resolves to the `Document` root itself
 * (`parent: null`) under one bias and to a real neighboring block under
 * the other — confirmed directly across three separate investigation
 * rounds (2026-08-30/31), and confirmed unmodified/correct at 0/4/8/12-
 * space nesting. **No fixed hop count anywhere**: both loops terminate on
 * tree-structural properties alone (the first non-`Paragraph` sibling
 * encountered; `node.parent === null`, the document root reached via the
 * ancestor walk), never an iteration counter — CommonMark itself never
 * produces two adjacent bare `Paragraph` siblings (consecutive plain-text
 * lines with no blank line between them always merge into one `Paragraph`
 * node), so a chain of multiple `Paragraph`s can only occur when they are
 * genuinely blank-line-separated, and the walk correctly keeps going
 * through as many as actually exist.
 */
export function nearestOrderedListStructural(
  state: EditorState,
  pos: number,
  direction: -1 | 1
): SyntaxNode | null {
  for (const bias of [-1, 1] as const) {
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, bias);
    for (; node; node = node.parent) {
      let sib: SyntaxNode | null = direction === 1 ? node.nextSibling : node.prevSibling;
      if (!sib) {
        // `resolveInner` at a position sitting in the gap *between two of
        // a container's own children* resolves directly to that
        // container itself (`node`), not to either neighboring child —
        // confirmed true not only at the true document root
        // (`node.parent === null`, the case this fallback originally,
        // narrowly handled) but at *any* nesting depth: a gap between a
        // nested `OrderedList` and a following `Paragraph`, both
        // children of the same enclosing `ListItem`, resolves to that
        // `ListItem` exactly the same way. Restricting this fallback to
        // `!node.parent` (2026-08-31 initial nested-regression) silently
        // returned `null` for every such nested gap — `node.nextSibling`
        // is empty (the container itself may have no siblings of its
        // own), and the walk simply climbed past the correct answer
        // without ever trying `childAfter`/`childBefore` on `node`
        // itself. Removing the `!node.parent` restriction — always
        // trying `childAfter`/`childBefore` on `node` whenever it has no
        // direct sibling of its own — fixes this at every depth
        // uniformly, confirmed against 4/8/12-space nesting.
        sib = direction === 1 ? node.childAfter(pos) : node.childBefore(pos);
      }
      while (sib) {
        if (sib.name === 'OrderedList') return sib;
        if (sib.name !== 'Paragraph') break;
        sib = direction === 1 ? sib.nextSibling : sib.prevSibling;
      }
    }
  }
  return null;
}

/**
 * Every `OrderedList` directly enclosing `pos` — the *split* shape, where
 * the edit sits inside an already-existing `ListItem`'s own
 * lazy-continuation content, and the relevant list is the one already
 * enclosing it, not something reachable by walking outward.
 *
 * Deliberately a **separate, unconditional** check from
 * `nearestOrderedListStructural` above, run independently rather than
 * folded into the same ancestor loop as an early return: an
 * early-return-on-enclosing-parent tried inside the directional walk was
 * confirmed (2026-08-30 investigation) to break every merge case, because
 * it would fire at the very first ancestor level — correctly finding the
 * item's own *current*, pre-edit list — and return before the directional
 * walk got a chance to look further outward for the genuinely more
 * distant, post-edit destination list. Keeping the two checks separate
 * and additive (both always run; neither short-circuits the other) is
 * what makes both the split and merge shapes detectable in the same pass.
 */
export function enclosingOrderedLists(state: EditorState, pos: number): SyntaxNode[] {
  const found: SyntaxNode[] = [];
  const seen = new Set<number>();
  for (const bias of [-1, 1] as const) {
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, bias);
    for (; node; node = node.parent) {
      if (node.parent && node.parent.name === 'OrderedList' && !seen.has(node.parent.from)) {
        seen.add(node.parent.from);
        found.push(node.parent);
      }
    }
  }
  return found;
}

/** Every direct `ListItem` child of `orderedList`, as an `OrderedListCandidate` — the shared shape `findMovedItems` (imported from Tab's own module) already knows how to consume. */
function candidatesFromList(orderedList: SyntaxNode): OrderedListCandidate[] {
  const candidates: OrderedListCandidate[] = [];
  for (let child: SyntaxNode | null = orderedList.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'ListItem') continue;
    const marker = child.firstChild;
    if (!marker || marker.name !== 'ListMark') continue;
    candidates.push({ originalMarkerFrom: marker.from, originalListItem: child, originalOrderedList: orderedList });
  }
  return candidates;
}

/**
 * Every `OrderedListCandidate` reachable from any edited boundary in
 * `changes`, via both discovery functions above, deduplicated by marker
 * position and sorted by document order (matching Tab's own
 * `collectOrderedListCandidates` ordering guarantee, for the same reason:
 * later grouping must reflect true document order regardless of how
 * multiple edited ranges were iterated).
 */
function collectStructuralCandidates(state: EditorState, changes: ChangeSet): OrderedListCandidate[] {
  const lists = new Map<number, SyntaxNode>();

  changes.iterChanges((fromA, toA) => {
    for (const pos of fromA === toA ? [fromA] : [fromA, toA]) {
      for (const direction of [-1, 1] as const) {
        const found = nearestOrderedListStructural(state, pos, direction);
        if (found) lists.set(found.from, found);
      }
      for (const enclosing of enclosingOrderedLists(state, pos)) {
        lists.set(enclosing.from, enclosing);
      }
    }
  });

  const seenMarkers = new Set<number>();
  const candidates: OrderedListCandidate[] = [];
  for (const list of lists.values()) {
    for (const candidate of candidatesFromList(list)) {
      if (seenMarkers.has(candidate.originalMarkerFrom)) continue;
      seenMarkers.add(candidate.originalMarkerFrom);
      candidates.push(candidate);
    }
  }
  return candidates.sort((a, b) => a.originalMarkerFrom - b.originalMarkerFrom);
}

/**
 * The additional `RenumberEdit[]` (empty when nothing needs normalizing —
 * the overwhelming common case for every non-list edit and every list
 * edit whose membership didn't change) needed to keep every `OrderedList`
 * a transaction structurally affects internally consistent, expressed in
 * **provisional** (post-transaction) coordinates throughout — this
 * module's own `orderedListStructuralNormalization()` filter composes
 * them as a `sequential: true` follow-up spec, applied *after* the
 * triggering transaction's own changes, specifically so that transaction
 * keeps its own, already-correctly-computed `selection`/`effects`
 * completely untouched (see that function's own doc comment).
 *
 * Both the source-side gap-closing edits (`renumberSequentialTail`,
 * computed against `state`'s original tree, then mapped forward through
 * `changes` into provisional coordinates) and the destination-side
 * renumbering edits (`planDestinationRenumbering`, called with the
 * identity mapper since it already walks the provisional tree directly)
 * end up in the *same* coordinate space, so both can be combined into one
 * flat, non-overlapping edit list — the source-side edits only ever touch
 * items that *stayed behind* in an original list (never a moved item
 * itself), and the destination-side edits only ever touch moved items or
 * a destination's own remaining tail, so the two sets can never target
 * the same digit run.
 */
export function planStructuralOrderedListNormalization(state: EditorState, changes: ChangeSet): RenumberEdit[] {
  const candidates = collectStructuralCandidates(state, changes);
  if (candidates.length === 0) {
    return [];
  }

  // A throwaway `EditorState` built from *only* the Markdown grammar —
  // deliberately not `state.update({changes}).state`, which would carry
  // `state`'s *full* extension config, including this very module's own
  // `transactionFilter`: `EditorState.update()` runs registered filters
  // exactly like `dispatch()` does (`resolveTransaction(state, specs,
  // true)` — confirmed directly against the installed `@codemirror/state`
  // source, and confirmed to recurse into a filter's *own* body when that
  // body itself calls `.update()` — `list/listMarkerDecoration.ts`'s
  // `listMarkerCaretAssoc()` relies on, and self-terminates, exactly this
  // same recursive behavior). Building this purely-for-reading provisional
  // tree through the full state would recursively re-invoke this filter
  // on a transaction this function never intends to dispatch, corrupting
  // the positions computed next. This tree is only ever read
  // (`listItemLiteralNumber`, `listItemWithMarkerAt`,
  // `isRiskyRenumberRewrite` — all via the imported, reused functions),
  // never itself dispatched, so it only ever needs the same parser every
  // other consumer of Markdown syntax in this codebase shares
  // (`markdownLanguageExtension()`) — not history, not keymaps, not this
  // or any other transaction-level extension.
  const provisional = EditorState.create({
    doc: changes.apply(state.doc),
    extensions: [markdownLanguageExtension()],
  });
  ensureSyntaxTree(provisional, provisional.doc.length, 5000);

  const moved = findMovedItems(provisional, changes, candidates);
  if (moved.length === 0) {
    return [];
  }

  const bySourceList = groupBy(moved, (m) => m.candidate.originalOrderedList.from);
  const byDestinationList = groupBy(moved, (m) => m.newOrderedList.from);

  // Isolated-relocation guard (see `listHasOtherMembers`'s own doc
  // comment, imported from Tab's module — completely unmodified): if
  // every source list a group of items left, and every destination list
  // they joined, contains nothing but the touched items themselves, this
  // is a closed set relocating with zero external context — never a
  // genuine departure or join — and must be left completely untouched.
  // This is also exactly the guard requirement B (a single original
  // `OrderedList` that is only *partially* affected — some members leave
  // while others remain) depends on: a source group whose list *does*
  // still have other members is not suppressed by this check, so its own
  // gap-closing edit below still runs.
  const anySourceHasOtherMembers = Array.from(bySourceList.values()).some((group) =>
    listHasOtherMembers(
      group[0]!.candidate.originalOrderedList,
      new Set(group.map((m) => m.candidate.originalMarkerFrom))
    )
  );
  const anyDestinationHasOtherMembers = Array.from(byDestinationList.values()).some((group) =>
    listHasOtherMembers(group[0]!.newOrderedList, new Set(group.map((m) => m.provisionalMarkerFrom)))
  );
  if (!anySourceHasOtherMembers && !anyDestinationHasOtherMembers) {
    return [];
  }

  const edits: RenumberEdit[] = [];

  // Source-side: for every distinct original OrderedList that lost one or
  // more (now-departed) members but still has other members remaining,
  // close the numbering gap they left behind — reusing
  // `renumberSequentialTail` completely unmodified, anchored at the last
  // departed item in that list's own original sibling order. Computed
  // against `state` (original coordinates), then mapped forward through
  // `changes` into the shared provisional coordinate space this module's
  // filter composes everything in.
  for (const group of bySourceList.values()) {
    const departedItems = group.map((m) => m.candidate.originalListItem);
    const lastDeparted = departedItems[departedItems.length - 1]!;
    for (const edit of renumberSequentialTail(state, lastDeparted, -departedItems.length)) {
      edits.push({
        from: changes.mapPos(edit.from, 1),
        to: changes.mapPos(edit.to, 1),
        insert: edit.insert,
      });
    }
  }

  // Destination-side: for every distinct new OrderedList that gained one
  // or more members, plan its own numbering — reusing
  // `planDestinationRenumbering` (imported from Tab's own module)
  // completely unmodified in its business logic; only its coordinate
  // mapper differs from Tab's own call site (identity here, since this
  // walk already happens directly against `provisional`). Multiple joins
  // into the *same* destination list are inherently sequenced correctly
  // by this single left-to-right walk — proven (`CHAINING_CLOSED_REPORT.md`)
  // to require no separate feed-forward bookkeeping.
  for (const group of byDestinationList.values()) {
    const destinationList = group[0]!.newOrderedList;
    const joinedMarkerFroms = new Set(group.map((m) => m.provisionalMarkerFrom));
    edits.push(
      ...planDestinationRenumbering(provisional, (from, to) => ({ from, to }), destinationList, joinedMarkerFroms)
    );
  }

  return edits;
}

/**
 * The single production entry point — one `EditorState.transactionFilter`
 * registration, wired alongside `markdownLanguageExtension()`,
 * `markdownEnterKeymap()`, and `markdownIndentKeymap()` in
 * `MarkdownEditor.tsx`'s own extension list.
 *
 * Returns `tr` itself, completely untouched, for every transaction with
 * nothing to normalize (`tr.docChanged` false, or
 * `planStructuralOrderedListNormalization` finds no candidates) — the
 * overwhelming majority of keystrokes, matching the same cheap-early-exit
 * shape every other Markdown-editing extension in this codebase already
 * follows.
 *
 * When there *is* something to normalize, returns `[tr, {changes: edits,
 * sequential: true}]` — `tr` unchanged as the first element (so the
 * triggering command's own already-computed `selection`/`effects`/
 * `userEvent`/`scrollIntoView` are preserved verbatim, not recomputed),
 * plus a second, `sequential: true` spec carrying *only* the additional
 * renumbering edits, applied against the document `tr`'s own changes
 * already produced. CM6 resolves a filter's own returned array by
 * composing every element into **one** transaction (confirmed via the
 * installed `@codemirror/state` source: `mergeTransaction` folds
 * multi-element filter output together before it ever reaches history),
 * so this is still exactly one logical undo/redo step, never two.
 */
export function orderedListStructuralNormalization(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) {
      return tr;
    }
    const edits = planStructuralOrderedListNormalization(tr.startState, tr.changes);
    if (edits.length === 0) {
      return tr;
    }
    return [tr, { changes: edits, sequential: true }];
  });
}
