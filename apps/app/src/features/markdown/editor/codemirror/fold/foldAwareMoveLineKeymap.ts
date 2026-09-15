import { foldEffect } from '@codemirror/language';
import { EditorSelection, type ChangeSpec, type EditorState } from '@codemirror/state';
import type { Command, KeyBinding } from '@codemirror/view';

import { findFold } from './foldSemantics';
import { imageUiStateField, setImageUiState, type ImageUiState } from '../image/imageUiState';

/**
 * Fold-preserving replacement for `@codemirror/commands`' own
 * `moveLineUp`/`moveLineDown` (`Alt-ArrowUp`/`Alt-ArrowDown`,
 * `Option-ArrowUp`/`Option-ArrowDown` on macOS) — bound at higher keymap
 * precedence than `defaultKeymap` (`createEditorView.ts`), the same
 * pattern `foldAwareArrowKeymap.ts` already establishes for
 * ArrowLeft/ArrowRight.
 *
 * **Root cause, confirmed by dispatching the real transaction, not
 * theorized**: `@codemirror/commands`' `moveLine()` swaps the current
 * line block with the single adjacent *physical* line by deleting that
 * line's raw text and re-inserting an identical copy of it on the other
 * side of the moved block — two independent `ChangeSpec` entries, not a
 * position-preserving move primitive. For `Parent\n    hidden child\n
 * Current line` with `hidden child` folded (fold range `{from: 6, to:
 * 23}`, i.e. the span from the end of `Parent`'s own line through the
 * end of `hidden child`'s line) and the cursor on `Current line`,
 * pressing Alt-Up swaps `Current line` with `hidden child` — the
 * *physically* adjacent line, not `Parent` — because `moveLine` has no
 * concept of folded content at all, only physical line numbers. The
 * fold's own range, mapped through that delete/reinsert `ChangeSet` via
 * `RangeSet.map` (`foldState`'s own, completely unmodified, mechanism),
 * collapses to `{from: 6, to: 7}` — the one surviving character
 * (`Parent`'s own trailing newline) outside the deleted span — because a
 * `RangeSet` can only preserve a range through content that survives
 * unmoved; content that is deleted and independently re-inserted
 * elsewhere has no identity for `RangeSet.map` to track, even though the
 * reinserted text is byte-identical to what was deleted. Confirmed via a
 * real `EditorView`/`moveLineUp` dispatch: `before.folds = [{from:6,
 * to:23}]`, `after.folds = [{from:6, to:7}]`, `after.doc = "Parent\n
 * Current line\n    hidden child"` — the fold isn't cleanly removed, it's
 * corrupted into a 1-character, functionally meaningless residual range,
 * while `hidden child` reappears fully visible in its new position with
 * no fold at all.
 *
 * **This is not a `foldState`/`RangeSet.map` bug to fix** — `RangeSet.map`
 * is behaving exactly as documented (it maps *positions*, and a
 * delete-then-independently-reinsert transaction genuinely has no
 * traceable position identity between the old and new text, regardless
 * of content equality). The fix is at the *command* level: when the
 * physically-adjacent line is fold-hidden (or is itself a fold's own
 * owner line whose fold reaches further), the correct *unit* to swap
 * with the moving block is the *entire* folded span — owner line through
 * the fold's own `to` — moved as one contiguous, unmodified span of text,
 * with the fold re-applied at its new position in the *same* transaction
 * (computed by plain arithmetic against the `ChangeSpec` this command
 * itself constructs, not via `ChangeSet.mapPos` — mapping through a
 * transaction that deletes-and-reinserts the same content has the
 * identical "no traceable identity" problem the bug itself has; this
 * command knows the exact shape of its own edit, so it computes the new
 * position directly instead).
 *
 * **Deliberately narrow, declining (returning `false`, falling through to
 * native `moveLineUp`/`moveLineDown`) for every case that isn't a genuine
 * fold-adjacency (or, see below, an embed-UI-state adjacency)** — same
 * discipline `foldAwareArrowKeymap.ts` already established: multiple
 * selection ranges, no fold/embed-state adjacent to the move, or the
 * document boundary. Native behavior for every other case (the
 * overwhelming majority of line moves, which never touch either) is
 * completely unaffected.
 *
 * **A second, independent state to preserve: a note embed's own outer
 * collapse (`image/imageUiState.ts`'s `ImageUiState.collapsed`, live in
 * `imageUiStateField`).** Confirmed live (not just for `foldState`): a
 * collapsed `![[Page]]` card, moved past via `Alt-ArrowUp`, came back
 * *expanded*. Root cause is the exact same `RangeSet.map`-through-
 * delete/reinsert identity loss this file's own top comment documents for
 * `foldState` — `imageUiStateField`'s own `update()` maps its `RangeSet`
 * through `tr.changes` the identical way — made worse by that field's own
 * "freshly created" detection block: once the old entry is lost, the
 * reinserted embed text looks exactly like a brand-new occurrence with no
 * prior state, so it gets reset to `DEFAULT_IMAGE_UI_STATE` (`collapsed:
 * false`) rather than merely losing its entry silently.
 *
 * **`ImageUiState.collapsed` is deliberately kept a wholly separate
 * mechanism from `foldState` — this file coordinates preserving both
 * without merging them.** `ownFold`/`neighborFold` (CM6 folds) and
 * `blockEmbeds`/`neighborEmbeds` (embed UI state, below) are captured and
 * reapplied independently, via each mechanism's own effect type
 * (`foldEffect` vs. `setImageUiState`) and each mechanism's own read API
 * (`findFold` vs. a direct `imageUiStateField` `RangeSet` query) — the
 * only thing shared is this command's own capture → build transaction →
 * recompute new positions → reapply pattern, not the state itself. Unlike
 * a fold, an embed's own live state never changes what the *moving unit*
 * is (an embed occupies exactly its own line, never hides adjacent
 * content the way a fold does), so it needs no `block`/`neighbor`
 * boundary-widening step of its own — only capture-before/restore-after,
 * riding along within whatever boundaries the fold logic already decided.
 * This is also what makes "the embed itself is the line being moved" fall
 * out for free: it's just another entry inside `block`, captured into
 * `blockEmbeds` and restored at `block`'s own new position, with no
 * special case analogous to `ownFold`'s needed.
 */

interface LineBlock {
  readonly from: number;
  readonly to: number;
}

function lineBlockOf(text: { lineAt(pos: number): { from: number; to: number } }, from: number, to: number): LineBlock {
  return { from: text.lineAt(from).from, to: text.lineAt(to).to };
}

interface CapturedEmbedState {
  readonly relFrom: number;
  readonly relTo: number;
  readonly state: ImageUiState;
}

/**
 * Every `imageUiStateField` entry *fully contained* in `[blockFrom,
 * blockTo)`, captured as an offset relative to `blockFrom` — not absolute
 * positions, since those positions are about to be invalidated by the
 * very transaction this command is building (see this file's own top
 * comment for why `ChangeSet.mapPos` can't be used to carry them across
 * instead). A partially-overlapping entry (which shouldn't occur in
 * practice — an embed occupies exactly one physical line, and `blockFrom`/
 * `blockTo` are always whole-line boundaries) is deliberately excluded
 * rather than guessed at.
 */
function captureEmbedUiState(state: EditorState, blockFrom: number, blockTo: number): readonly CapturedEmbedState[] {
  const field = state.field(imageUiStateField, false);
  if (!field) {
    return [];
  }
  const captured: CapturedEmbedState[] = [];
  field.between(blockFrom, blockTo, (from, to, value) => {
    if (from < blockFrom || to > blockTo) {
      return;
    }
    captured.push({ relFrom: from - blockFrom, relTo: to - blockFrom, state: value.state });
  });
  return captured;
}

function moveFoldAware(forward: boolean): Command {
  return (view) => {
    const { state } = view;
    if (state.readOnly || state.selection.ranges.length !== 1) {
      return false;
    }

    const range = state.selection.main;
    let block = lineBlockOf(state.doc, range.from, range.to);

    // If the block being moved is *itself* a fold's own owner (the cursor
    // sits on, say, a folded heading's own line), the folded content
    // belongs to it and must move as one unit *with* it, in either
    // direction — otherwise moving just the visible owner line would
    // separate it from its own hidden content one line at a time,
    // corrupting the fold exactly the way the adjacent-fold case does.
    // A fold's own `from` always sits exactly at its owner line's `.to`
    // (this codebase's own convention, native and custom alike), so a
    // zero-width query right at `block.to` finds it.
    const ownFold = findFold(state, block.to, block.to);
    if (ownFold && ownFold.from === block.to) {
      block = { from: block.from, to: state.doc.lineAt(Math.min(ownFold.to, state.doc.length)).to };
    }

    if (forward ? block.to === state.doc.length : block.from === 0) {
      return false;
    }

    // The physically-adjacent line in the move direction — the same line
    // native `moveLine` would swap with, blind to fold state.
    const adjacentLine = state.doc.lineAt(forward ? block.to + 1 : block.from - 1);

    // Does a fold cover (or start at) this adjacent line? A fold's own
    // `from` sits at its owner line's own `.to` (every fold-range source
    // in this codebase — native heading/fence folding and
    // `foldSemantics.ts`'s own list/paragraph algorithms — uses this
    // shape), so querying at the adjacent line's own `[from, to]` finds
    // both "this line is hidden content" and "this line is the fold's
    // own owner, whose fold reaches beyond it."
    const neighborFold = findFold(state, adjacentLine.from, adjacentLine.to);

    const neighbor: LineBlock = neighborFold
      ? forward
        ? { from: adjacentLine.from, to: state.doc.lineAt(Math.min(neighborFold.to, state.doc.length)).to }
        : { from: state.doc.lineAt(neighborFold.from).from, to: state.doc.lineAt(Math.min(neighborFold.to, state.doc.length)).to }
      : { from: adjacentLine.from, to: adjacentLine.to };

    // Every embed's own outer-collapse (or any other non-default
    // ImageUiState) entry fully inside `block`/`neighbor`, captured now —
    // before either span is touched by a transaction — so it can be
    // restored at its own recomputed position below. See this file's own
    // top comment for why this rides along inside whatever boundaries the
    // fold logic above already decided, rather than widening them itself.
    const blockEmbeds = captureEmbedUiState(state, block.from, block.to);
    const neighborEmbeds = captureEmbedUiState(state, neighbor.from, neighbor.to);

    // Nothing fold- or embed-state-related on either side — an ordinary
    // move with no state to preserve anywhere near it. Decline; native
    // `moveLineUp`/`moveLineDown` handles this identically to today,
    // unmodified.
    if (!ownFold && !neighborFold && blockEmbeds.length === 0 && neighborEmbeds.length === 0) {
      return false;
    }

    // Guard against a pathological overlap (shouldn't occur given the
    // adjacency check above, but never construct a transaction against
    // an inverted or overlapping pair of blocks).
    if (forward ? neighbor.from <= block.to : neighbor.to >= block.from) {
      return false;
    }

    const neighborText = state.sliceDoc(neighbor.from, neighbor.to);
    const blockSize = block.to - block.from;
    const neighborSize = neighbor.to - neighbor.from;

    let changes: ChangeSpec;
    let newBlockFrom: number;
    let newNeighborFrom: number;
    if (forward) {
      // Moving DOWN: block relocates below neighbor. Delete neighbor's
      // old text (plus its own trailing linebreak up to block's own
      // start-side); reinsert it, verbatim, immediately before the
      // block's own new position.
      changes = [
        { from: block.to, to: neighbor.to },
        { from: block.from, insert: neighborText + state.lineBreak },
      ];
      newNeighborFrom = block.from;
      newBlockFrom = block.from + neighborSize + 1;
    } else {
      // Moving UP: block relocates above neighbor.
      changes = [
        { from: neighbor.from, to: block.from },
        { from: block.to, insert: state.lineBreak + neighborText },
      ];
      newBlockFrom = neighbor.from;
      newNeighborFrom = neighbor.from + blockSize + 1;
    }

    // Selection follows the moved block, shifted by the same amount
    // `moveLine` itself shifts it — `range` was inside `block`'s
    // *original* line (still true even when `block` was expanded to
    // include an owned fold, since the expansion only ever extends
    // `block.to`, never moves `block.from` past `range`'s own position),
    // and `block`'s own new start is `newBlockFrom`.
    const selectionShift = newBlockFrom - block.from;
    const newSelection = EditorSelection.range(range.anchor + selectionShift, range.head + selectionShift);

    const effects = [];
    // `block` itself may own a fold (the "moving the folded block itself"
    // case — see `ownFold`, above) — it moves verbatim together with the
    // rest of `block`, so its own relative offset within `block` is
    // unchanged; only its absolute position shifts by `selectionShift`,
    // the same amount everything else inside `block` shifts by.
    if (ownFold) {
      effects.push(foldEffect.of({ from: ownFold.from + selectionShift, to: ownFold.to + selectionShift }));
    }
    // The neighbor's own fold (if any), translated by the same offset the
    // whole neighbor span moved by — computed directly from the
    // transaction this command itself constructed (see this file's own
    // top doc comment for why `ChangeSet.mapPos` can't be used here
    // instead: mapping a position through a transaction that deletes and
    // independently reinserts the very content being tracked has no
    // traceable identity to follow, the identical problem this whole file
    // exists to work around).
    if (neighborFold) {
      const relativeFrom = neighborFold.from - neighbor.from;
      const relativeTo = neighborFold.to - neighbor.from;
      effects.push(foldEffect.of({ from: newNeighborFrom + relativeFrom, to: newNeighborFrom + relativeTo }));
    }
    // Embed UI state (outer collapse, and anything else the field tracks)
    // captured above, restored at each entry's own recomputed position —
    // independent of, and via a completely different effect type than,
    // the fold restoration immediately above. `newBlockFrom`/
    // `newNeighborFrom` + each entry's own `relFrom`/`relTo` gives the
    // exact post-change position the embed's own text now occupies (the
    // same "new base + relative offset" shape `neighborFold` uses above),
    // computed by the same plain arithmetic against this command's own
    // transaction — never `ChangeSet.mapPos`, for the identical reason
    // given in this file's own top comment.
    for (const embed of blockEmbeds) {
      effects.push(setImageUiState.of({ pos: newBlockFrom + embed.relFrom, to: newBlockFrom + embed.relTo, state: embed.state }));
    }
    for (const embed of neighborEmbeds) {
      effects.push(setImageUiState.of({ pos: newNeighborFrom + embed.relFrom, to: newNeighborFrom + embed.relTo, state: embed.state }));
    }

    view.dispatch(
      state.update({
        changes,
        selection: newSelection,
        effects,
        scrollIntoView: true,
        userEvent: 'move.line',
      })
    );
    return true;
  };
}

const foldAwareMoveLineUp = moveFoldAware(false);
const foldAwareMoveLineDown = moveFoldAware(true);

export const foldAwareMoveLineKeymap: readonly KeyBinding[] = [
  { key: 'Alt-ArrowUp', run: foldAwareMoveLineUp },
  { key: 'Alt-ArrowDown', run: foldAwareMoveLineDown },
];
