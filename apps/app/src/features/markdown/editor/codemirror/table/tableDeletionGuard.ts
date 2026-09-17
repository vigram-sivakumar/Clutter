import { Prec, type Extension } from '@codemirror/state';
import { keymap, type Command, type EditorView, type KeyBinding } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import {
  findEnclosingCellBounds,
  isAlignmentRow,
  isAtCellEnd,
  isAtCellStart,
  isImmediatelyAfterTable,
  isImmediatelyBeforeTable,
  resolveTableRowAtCursor,
} from './tableGeometry';

/**
 * Step 1 of the frozen table UX (see docs/editor-architecture-decisions.md's
 * table-investigation entries): once a table's `|` delimiters and row
 * boundaries are hidden, Backspace/Delete must never be able to reach and
 * delete them — confirmed as a real, reproducible corruption risk in the
 * real app (Backspace at a row's own start deletes the row-separating
 * newline, merging two rows into one line that no longer parses as a
 * table). This file is the narrow guard for exactly that danger, and
 * nothing else: no Enter, no Tab, no Left/Right (see `tableArrowKeymap.ts`
 * for Step 2), no selection-based deletion, no row/column/table structural
 * deletion. This one only keeps a single collapsed caret from ever
 * deleting table structure via a plain Backspace/Delete press.
 *
 * Tree-walking (`findEnclosingTable`/`findEnclosingRow`/cell-bounds) lives
 * in `tableGeometry.ts`, shared with `tableArrowKeymap.ts` — see that
 * file's own doc comments for the addressing rationale (delimiter-position-
 * based, not `TableCell`-node-based; whitespace-aware cell boundaries).
 *
 * **The row-boundary check is a separate condition from the cell-boundary
 * one — not implied by it.** A row's own leading position (`row.from`)
 * sits *before* the first cell's own left delimiter, and a row's own
 * trailing position (`row.to`) sits *after* the last cell's own right
 * delimiter — Backspace/Delete at either would delete the newline joining
 * this row to its neighbor, not a pipe or cell text, which is a distinct
 * (and, confirmed live, more severe) corruption risk than deleting an
 * interior delimiter.
 *
 * **Delimiter-adjacency is checked directly and uniformly, in addition to
 * the row-boundary check — not merged into it.** Backspace with the caret
 * right after a row's own *trailing* `|` sits at `row.to`, which the row-
 * boundary check alone never covered for *Backspace* (only `row.from`
 * does), and `findEnclosingCellBounds` doesn't catch it either (there's no
 * delimiter after the row's own last one to pair with) — confirmed as a
 * real gap, fixed by checking every `TableDelimiter` in the row directly:
 * immediately after one blocks Backspace, immediately before one blocks
 * Delete, independent of which row-boundary or cell-boundary checks also
 * apply.
 *
 * **The alignment row (`| --- | ---: |`) is protected in full, not just at
 * its boundary.** It's a single opaque `TableDelimiter` node with no
 * `TableDelimiter`/`TableCell` children — `findEnclosingCellBounds` always
 * returns `null` for it, so the cell-boundary checks alone would leave its
 * interior text (the dashes/colons) completely unprotected. It's never
 * editable data — it's structural syntax exactly like a hidden `|` — so
 * the caret being anywhere in it blocks both keys unconditionally.
 *
 * **The table's own *outer* boundary is a separate concern from every
 * check above, and needed its own fallback.** `resolveTableRowAtCursor`
 * only ever resolves when the caret is inside one of the table's own
 * rows — a caret on the line immediately *below* the table (a freshly-
 * created blank line, an existing paragraph) or immediately *above* it
 * never reaches any of the row/cell/alignment-row checks at all, since it
 * isn't inside the `Table` node to begin with. Confirmed as a real,
 * reproducible bug: a single Backspace from the blank line right after a
 * table deleted that line outright, landing the caret back inside the
 * table's last cell with zero protection engaged anywhere. `isImmediately
 * AfterTable`/`isImmediatelyBeforeTable` (`tableGeometry.ts`) cover this
 * as an explicit fallback in each command, independent of and in addition
 * to the inside-the-table checks.
 *
 * `Prec.highest` — deliberately above `markdownEnterKeymap.ts`'s own
 * `Prec.high` Backspace handling (blockquote/list unwind) and above
 * `defaultKeymap`'s native `deleteCharBackward`/`deleteCharForward` (CM6
 * default precedence) — so this guard is always asked first, regardless
 * of where it happens to sit in the overall extension array. It declines
 * (`return false`) for every case outside its own narrow scope, handing
 * the key back to whichever of those would otherwise have handled it,
 * completely unmodified.
 */

function isAtRowStart(row: SyntaxNode, pos: number): boolean {
  return pos === row.from;
}

function isAtRowEnd(row: SyntaxNode, pos: number): boolean {
  return pos === row.to;
}

function isImmediatelyAfterDelimiter(row: SyntaxNode, pos: number): boolean {
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name === 'TableDelimiter' && child.to === pos) {
      return true;
    }
  }
  return false;
}

function isImmediatelyBeforeDelimiter(row: SyntaxNode, pos: number): boolean {
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name === 'TableDelimiter' && child.from === pos) {
      return true;
    }
  }
  return false;
}

/** The collapsed caret's position, or `null` if there isn't one (a real selection, or a read-only view) to guard at all — shared by the outer-boundary fallback in both commands below, mirroring `resolveTableRowAtCursor`'s own precondition. */
function collapsedCaretPos(view: EditorView): number | null {
  const { state } = view;
  if (state.readOnly) {
    return null;
  }
  const range = state.selection.main;
  return range.empty ? range.head : null;
}

const tableBackspaceGuard: Command = (view) => {
  const resolved = resolveTableRowAtCursor(view);
  if (!resolved) {
    // Not inside a table at all — but the caret could still sit
    // immediately *after* one (e.g. a freshly-created blank line right
    // below it, or an existing paragraph there), where Backspace would
    // delete the newline separating the table from that line, merging
    // them. Confirmed as a real, reproducible bug: none of the row/cell
    // checks below ever run in this case, since the caret is outside the
    // table's own range entirely — this is a separate, outer boundary.
    const pos = collapsedCaretPos(view);
    return pos !== null && isImmediatelyAfterTable(view.state, pos);
  }
  const { row, pos } = resolved;
  if (isAlignmentRow(row) || isAtRowStart(row, pos) || isImmediatelyAfterDelimiter(row, pos)) {
    return true;
  }
  const bounds = findEnclosingCellBounds(row, pos);
  if (bounds && isAtCellStart(view.state, bounds, pos)) {
    return true;
  }
  return false;
};

const tableDeleteGuard: Command = (view) => {
  const resolved = resolveTableRowAtCursor(view);
  if (!resolved) {
    // Symmetric outer-boundary case: the caret sits immediately *before*
    // a table (e.g. at the end of a paragraph directly above one) —
    // Delete there would delete the newline separating that line from
    // the table's own first line, merging them instead.
    const pos = collapsedCaretPos(view);
    return pos !== null && isImmediatelyBeforeTable(view.state, pos);
  }
  const { row, pos } = resolved;
  if (isAlignmentRow(row) || isAtRowEnd(row, pos) || isImmediatelyBeforeDelimiter(row, pos)) {
    return true;
  }
  const bounds = findEnclosingCellBounds(row, pos);
  if (bounds && isAtCellEnd(view.state, bounds, pos)) {
    return true;
  }
  return false;
};

const tableDeletionGuardKeymap: readonly KeyBinding[] = [
  { key: 'Backspace', run: tableBackspaceGuard },
  { key: 'Delete', run: tableDeleteGuard },
];

export function tableDeletionGuard(): Extension {
  return Prec.highest(keymap.of(tableDeletionGuardKeymap));
}
