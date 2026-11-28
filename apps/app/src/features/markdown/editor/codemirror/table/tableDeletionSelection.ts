import { Prec, StateEffect, StateField, type EditorState, type Extension, type SelectionRange } from '@codemirror/state';
import { keymap, type Command, type EditorView, type KeyBinding } from '@codemirror/view';

import { deleteProjectedTable } from '../table-engine/tableTransaction';
import { projectableTableSnapshot } from '../table-engine/tableModel';
import { findAllTables, type TableInfo } from './tableGeometry';

/**
 * Whole-table Backspace/Delete, symmetric in both directions:
 *
 * - **From the start of non-empty text immediately below a table**: the
 *   first Backspace protects the boundary, the second arms deletion and
 *   the third deletes only the table, preserving the following text.
 * - **From the blank line immediately below a table**: a first Backspace
 *   marks the table selected (visually, via `tableWidgetField.ts` reading
 *   this module's own field — never by moving the root selection into
 *   it); a second Backspace *or* Delete deletes the table's entire
 *   `[from, to)` Markdown range in one step.
 * - **From the end of the real line immediately above a table**: a first
 *   Delete marks the same table selected the same way; a second Delete
 *   *or* Backspace deletes it the same way. This is the mirror image of
 *   the "below" case — approaching a table forward (Delete, merging the
 *   next line up) is symmetric with approaching it backward (Backspace,
 *   merging the previous line up) — matching the product requirement that
 *   the table behaves as one atomic block regardless of which side it's
 *   approached from.
 *
 * Both directions share one arm/delete state machine (`tableDeletionSelectionField`
 * below) — arming from either side, or completing the deletion with
 * either key once armed, are the same mechanism, not two parallel ones.
 * Only the two *arming* triggers stay direction-specific (Backspace only
 * arms from below; Delete only arms from above) — otherwise a plain
 * Backspace at the end of an ordinary line, or a plain Delete on an
 * ordinary blank line, would be hijacked into arming a table that has
 * nothing to do with the edit the user actually intended.
 *
 * **Why a separate `StateField`, not folded into `tableWidgetField.ts`'s
 * own decoration field.** This tracks *intent* ("is a table currently
 * armed for deletion"), which needs to survive across transactions that
 * don't touch decorations at all and must independently invalidate on its
 * own rules (any doc change, or the selection leaving the specific
 * adjacent line of the armed table) — a genuinely different lifecycle
 * from "what should currently render," which stays a pure function of the
 * document + active-cell state. `tableWidgetField.ts` only *reads* this
 * field's current value (via `tr.state.field(tableDeletionSelectionField)`)
 * when deciding whether to paint a table as selected; it never writes it.
 *
 * **Root-selection safety.** Every dispatch here either changes no
 * selection at all (the first-press "arm" dispatch — the caret stays
 * exactly where it was, on the real, editable adjacent line) or moves it
 * to `table.from` *after* that same table's own range has just been
 * deleted (the second-press dispatch) — a position that, post-deletion,
 * is ordinary document text (whatever now immediately follows), never
 * inside any table's own hidden range. Neither path ever asks
 * `findEnclosingTable`-style resolution to place the caret *inside* a
 * still-existing table. CM6 has no ProseMirror-style "node selection"
 * primitive — a real *text* selection spanning into `[table.from, table.to)`
 * is exactly the un-renderable-giant-cursor case this whole feature must
 * never produce, which is why "armed" lives in this dedicated field
 * instead of being expressed as a root `EditorSelection` range.
 */

/** A number is an armed table's source start; the protected first press
 * is deliberately not armed (and cannot match the projection's numeric
 * selection check). Both phases belong to the same root intent field. */
type TableDeletionIntent = number | { readonly tableFrom: number; readonly caret: number } | null;

export const tableDeletionSelectionChanged = StateEffect.define<TableDeletionIntent>();

export const tableDeletionSelectionField = StateField.define<TableDeletionIntent>({
  create() {
    return null;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(tableDeletionSelectionChanged)) {
        value = effect.value;
      }
    }
    if (value === null) {
      return null;
    }
    // Any document change invalidates a pending arm outright — including
    // this same field's own deletion dispatch, which always pairs its
    // change with an explicit `tableDeletionSelectionChanged.of(null)`
    // already applied above, so this is never reached for that case; for
    // every other edit, the previously-armed table's own bounds may no
    // longer mean what they did, so re-arming from scratch (a fresh
    // Backspace) is required rather than trying to carry it through.
    if (tr.docChanged) {
      return null;
    }
    // A selection change (a click, an arrow move) that leaves the armed
    // table's own adjacent line un-arms it — matches "any other
    // interaction cancels a pending destructive action" and keeps this
    // field from silently outliving the one specific position (below or
    // above) it's valid for.
    if (tr.selection) {
      // Even a same-position click or selection gesture cancels the
      // unarmed first press. Explicit arm effects retain the established
      // adjacent-position validation contract.
      if (typeof value !== 'number') return null;
      const table = findAllTables(tr.state).find((t) => t.from === value);
      if (!table || !isCaretAdjacentToTable(tr.state, tr.selection.main, table)) {
        return null;
      }
    }
    return value;
  },
});

/** A Backspace here would consume the boundary newline and merge the
 * following line into the table's hidden source. */
function isCaretAtLineStartBelowTable(state: EditorState, range: SelectionRange, table: TableInfo): boolean {
  if (!range.empty) return false;
  const line = state.doc.lineAt(range.head);
  return range.head === line.from && line.number === state.doc.lineAt(table.to).number + 1;
}

/** Empty adjacent lines skip the initial boundary-protection press. */
function isCaretJustBelowTable(state: EditorState, range: SelectionRange, table: TableInfo): boolean {
  return state.doc.lineAt(range.head).length === 0 && isCaretAtLineStartBelowTable(state, range, table);
}

/**
 * Whether `range` is a collapsed caret sitting at the very end of the
 * real line immediately above `table` — the mirror image of
 * `isCaretJustBelowTable`. Unlike the "below" case, this line is never
 * required to be blank: "the real editable line immediately above a
 * table" is whatever content (or lack of it) already precedes the table
 * in the document — only the caret's own position (this line's own
 * `.to`, the exact point where a forward Delete would otherwise start
 * merging the table's first line up into it) matters.
 */
function isCaretJustAboveTable(state: EditorState, range: SelectionRange, table: TableInfo): boolean {
  if (!range.empty) {
    return false;
  }
  const line = state.doc.lineAt(range.head);
  return range.head === line.to && state.doc.lineAt(table.from).number === line.number + 1;
}

/** Whether `range` sits adjacent to `table` on either side — the one shared condition both arming and re-validation (and the symmetric "either key completes it" second press) check against. */
function isCaretAdjacentToTable(state: EditorState, range: SelectionRange, table: TableInfo): boolean {
  return isCaretAtLineStartBelowTable(state, range, table) || isCaretJustAboveTable(state, range, table);
}

/** Resolve a projected table immediately above the caret's line start.
 * Blank lines can arm deletion; non-empty lines must never merge into it. */
function findTableAboveLineStart(state: EditorState, range: SelectionRange): TableInfo | null {
  if (!range.empty || range.head !== state.doc.lineAt(range.head).from) return null;
  return findAllTables(state).find((table) => projectableTableSnapshot(state.doc.toString(), table.node) !== null && isCaretAtLineStartBelowTable(state, range, table)) ?? null;
}

/** The table whose own first line directly follows the line ending at `pos` — `null` if `pos` isn't at such a line's own end. The Delete-only arming trigger for the "above" direction, mirroring `findTableAboveLineStart`. */
function findTableBelowLineEnd(state: EditorState, pos: number): TableInfo | null {
  const line = state.doc.lineAt(pos);
  if (pos !== line.to) {
    return null;
  }
  return findAllTables(state).find((table) => projectableTableSnapshot(state.doc.toString(), table.node) !== null && state.doc.lineAt(table.from).number === line.number + 1) ?? null;
}

/**
 * `Prec.highest` — same convention the deleted `tableDeletionGuard.ts`
 * (pre-Architecture-E) used for exactly this class of "intercept
 * Backspace/Delete before any other handler gets a chance" concern: this
 * must run ahead of `markdownEnterKeymap.ts`'s own Backspace handling and
 * `defaultKeymap`'s native `deleteCharBackward`/`deleteCharForward`,
 * regardless of extension array order elsewhere. Declines (`return
 * false`) for every case outside its own narrow scope — a cell's own
 * Backspace/Delete never reaches this at all, since those keystrokes are
 * received by the *nested* cell `EditorView`'s own contentDOM, a
 * genuinely separate `EditorView` with its own keymap; this module only
 * ever installs on the root view.
 */
export function tableWholeDeletionKeymap(): Extension {
  /**
   * Shared by both commands' first branch: if a table is already armed
   * and the caret is still adjacent to it (below *or* above — whichever
   * side it was armed from), either key completes the deletion. Returns
   * `null` (not `false`) when there's nothing pending, so each caller can
   * fall through to its own direction-specific *arming* trigger instead.
   */
  function completePendingDeletion(view: EditorView, sel: SelectionRange): boolean | null {
    const pending = view.state.field(tableDeletionSelectionField, false) ?? null;
    if (typeof pending !== 'number') {
      return null;
    }
    const table = findAllTables(view.state).find((t) => t.from === pending);
    if (!table || !isCaretAdjacentToTable(view.state, sel, table)) {
      return null;
    }
    deleteProjectedTable(view, table, tableDeletionSelectionChanged.of(null));
    // Consume the armed gesture even if a root filter refuses the edit.
    return true;
  }

  const backspaceCommand: Command = (view) => {
    const sel = view.state.selection.main;
    if (!sel.empty) {
      return false;
    }
    const completed = completePendingDeletion(view, sel);
    if (completed !== null) {
      return completed;
    }
    // Protect the boundary first when text follows the table. Only a
    // subsequent press at the same position arms deletion. Blank lines
    // retain the existing two-press behaviour.
    const table = findTableAboveLineStart(view.state, sel);
    if (!table) return false;
    const pending = view.state.field(tableDeletionSelectionField, false);
    const protectedBoundary = pending != null && typeof pending !== 'number' &&
      pending.tableFrom === table.from && pending.caret === sel.head;
    view.dispatch({ effects: tableDeletionSelectionChanged.of(
      isCaretJustBelowTable(view.state, sel, table) || protectedBoundary
        ? table.from : { tableFrom: table.from, caret: sel.head }
    ) });
    return true;
  };

  const deleteCommand: Command = (view) => {
    const sel = view.state.selection.main;
    if (!sel.empty) {
      return false;
    }
    const completed = completePendingDeletion(view, sel);
    if (completed !== null) {
      return completed;
    }
    // Arming trigger: only from the end of the line above a table — the
    // mirror of `backspaceCommand`'s own arming trigger. A plain Delete
    // on an ordinary blank line (the "below" position) must keep doing
    // ordinary forward deletion, never arm anything.
    const table = findTableBelowLineEnd(view.state, sel.head);
    if (!table) {
      return false;
    }
    view.dispatch({ effects: tableDeletionSelectionChanged.of(table.from) });
    return true;
  };

  const cancelPending: Command = view => {
    if (view.state.field(tableDeletionSelectionField, false) == null) return false;
    view.dispatch({ effects: tableDeletionSelectionChanged.of(null) });
    return true;
  };

  const bindings: readonly KeyBinding[] = [
    { key: 'Escape', run: cancelPending },
    { key: 'Backspace', run: backspaceCommand },
    { key: 'Delete', run: deleteCommand },
  ];

  return Prec.highest(keymap.of(bindings));
}
