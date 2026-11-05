import { EditorSelection, EditorState, type Extension, type SelectionRange } from '@codemirror/state';

import { findEnclosingTable } from '../table/tableGeometry';
import { isCollapsedQuoteExitLine } from './separatorScope';

/**
 * Keeps the caret from stopping on the collapsed blank line that ends a
 * blockquote (`collapsedQuoteExitDecoration.ts`). That line has zero height, so
 * a caret parked on it is invisible: Arrow Left/Right would need an extra,
 * unexplained press to cross it.
 *
 * A sibling of `tokenSelectionSnap.ts`, `liveMarkSelectionSnap.ts` and
 * `table/tableRootSelectionSnap.ts` — a selection-only transaction filter — and
 * deliberately *not* `EditorView.atomicRanges`. That facet is shared by motion
 * and deletion, and the only range that can contain the blank line's position is
 * `[previousLine.to, nextLine.from]`, so Backspace at the start of the next
 * paragraph would delete both newlines and merge the paragraph into the quote.
 * A selection filter never sees a deletion: it only acts on transactions that
 * set a selection, change no text, and carry a `select*` user event (every
 * cursor command is `select`, mouse selection is `select.pointer`). Backspace,
 * Delete, Enter, typing and undo/redo all change the document or carry another
 * user event, so they pass through untouched — which is also why the blank line
 * stays a real, deletable line.
 *
 * Which side the caret is moved to follows the direction of travel, read against
 * the previous head: arriving from above moves to the end of the quote line,
 * arriving from below to the start of the next line. A non-empty selection keeps
 * its anchor/head direction (`EditorSelection.range(anchor, head)`, never a
 * re-derived pair); an anchor that sits on the line moves away from the head, so
 * the selection never shrinks to exclude text the user selected.
 *
 * One deliberate exception: when the line after the blank one is a table, the
 * blank line is left alone. `tableRootSelectionSnap` forbids a root caret at
 * `table.from`, so the blank line is the only legal caret position before the
 * table; snapping forward would just be undone by that rule. The caret can stop
 * on the invisible line in that one arrangement (quote, blank line, table).
 *
 * Not enforced for a selection set with no user event (a plain `dispatch`), and
 * not for undo/redo — the line stays reachable programmatically, just never by
 * the user's own navigation. Returns `[tr, { selection }]` rather than a bare
 * spec so the original transaction's annotations (its `userEvent`, notably)
 * survive for every filter that runs after this one.
 */
export function collapsedQuoteExitSelectionSnap(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (tr.docChanged || !tr.selection || !tr.isUserEvent('select')) {
      return tr;
    }

    const { startState } = tr;
    const previousHead = startState.selection.main.head;
    const ranges = tr.selection.ranges.map((range) => snapRange(startState, range, previousHead));
    if (ranges.every((range, index) => range === tr.selection!.ranges[index])) {
      return tr;
    }

    return [tr, { selection: EditorSelection.create(ranges, tr.selection.mainIndex) }];
  });
}

function snapRange(state: EditorState, range: SelectionRange, previousHead: number): SelectionRange {
  const head = snapPosition(state, range.head, range.head >= previousHead);
  if (range.empty) {
    return head === range.head ? range : EditorSelection.cursor(head, head < range.head ? 1 : -1);
  }

  // The anchor moves away from the head, so the range keeps covering what it covered.
  const anchor = snapPosition(state, range.anchor, range.anchor > range.head);
  return anchor === range.anchor && head === range.head ? range : EditorSelection.range(anchor, head);
}

/** `pos` itself, or the nearest boundary of the collapsed line it sits on, in the given direction. */
function snapPosition(state: EditorState, pos: number, forward: boolean): number {
  const line = state.doc.lineAt(pos);
  if (!isCollapsedQuoteExitLine(state, line.number)) {
    return pos;
  }
  if (!forward) {
    return state.doc.line(line.number - 1).to;
  }
  const next = state.doc.line(line.number + 1).from;
  // A caret at `table.from` is illegal (`tableRootSelectionSnap`), so there is nowhere to go.
  return findEnclosingTable(state, next) ? pos : next;
}
