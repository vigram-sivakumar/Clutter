import { EditorState, type ChangeSpec, type Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { findAllTables, getNavigableRows, getRowCellBounds, type CellBounds, type TableInfo } from './tableGeometry';

/**
 * The rectangular-table invariant
 * (`docs/table-range-selection-clipboard-ux-contract.md`'s "CRITICAL TABLE
 * INVARIANT" — "a Clutter table must never be structurally broken or
 * expose missing cells"), enforced from two complementary places, not one
 * — investigated and reported before implementation (see this milestone's
 * own written findings): a pure source-level fix alone cannot cover a
 * table that's never been through a dispatched transaction at all (a
 * freshly-opened file with a pre-existing ragged row, or a permanently
 * read-only note embed, which can never dispatch a doc-changing
 * transaction by construction), and a pure display-level fix alone cannot
 * keep the *source* itself valid the way "insertion/deletion producing an
 * incomplete row" (the contract's own explicit non-goal) requires.
 *
 * **This module owns the two pieces that need `EditorView`/dispatch
 * access — where `getRectangularRowCellBounds` (`tableGeometry.ts`) is the
 * pure, read-only geometry half of the same invariant, kept there since
 * it has no state or side effects of its own.**
 *
 * 1. `tableRectangularNormalization()` — an `EditorState.transactionFilter`,
 *    same mechanism and composition guarantee `tableActivationNormalization.ts`
 *    already establishes in detail (filters see the final transaction
 *    regardless of which command produced it, composed into one undo
 *    step). Re-pads every table *touched by the edited range* to its own
 *    header's column count. This is what makes structural column
 *    insertion/deletion "just work" without any change to
 *    `tableColumnInsertion.ts`/`tableSelectionDeletion.ts` — both already,
 *    deliberately, leave a ragged row untouched when they don't have a
 *    real column to act on (confirmed directly in their own code/doc
 *    comments); this filter re-normalizes the *resulting* table against
 *    its *resulting* header count regardless of which operation produced
 *    it, catching the exact gap those files' own "preserve ragged rows"
 *    design leaves open. Also catches ordinary typing that introduces
 *    raggedness (deleting a pipe) and paste of an already-complete-but-
 *    ragged table.
 *
 * 2. `ensureRectangularCellBounds()` — called *before* `controller.activate()`
 *    from the handful of call sites that resolve a logical `(row, column)`
 *    coordinate into activation bounds (`TableWidget`'s own click handler,
 *    `tableCellNavigation.ts`'s vertical-move command) whenever that
 *    resolution could land on a `synthetic` bounds
 *    (`getRectangularRowCellBounds`'s own doc comment) — `row.to` has no
 *    real delimiters around it, so activating a cell there directly would
 *    let `TableActiveCellController.forwardToRoot` (which this milestone
 *    does not and must not modify) insert raw, pipe-less text on the very
 *    first keystroke. Materializes the row for real first (one genuine,
 *    real undo step — see this module's own test file), then re-resolves
 *    against the now-current state (row/table positions shift after any
 *    insert), handing the caller back real bounds to activate normally.
 *
 * **Why not fold this into `tableActivationNormalization.ts`.** That
 * module's own re-trigger guard *deliberately* skips any edit already
 * inside a recognized `Table` — it is scoped to a table's one-time birth,
 * never revisited afterward (confirmed directly from its own code). This
 * invariant is the opposite: an *ongoing* property that must hold for
 * every table on every relevant transaction for as long as it exists —
 * genuinely orthogonal scope, not a variant of the same concern, so a
 * separate file per this codebase's own "one file per orthogonal concern"
 * convention.
 *
 * **Architecture E is unaffected.** No new persistent state, no second
 * document, no change to `TableSelection`'s own shape or lifecycle, no
 * change to the nested `EditorView`/root ownership model — this is a
 * `transactionFilter` (the same category `tableActivationNormalization.ts`/
 * `tableRootSelectionSnap.ts` already are) plus one small helper function
 * that dispatches an ordinary, plain `ChangeSpec` transaction, the same
 * shape every structural operation in this feature already uses.
 */

/** One row's own missing-trailing-cell padding, relative to `headerColumnCount` — `null` if `row` is already rectangular (the overwhelmingly common case, and every header/alignment row always, by definition). */
function rowPaddingChange(row: SyntaxNode, headerColumnCount: number): ChangeSpec | null {
  const missing = headerColumnCount - getRowCellBounds(row).length;
  if (missing <= 0) {
    return null;
  }
  return { from: row.to, to: row.to, insert: ' |'.repeat(missing) };
}

/**
 * Every change needed to make `table` fully rectangular — every body row
 * padded out to its own header's column count. `[]` when the table is
 * already rectangular (checked per-row, not assumed from one sample row —
 * different rows can be ragged by different amounts, or not at all).
 * Never touches the header itself (it *defines* the column count, so it
 * is rectangular by construction) or the alignment row (never raggable
 * relative to the header — a GFM invariant `tableColumnInsertion.ts`'s own
 * doc comment already states).
 *
 * `excludeRowTailAt`, when given, skips whichever row (if any) currently
 * *ends exactly there* — see `tableRectangularNormalization()`'s own doc
 * comment for why the transaction filter needs this (a row still being
 * actively typed always ends exactly at the edit that just extended it)
 * and `ensureRectangularCellBounds` deliberately does not pass it (it
 * pads every ragged row unconditionally — it only ever runs for a row the
 * user is *not* actively typing into, since it exists specifically to
 * materialize a *different*, not-yet-real cell before activating it).
 */
export function computeRectangularizingChanges(table: TableInfo, excludeRowTailAt?: number): ChangeSpec[] {
  const navigableRows = getNavigableRows(table.node);
  const header = navigableRows[0];
  if (!header) {
    return [];
  }
  const headerColumnCount = getRowCellBounds(header).length;
  const changes: ChangeSpec[] = [];
  for (const row of navigableRows.slice(1)) {
    if (excludeRowTailAt !== undefined && row.to === excludeRowTailAt) {
      continue;
    }
    const change = rowPaddingChange(row, headerColumnCount);
    if (change) {
      changes.push(change);
    }
  }
  return changes;
}

/**
 * The transaction filter — see this module's own top doc comment, item 1.
 * Scoped to only the table(s) whose own `[from, to)` range overlaps the
 * transaction's *edited* range (mapped into the resulting document,
 * matching `tableActivationNormalization.ts`'s own `iterChanges`-based
 * scoping convention) — never a full-document scan of every table
 * regardless of relevance, which the contract's own "do not
 * normalize/rewrite the entire document on every keystroke" performance
 * requirement rules out. `findAllTables` itself is still an O(document
 * size) tree walk, but that is the same, already-accepted cost
 * `tableWidgetField`'s own rebuild already pays on most transactions —
 * only the *changes actually produced* are scoped to the touched table(s),
 * which is what the performance requirement is actually about.
 *
 * **Never pads the row the transaction's own edit is actively extending.**
 * Confirmed as a real bug via direct live-browser testing, not a
 * theoretical concern: typing a brand-new row character by character is
 * genuinely "ragged" (fewer cells than the header) for every single
 * keystroke while it's still being constructed, and every one of those
 * keystrokes inserts exactly at that row's own current `.to` — without
 * this exclusion, the very first `|` of a new row would immediately get
 * padding text inserted right into it, corrupting the row the user is
 * actively typing. `computeRectangularizingChanges`'s own
 * `excludeRowTailAt` parameter is passed this transaction's own edit
 * end position (the transaction's *last* touched position, for the rare
 * multi-range-edit case) precisely to skip whichever single row (if any)
 * currently ends exactly there — an edit *interior* to an already-complete
 * row (deleting a pipe from the middle, a paste that lands inside one) is
 * never excluded by this check, since that row's own `.to` sits *after*
 * the edit, not at it, so it's still normalized in the same transaction.
 * Every *other* ragged row in the same table (pre-existing raggedness the
 * edit didn't cause, or a row a structural operation left untouched) is
 * also still normalized. A row that's still ragged only because the user
 * simply hasn't finished it yet is not left unprotected by this exclusion
 * — it's covered independently by `tableWidgetField.ts`'s own rendering
 * padding (never a missing cell *shown*) and by `ensureRectangularCellBounds`
 * the moment anything actually tries to activate a cell in it.
 */
export function tableRectangularNormalization(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) {
      return tr;
    }
    const touchedTableFroms = new Set<number>();
    const tables = findAllTables(tr.state);
    let lastEditedTo = -Infinity;
    tr.changes.iterChanges((_fromA, _toA, fromB, toB) => {
      lastEditedTo = Math.max(lastEditedTo, toB);
      for (const table of tables) {
        if (touchedTableFroms.has(table.from)) {
          continue;
        }
        if (table.to < fromB || table.from > toB) {
          continue;
        }
        touchedTableFroms.add(table.from);
      }
    });
    if (touchedTableFroms.size === 0) {
      return tr;
    }
    const changes: ChangeSpec[] = [];
    for (const table of tables) {
      if (!touchedTableFroms.has(table.from)) {
        continue;
      }
      changes.push(...computeRectangularizingChanges(table, lastEditedTo));
    }
    if (changes.length === 0) {
      return tr;
    }
    return [tr, { changes, sequential: true }];
  });
}

/**
 * Materializes `table`'s row `rowIndex`, column `columnIndex` into real
 * source (if it isn't already) and returns its real, resolved bounds — see
 * this module's own top doc comment, item 2. Dispatches at most once (a
 * plain `computeRectangularizingChanges` transaction, no selection changes
 * of its own — the caller's own subsequent `controller.activate()` call
 * establishes selection/focus as it always does). `null` when `rowIndex`/
 * `columnIndex` is genuinely out of range (not just ragged) or the table
 * can no longer be resolved after dispatching (defensive only).
 */
export function ensureRectangularCellBounds(
  view: EditorView,
  table: TableInfo,
  rowIndex: number,
  columnIndex: number
): { readonly table: TableInfo; readonly row: SyntaxNode; readonly bounds: CellBounds } | null {
  const navigableRows = getNavigableRows(table.node);
  const row = navigableRows[rowIndex];
  if (!row) {
    return null;
  }
  const existing = getRowCellBounds(row)[columnIndex];
  if (existing) {
    return { table, row, bounds: existing };
  }
  const header = navigableRows[0];
  const headerColumnCount = header ? getRowCellBounds(header).length : 0;
  if (columnIndex < 0 || columnIndex >= headerColumnCount) {
    return null;
  }

  const changes = computeRectangularizingChanges(table);
  if (changes.length === 0) {
    // `existing` was missing, so this shouldn't happen — defensive only.
    return null;
  }
  view.dispatch({ changes });

  const freshTable = findAllTables(view.state).find((t) => t.from === table.from);
  if (!freshTable) {
    return null;
  }
  const freshRow = getNavigableRows(freshTable.node)[rowIndex];
  if (!freshRow) {
    return null;
  }
  const freshBounds = getRowCellBounds(freshRow)[columnIndex];
  if (!freshBounds) {
    return null;
  }
  return { table: freshTable, row: freshRow, bounds: freshBounds };
}
