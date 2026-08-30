import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

/**
 * One `{from, to, insert}` digit-run rewrite, in whatever document's
 * coordinates the caller is currently working in. Deliberately the same
 * shape CM6's own `ChangeSpec` uses (a plain object, not a class) so
 * every call site can pass these straight into `state.changes([...])`
 * alongside any other edit, exactly as already done throughout this
 * codebase's list-editing commands.
 */
export interface RenumberEdit {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

/**
 * `renumberList`'s own tolerance for a digit-width change on a multi-line
 * item, before its descendant content's indentation falls out of
 * alignment — confirmed empirically (a programmatic sweep of zero-padded
 * markers shrinking `9.`/`10.`-style pairs at every content-column width
 * from 4 through 9) and consistent with the general nesting-tolerance
 * window a physical line's content stays inside a list item's own nested
 * block for any indentation from that item's content column up to *3
 * columns past it*, falling into CommonMark's Rule #5 laziness (silently
 * absorbed as plain continuation text) beyond that. `3` here is that same
 * constant, not a new one.
 *
 * Originally derived and shipped in `markdownEnterKeymap.ts`
 * (docs/list-item-architecture-odr.md §15); moved to this neutral module
 * so Tab/Shift-Tab's own numbering normalizer can reuse the identical
 * rule without making the Enter module the owner of functionality now
 * shared by Tab, Backspace, and Enter alike.
 */
export const MAX_SAFE_SHRINK_COLUMNS = 3;

/**
 * True when `[from, to)` is exactly the digit run of some `ListMark` in
 * `state`'s own tree, that `ListMark`'s own `ListItem` spans more than
 * one physical line (i.e. genuinely owns descendant content — a nested
 * list, a multi-line paragraph — whose own leading whitespace was
 * calibrated to this item's *current* content column, not a re-derived
 * one; a single-line item has nothing that could fall out of alignment
 * regardless of width), **and** the specific width change is not provably
 * safe.
 *
 * `insertedLength` is deliberately compared against the digit run's own
 * `to - from` rather than re-deriving "old width" a second way, so a
 * caller passing mismatched values can't silently disagree with what
 * this function is actually checking.
 *
 * **Growth** (`insertedLength > oldWidth`, e.g. `9`→`10`): always risky
 * for a multi-line item. A newly-widened item's content column only ever
 * *increases*, and a descendant authored at exactly the old column (the
 * common case) has zero margin: even a 1-column growth drops it below the
 * new column.
 *
 * **Shrink** (`insertedLength < oldWidth`, e.g. `10`→`9`, or a
 * zero-padded `"0010."`→`"9."`): risky only when the shrink's own
 * magnitude exceeds `MAX_SAFE_SHRINK_COLUMNS`.
 *
 * Callers: Enter's `continueMarkupPreservingStructure` (guards upstream
 * `renumberList`'s own rewrite), Backspace's `renumberSequentialTail`
 * (below, shared with the empty-item and whole-item-selection deletion
 * cases), and Tab/Shift-Tab's ordered-list membership-change normalizer
 * (`orderedListTabNormalization.ts`) — every site that ever writes a new
 * literal number into a `ListMark`'s digit run must gate that write
 * through this function first, regardless of which command triggered it.
 */
export function isRiskyRenumberRewrite(
  state: EditorState,
  from: number,
  to: number,
  insertedLength: number
): boolean {
  let risky = false;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (risky || node.name !== 'ListItem') {
        return;
      }
      const marker = node.node.firstChild;
      if (!marker || marker.name !== 'ListMark') {
        return;
      }
      if (marker.from !== from || marker.to - 1 !== to) {
        return;
      }
      const multiLine = state.doc.lineAt(node.to).number > state.doc.lineAt(node.from).number;
      if (!multiLine) {
        return;
      }
      const oldWidth = to - from;
      const delta = insertedLength - oldWidth;
      risky = delta > 0 || -delta > MAX_SAFE_SHRINK_COLUMNS;
    },
  });
  return risky;
}

/**
 * The digit-run rewrites needed to keep an already-sequential run of
 * `ListItem` siblings consistent after `anchor`'s own membership in that
 * run changed — `shift` items were removed after it (Backspace/Delete
 * deleting one or more items, or Tab/Shift-Tab moving one or more items
 * *out* of this list into a different one: `shift < 0`), or `shift`
 * items were inserted after it (Tab/Shift-Tab moving one or more items
 * *into* this list, immediately after `anchor`: `shift > 0`).
 *
 * `anchor` is never itself rewritten — its own original number seeds
 * `prevOriginal` for the sequential-run check, exactly matching upstream
 * `@codemirror/lang-markdown`'s own private `renumberList(after, doc,
 * changes, offset)`, which this reimplements against public
 * `@lezer/common` tree APIs (that function is not exported and cannot be
 * called directly — confirmed via the installed package's own `export`
 * list). `anchor.nextSibling` walks only `ListItem`s in the *same*
 * container as `anchor` — for a node inside an `OrderedList`, that means
 * only that same list's own other items, never crossing into a different
 * list, matching every other call site's own already-verified scoping.
 *
 * Each subsequent sibling is compared against the *previous* sibling's
 * own **original** literal number, never an already-rewritten one — an
 * intentionally irregular sequence (`1. / 5. / 9.`) is therefore never
 * touched at all beyond the first break, and every rewrite is filtered
 * through `isRiskyRenumberRewrite` before being included, so this can
 * never reintroduce the digit-width structural-corruption bug that guard
 * exists to prevent, regardless of which direction `shift` moves numbers.
 *
 * `anchor` and every sibling this walks must belong to `state`'s own
 * tree — callers normalizing a Tab/Shift-Tab-driven membership change
 * must pass the tree in which `anchor` and its untouched siblings are
 * both valid (in practice, the *original*, pre-indent-edit state: Tab
 * only ever rewrites a touched line's own leading whitespace, so every
 * sibling this function reads — never itself a touched line, by
 * construction of how callers use this — has an identical position and
 * literal text in the original document as before the indent change).
 */
export function renumberSequentialTail(
  state: EditorState,
  anchor: SyntaxNode,
  shift: number
): RenumberEdit[] {
  const edits: RenumberEdit[] = [];
  let prevOriginal: number | null = null;

  for (let sib: SyntaxNode | null = anchor; sib; sib = sib.nextSibling) {
    if (sib.name !== 'ListItem') continue;
    const marker = sib.firstChild;
    if (!marker || marker.name !== 'ListMark') break;
    const digitMatch = /^(\d+)(?=[.)])/.exec(state.doc.sliceString(marker.from, marker.to));
    if (!digitMatch) break;
    const digits = digitMatch[1]!;
    const original = Number(digits);

    if (prevOriginal === null) {
      prevOriginal = original;
      continue;
    }
    if (original !== prevOriginal + 1) break;

    const digitFrom = marker.from;
    const digitTo = marker.from + digits.length;
    const newNumber = String(original + shift);
    if (!isRiskyRenumberRewrite(state, digitFrom, digitTo, newNumber.length)) {
      edits.push({ from: digitFrom, to: digitTo, insert: newNumber });
    }
    prevOriginal = original;
  }

  return edits;
}
