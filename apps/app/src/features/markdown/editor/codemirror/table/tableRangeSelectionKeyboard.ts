import { Prec, type Extension } from '@codemirror/state';
import { keymap, type Command, type EditorView, type KeyBinding } from '@codemirror/view';

import type { TableActiveCellController } from './tableActiveCellController';
import { enterCellOf } from './tableBoundaryNavigation';
import { runTableCellNavigationCommand, type TableCellNavigationKey } from './tableCellNavigation';
import { findAllTables } from './tableGeometry';
import { tableSelectionChanged, tableSelectionField } from './tableSelection';

/**
 * Root-editor keymap for Arrow/Tab/Shift-Tab/Enter while a rectangular
 * `range`-kind `TableSelection` is active (`tableSelection.ts`,
 * `tableCellRangeSelection.ts`'s own drag gesture) — the UX contract's own
 * "Range selection" keyboard rules
 * (`docs/table-range-selection-clipboard-ux-contract.md`): each of these
 * keys clears the range selection, reactivates the range's own anchor cell,
 * then hands off to the *existing* per-key cell navigation
 * (`tableCellNavigation.ts`) exactly as if that key had been pressed with
 * the anchor already active — never a new, range-aware navigation system
 * of its own (the contract's own explicit "do not invent special
 * range-navigation behavior").
 *
 * **Why a separate root-level keymap, not an extension of
 * `tableBoundaryNavigation.ts` or `tableCellNavigation.ts`.** Both existing
 * table keymaps assume one of two states this module's own trigger
 * condition never overlaps: `tableCellNavigation.ts`'s bindings only ever
 * fire while the nested editor itself holds focus (a cell is active) —
 * never true here, since starting a range selection always deactivates the
 * cell (`tableCellRangeSelection.ts`'s own `beginCellDragTracking`).
 * `tableBoundaryNavigation.ts`'s bindings fire from the root editor with no
 * cell active, but are gated on the root caret's own line-adjacency to a
 * table — irrelevant here, since a range selection carries no root-caret
 * position of its own to check (the root selection is left exactly where
 * it was before the drag started, `tableCellRangeSelection.ts`'s own drag
 * dispatch never touches it). This module's own trigger is `tableSelectionField`
 * holding a `range` value, independent of wherever the root caret happens
 * to sit — a third, disjoint condition from both existing keymaps'.
 *
 * **Only `range` selections are handled.** `row`/`column` selections (a
 * handle click, `tableHandleOverlay.ts`) are outside this milestone's own
 * scope (`docs/table-range-selection-clipboard-ux-contract.md`'s "Range
 * selection" section is specifically about the drag-created rectangular
 * selection) — this keymap declines immediately for any other
 * `TableSelection` kind or no selection at all, leaving their pre-existing
 * behavior (currently: no interception, ordinary CM6 default handling)
 * completely untouched.
 *
 * **Anchor reactivation reuses `tableBoundaryNavigation.ts`'s own
 * `enterCellOf`** — already exactly "activate `(rowIndex, columnIndex)` of
 * `table`, cursor at content start/end" — no second cell-activation
 * implementation. The `cursorAt` choice per key is what makes "let the
 * existing navigation handle it" actually engage `tableCellNavigation.ts`'s
 * own `moveOrExit` (Left/Right) correctly: that command only treats the
 * nested caret as being "at a boundary" (and therefore moves to an
 * adjacent cell rather than just moving the caret within the anchor cell's
 * own text) when the caret sits at the cell's content start (ArrowLeft) or
 * content end (ArrowRight) — so this module places it there directly,
 * rather than at some arbitrary position and hoping the boundary check
 * happens to pass. ArrowUp/ArrowDown/Tab/Shift-Tab/Enter don't depend on
 * intra-cell caret position at all (`tableCellNavigation.ts`'s own
 * commands only look at which *cell* is active); their own `cursorAt`
 * choice below just mirrors `tableBoundaryNavigation.ts`'s existing
 * entering-direction convention (`'start'` for Down, `'end'` for Up) for
 * consistency, not because it changes behavior.
 *
 * **Enter's own structural row-insert never runs while a range selection
 * is still active.** `tableCellNavigation.ts`'s `enterCommand` inserts a
 * new row — a real document change — but this module always dispatches
 * the range selection's own clearing *before* handing off to it, in an
 * earlier, separate transaction. By the time `enterCommand`'s insert
 * transaction runs, `tableSelectionField` already holds `null` — there is
 * no window in which a `range` selection is simultaneously active during a
 * structural edit, so the known gap in `tableSelection.ts`'s own
 * `remapTableSelection` (`range` selections aren't remapped through a
 * structural edit, only dropped) is never engaged by this milestone. See
 * this module's own test file for an explicit regression case proving
 * this, not just this comment's own assertion of it.
 */
export function tableRangeSelectionKeyboard(controller: TableActiveCellController): Extension {
  function activateAnchorAndRun(rootView: EditorView, key: TableCellNavigationKey, cursorAt: 'start' | 'end'): boolean {
    const selection = rootView.state.field(tableSelectionField, false) ?? null;
    if (!selection || selection.kind !== 'range') {
      return false;
    }
    const table = findAllTables(rootView.state).find((t) => t.from === selection.tableFrom);
    if (!table) {
      return false;
    }

    // Clear the range selection first — its own transaction, before
    // reactivation or navigation, so nothing downstream (including
    // `enterCommand`'s own structural row-insert, see this module's own
    // doc comment) ever runs while `tableSelectionField` still holds this
    // `range` value.
    rootView.dispatch({ effects: [tableSelectionChanged.of(null)] });

    const activated = enterCellOf(rootView, controller, table, selection.anchor.row, selection.anchor.col, cursorAt);
    if (!activated) {
      // The anchor cell itself no longer resolves (defensive only — no
      // code path currently mutates a table's structure while a `range`
      // selection is active; see this module's own doc comment). The
      // selection is already cleared above; nothing more to do.
      return true;
    }

    const nestedView = controller.nestedView;
    if (!nestedView) {
      return true;
    }
    return runTableCellNavigationCommand(() => rootView, controller, key, nestedView);
  }

  const makeCommand = (key: TableCellNavigationKey, cursorAt: 'start' | 'end'): Command => {
    return (view) => activateAnchorAndRun(view, key, cursorAt);
  };

  const bindings: readonly KeyBinding[] = [
    { key: 'ArrowUp', run: makeCommand('ArrowUp', 'end') },
    { key: 'ArrowDown', run: makeCommand('ArrowDown', 'start') },
    { key: 'ArrowLeft', run: makeCommand('ArrowLeft', 'start') },
    { key: 'ArrowRight', run: makeCommand('ArrowRight', 'end') },
    { key: 'Tab', run: makeCommand('Tab', 'end') },
    { key: 'Shift-Tab', run: makeCommand('Shift-Tab', 'end') },
    { key: 'Enter', run: makeCommand('Enter', 'end') },
  ];

  return Prec.highest(keymap.of(bindings));
}
