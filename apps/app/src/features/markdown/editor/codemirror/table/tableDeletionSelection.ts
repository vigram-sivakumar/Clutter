import { Prec, StateEffect, StateField, type EditorState, type Extension, type SelectionRange } from '@codemirror/state';
import { keymap, type Command, type EditorView, type KeyBinding } from '@codemirror/view';

import { tableActiveCellChanged } from './tableActiveCellController';
import { findAllTables, type TableInfo } from './tableGeometry';

/**
 * Whole-table Backspace/Delete, symmetric in both directions:
 *
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

export const tableDeletionSelectionChanged = StateEffect.define<number | null>();

/** The currently armed-for-deletion table's own `from` position, or `null` — `tableWidgetField.ts`'s own single source of truth for painting the "selected" visual state. */
export const tableDeletionSelectionField = StateField.define<number | null>({
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
    // A cell being activated (or deactivated) un-arms it too — a click
    // into a cell dispatches only `tableActiveCellChanged` with no
    // document change and, critically, no root `selection` change either
    // (activation moves the *nested* cell's own caret, not the root
    // view's — `TableActiveCellController.activate()`'s own dispatch
    // never includes a `selection` field), so the `tr.selection` check
    // below alone would never catch a click on a cell while armed.
    // Confirmed directly: without this check, clicking a cell right after
    // arming left the table visibly "selected" even while a cell was
    // simultaneously active.
    if (tr.effects.some((e) => e.is(tableActiveCellChanged))) {
      return null;
    }
    // A selection change (a click, an arrow move) that leaves the armed
    // table's own adjacent line un-arms it — matches "any other
    // interaction cancels a pending destructive action" and keeps this
    // field from silently outliving the one specific position (below or
    // above) it's valid for.
    if (tr.selection) {
      const table = findAllTables(tr.state).find((t) => t.from === value);
      if (!table || !isCaretAdjacentToTable(tr.state, tr.selection.main, table)) {
        return null;
      }
    }
    return value;
  },
});

/** Whether `range` is a collapsed caret sitting on the blank line immediately below `table` — one of the two positions this whole feature is scoped to. */
function isCaretJustBelowTable(state: EditorState, range: SelectionRange, table: TableInfo): boolean {
  if (!range.empty) {
    return false;
  }
  const line = state.doc.lineAt(range.head);
  return line.text.length === 0 && state.doc.lineAt(table.to).number === line.number - 1;
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
  return isCaretJustBelowTable(state, range, table) || isCaretJustAboveTable(state, range, table);
}

/** The table whose own blank line directly below it currently holds a collapsed caret at `pos` — `null` if `pos` isn't on any such line. The Backspace-only arming trigger for the "below" direction. */
function findTableAboveBlankLine(state: EditorState, pos: number): TableInfo | null {
  const line = state.doc.lineAt(pos);
  if (line.text.length !== 0) {
    return null;
  }
  return findAllTables(state).find((table) => state.doc.lineAt(table.to).number === line.number - 1) ?? null;
}

/** The table whose own first line directly follows the line ending at `pos` — `null` if `pos` isn't at such a line's own end. The Delete-only arming trigger for the "above" direction, mirroring `findTableAboveBlankLine`. */
function findTableBelowLineEnd(state: EditorState, pos: number): TableInfo | null {
  const line = state.doc.lineAt(pos);
  if (pos !== line.to) {
    return null;
  }
  return findAllTables(state).find((table) => state.doc.lineAt(table.from).number === line.number + 1) ?? null;
}

function deleteTable(view: EditorView, table: TableInfo): boolean {
  view.dispatch({
    changes: { from: table.from, to: table.to, insert: '' },
    selection: { anchor: table.from },
    effects: tableDeletionSelectionChanged.of(null),
    scrollIntoView: true,
  });
  return true;
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
    if (pending === null) {
      return null;
    }
    const table = findAllTables(view.state).find((t) => t.from === pending);
    if (!table || !isCaretAdjacentToTable(view.state, sel, table)) {
      return null;
    }
    return deleteTable(view, table);
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
    // Arming trigger: only from the blank line below a table — a plain
    // Backspace at the end of an ordinary line (the "above" position)
    // must keep doing ordinary character deletion, never arm anything.
    const table = findTableAboveBlankLine(view.state, sel.head);
    if (!table) {
      return false;
    }
    view.dispatch({ effects: tableDeletionSelectionChanged.of(table.from) });
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

  const bindings: readonly KeyBinding[] = [
    { key: 'Backspace', run: backspaceCommand },
    { key: 'Delete', run: deleteCommand },
  ];

  return Prec.highest(keymap.of(bindings));
}
