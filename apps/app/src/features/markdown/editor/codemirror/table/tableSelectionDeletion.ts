import { invertedEffects } from '@codemirror/commands';
import { EditorSelection, Prec, type ChangeSpec, type Extension } from '@codemirror/state';
import { keymap, type Command, type EditorView, type KeyBinding } from '@codemirror/view';

import type { SyntaxNode } from '@lezer/common';

import { splitPipeRowCells } from './tableAlignment';
import { findAllTables, getNavigableRows, getRowColumnSegments, isAlignmentRow, type TableInfo } from './tableGeometry';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';

/**
 * Structural deletion of a currently-selected table row or column
 * (`TableSelection`, `tableSelection.ts`) — distinct from
 * `tableDeletionSelection.ts`'s own arm/delete state machine, which deletes
 * an entire table from a caret adjacent to it. This module never touches
 * the root caret's own arming mechanism; it only reacts to an already-set
 * `TableSelection` (a row/column handle click, `tableHandleOverlay.ts`) and
 * never arms anything itself.
 *
 * **No longer wired to Backspace/Delete.** `tableSelectionDeletionKeymap()`,
 * below, still exists and is still fully correct, but `buildEditorExtensions.ts`
 * no longer installs it — Backspace/Delete over a `TableSelection` now
 * *clears the selected cells' own content* instead (`tableSelectionClear.ts`),
 * never removes a row/column. This module is kept exactly as it was
 * specifically so a future row/column-handle menu ("Delete row"/"Delete
 * column") can call `deleteSelectedRow`/`deleteSelectedColumn` directly, or
 * reuse `tableSelectionDeletionKeymap()` itself if a keyboard shortcut is
 * ever reintroduced for it — this file's own test suite
 * (`tableSelectionDeletion.test.ts`) exercises it standalone, independent of
 * whatever `buildEditorExtensions.ts` currently wires.
 *
 * **`tableSelectionDeletionHistory()`, below, is reused by
 * `tableSelectionClear.ts` too** — it's a generic `invertedEffects` provider
 * over "any transaction with real `changes` plus a `tableSelectionChanged`
 * effect," not specific to structural deletion despite its name; see that
 * function's own doc comment.
 *
 * Every deletion here is a single ordinary CM6 transaction — one `changes`
 * array plus a `tableSelectionChanged` effect choosing the next selection —
 * so undo/redo, and the root-selection-never-inside-a-table invariant
 * (`tableRootSelectionSnap.ts`, which runs on every transaction including
 * doc-changing ones), both come for free from mechanisms that already
 * exist. `tableSelectionDeletionHistory()`, below, is what makes the
 * *selection* half of that also true — without it, `tableSelectionField`'s
 * own generic `remapTableSelection` (`tableSelection.ts`) tracks undo/redo
 * as "the currently-selected row/column, followed forward through the
 * edit," not "reverse this deletion's own selection change," which leaves
 * the wrong row/column selected after undo (see that function's own doc
 * comment).
 */

/** The `[from, to)` Markdown range to delete for `navigableRows[rowIndex]` — the row's own content plus exactly one adjoining newline. Prefers the newline *after* the row (so a row followed by another row/table content just disappears cleanly); falls back to the newline *before* it only when this is the table's last row, so no dangling blank line is ever left inside the table. Lines within a table are always contiguous (GFM allows no blank line mid-table), so `row.from - 1` is always the exact preceding newline and is always `>= table.from` here (row index is never 0 — the header is never a deletable row). */
function rowDeletionRange(navigableRows: readonly SyntaxNode[], rowIndex: number): { from: number; to: number } | null {
  const row = navigableRows[rowIndex];
  if (!row || rowIndex === 0) {
    return null;
  }
  const next = navigableRows[rowIndex + 1];
  if (next) {
    return { from: row.from, to: next.from };
  }
  return { from: row.from - 1, to: row.to };
}

/**
 * The `[from, to)`/insert change removing column `columnIndex` from one
 * ordinary (non-alignment) row — `null` when this row has no such column at
 * all (a ragged row shorter than the header simply isn't touched, which is
 * exactly "preserve ragged rows"). Always removes the cell's own content
 * plus exactly one adjoining pipe: the pipe *after* it when one exists
 * (works uniformly for a leading, middle, or trailing column that still has
 * a trailing pipe), falling back to the pipe *before* it only for a
 * trailing column whose row has no trailing pipe at all.
 *
 * When a column has delimiters on *neither* side, its row is the "no pipe
 * at all" shape (`getRowColumnSegments`'s own doc comment) — one segment
 * spanning the row with no column boundaries recognizable in source at all.
 * There is no way to attribute that segment to one specific header column
 * without guessing, and removing it outright would leave a blank line,
 * which terminates a GFM table. Left untouched — the conservative reading
 * of "preserve ragged rows" for a row whose own shape has no columns to
 * remove one from.
 */
function columnDeletionChangeForRow(row: SyntaxNode, columnIndex: number): ChangeSpec | null {
  const columns = getRowColumnSegments(row);
  const column = columns[columnIndex];
  if (!column) {
    return null;
  }
  if (column.rightDelimiter) {
    return { from: column.rawFrom, to: column.rightDelimiter.to, insert: '' };
  }
  if (column.leftDelimiter) {
    return { from: column.leftDelimiter.from, to: column.rawTo, insert: '' };
  }
  return null;
}

/**
 * The alignment/delimiter row is a single opaque `TableDelimiter` node
 * (`tableAlignment.ts`'s own doc comment) with no per-column child nodes to
 * anchor a sub-range deletion on, so — like `tableActivationNormalization.ts`'s
 * `canonicalDelimiterRowText` — this rebuilds the row's own text from its
 * own already-known cell content (`splitPipeRowCells`, plain string
 * splitting; safe here because a delimiter cell can only ever contain
 * `-`/`:`, never an escaped pipe to misinterpret), not from the rendered
 * table. Preserves every remaining column's alignment marker exactly as
 * typed, rather than recomputing dash widths the way activation's own
 * canonicalization does — removing a column doesn't need to reflow the
 * others' widths.
 */
function alignmentDeletionChange(row: SyntaxNode, rawText: string, columnIndex: number): ChangeSpec | null {
  const cells = splitPipeRowCells(rawText);
  if (columnIndex >= cells.length) {
    return null;
  }
  const remaining = cells.filter((_, index) => index !== columnIndex);
  return { from: row.from, to: row.to, insert: '| ' + remaining.join(' | ') + ' |' };
}

/** Whether `row/rowIndex` selects the table's *last* remaining selectable row/column — determines "select the adjacent row/column" vs. "select the remaining one" per the deletion-selection contract below. */
function clampNextIndex(deletedIndex: number, newCount: number): number {
  return Math.min(deletedIndex, newCount - 1);
}

/**
 * The `TableSelection` to leave active after deleting row `rowIndex` from a
 * table that had `oldNavigableRowCount` navigable rows (header + body):
 * the row now sitting at the same index (the one that was directly below
 * the deleted row, shifted up — "the adjacent row") when one exists;
 * otherwise the new last row (the one that was directly above — "the
 * remaining row"); `null` once no body row is left at all.
 */
function nextSelectionAfterRowDeletion(tableFrom: number, rowIndex: number, oldNavigableRowCount: number): TableSelection | null {
  const newNavigableRowCount = oldNavigableRowCount - 1;
  if (newNavigableRowCount <= 1) {
    return null;
  }
  return { kind: 'row', tableFrom, rowIndex: clampNextIndex(rowIndex, newNavigableRowCount) };
}

/** Symmetric to `nextSelectionAfterRowDeletion`, for columns. */
function nextSelectionAfterColumnDeletion(tableFrom: number, columnIndex: number, oldColumnCount: number): TableSelection | null {
  const newColumnCount = oldColumnCount - 1;
  if (newColumnCount <= 0) {
    return null;
  }
  return { kind: 'column', tableFrom, columnIndex: clampNextIndex(columnIndex, newColumnCount) };
}

/**
 * Always passes an explicit `selection` — even when `caretAnchor` is
 * omitted, in which case it's the exact same mapped position CM6 would have
 * computed on its own (`startState.selection.map(changes)`, per
 * `Transaction`'s own `newSelection` getter). This isn't a behavior change;
 * it's what makes `tableRootSelectionSnap`'s own transaction filter actually
 * run at all — that filter starts with `if (!tr.selection) return tr`,
 * i.e. it only ever inspects a transaction's *explicitly* provided
 * selection, never one CM6 derived implicitly by mapping. A plain
 * `changes`-only dispatch (no `selection` field) would silently skip that
 * safety net — confirmed directly: without this, a pre-existing root
 * selection that happened to map into the table's shrunken-but-still-
 * present range after a row/column deletion was left there uncorrected.
 */
function dispatchDeletion(view: EditorView, changes: ChangeSpec[], nextSelection: TableSelection | null, caretAnchor?: number): void {
  const changeSet = view.state.changes(changes);
  const selection = caretAnchor !== undefined ? EditorSelection.single(caretAnchor) : view.state.selection.map(changeSet);
  view.dispatch({
    changes,
    selection,
    effects: [tableSelectionChanged.of(nextSelection)],
    scrollIntoView: true,
  });
}

/**
 * Deletes the whole table — the only correct outcome for deleting a
 * single-column table's own last remaining column: unlike a row (which can
 * shrink to a valid zero-body-row, header-only table), a table cannot have
 * zero columns and still be a valid GFM table, so there is no partial
 * remnant to preserve. Mirrors `tableDeletionSelection.ts`'s own
 * `deleteTable` shape exactly (delete `[table.from, table.to)`, land the
 * caret at the now-ordinary-text position `table.from` maps to) — not
 * reused directly because that function also always clears
 * `tableDeletionSelectionChanged`, an effect meaningless to this module's
 * own (always-null-here) whole-table-selection case.
 */
function deleteWholeTable(view: EditorView, table: TableInfo): void {
  dispatchDeletion(view, [{ from: table.from, to: table.to, insert: '' }], null, table.from);
}

function deleteSelectedRow(view: EditorView, table: TableInfo, rowIndex: number): boolean {
  const navigableRows = getNavigableRows(table.node);
  const range = rowDeletionRange(navigableRows, rowIndex);
  if (!range) {
    return false;
  }
  const next = nextSelectionAfterRowDeletion(table.from, rowIndex, navigableRows.length);
  dispatchDeletion(view, [{ from: range.from, to: range.to, insert: '' }], next);
  return true;
}

function deleteSelectedColumn(view: EditorView, table: TableInfo, columnIndex: number): boolean {
  const navigableRows = getNavigableRows(table.node);
  const header = navigableRows[0];
  if (!header) {
    return false;
  }
  const headerColumnCount = getRowColumnSegments(header).length;
  if (columnIndex >= headerColumnCount) {
    return false;
  }
  if (headerColumnCount <= 1) {
    deleteWholeTable(view, table);
    return true;
  }

  const changes: ChangeSpec[] = [];
  const headerChange = columnDeletionChangeForRow(header, columnIndex);
  if (headerChange) {
    changes.push(headerChange);
  }
  const alignRow = header.nextSibling;
  if (alignRow && isAlignmentRow(alignRow)) {
    const alignChange = alignmentDeletionChange(alignRow, view.state.sliceDoc(alignRow.from, alignRow.to), columnIndex);
    if (alignChange) {
      changes.push(alignChange);
    }
  }
  for (const row of navigableRows.slice(1)) {
    const change = columnDeletionChangeForRow(row, columnIndex);
    if (change) {
      changes.push(change);
    }
  }

  const next = nextSelectionAfterColumnDeletion(table.from, columnIndex, headerColumnCount);
  dispatchDeletion(view, changes, next);
  return true;
}

function deleteTableSelection(view: EditorView, selection: TableSelection): boolean {
  if (selection.kind === 'range') {
    return false;
  }
  const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return false;
  }
  return selection.kind === 'row' ? deleteSelectedRow(view, table, selection.rowIndex) : deleteSelectedColumn(view, table, selection.columnIndex);
}

/**
 * `Prec.highest`, listed before `tableWholeDeletionKeymap()` in
 * `buildEditorExtensions.ts` — both intercept Backspace/Delete at the same
 * precedence, so array order breaks the tie; the two are mutually exclusive
 * in practice (this one only ever fires when `TableSelection` is set, the
 * other only from a caret adjacent to a table with no `TableSelection`
 * active), but listing this one first keeps that guarantee explicit rather
 * than incidental. Declines (`return false`) whenever no `TableSelection`
 * is active, falling through to every other handler exactly as before.
 */
export function tableSelectionDeletionKeymap(): Extension {
  const run: Command = (view) => {
    const selection = view.state.field(tableSelectionField, false) ?? null;
    if (!selection) {
      return false;
    }
    return deleteTableSelection(view, selection);
  };

  const bindings: readonly KeyBinding[] = [
    { key: 'Backspace', run },
    { key: 'Delete', run },
  ];

  return Prec.highest(keymap.of(bindings));
}

/**
 * Hooks `tableSelectionChanged` into CM6's *existing* undo/redo history —
 * not a second history mechanism — via `@codemirror/commands`'
 * `invertedEffects` facet, the same one `history()` (installed
 * unconditionally for the root editor, `createEditorView.ts`) already
 * reads. Verified directly against the installed `@codemirror/commands@6.11.0`
 * source (`node_modules/@codemirror/commands/dist/index.js`):
 *
 * - `HistEvent.fromTransaction(tr, selection)` calls every registered
 *   `invertedEffects` provider with the transaction *being recorded*, and
 *   stores whatever effects they return as that history event's own
 *   `effects` — replayed verbatim (`historyField_.pop()`'s own
 *   `state.update({ changes: event.changes, ..., effects: event.effects })`)
 *   the next time that event is undone (or redone).
 * - Critically, `HistEvent.fromTransaction` runs *again* when the undo (or
 *   redo) transaction itself gets recorded into history (`historyField_`'s
 *   own `update()`, the `fromHist` branch) — so this same provider function
 *   fires once for the original deletion (producing the effect replayed on
 *   undo) and once more for the undo transaction (producing the effect
 *   replayed on redo), each time computing its answer from that specific
 *   transaction's own `startState`. One symmetric rule — "restore
 *   `tableSelectionField`'s value from immediately before this
 *   transaction" — is therefore correct in both directions with no
 *   undo/redo-specific branching: for the original delete, `startState` is
 *   the pre-deletion selection (restored on undo); for the undo
 *   transaction, `startState` is the post-deletion selection (restored on
 *   redo).
 * - `HistEvent.fromTransaction` only creates a history entry at all when
 *   `!tr.changes.empty || effects.length` — so this provider must return
 *   `[]` for a changeless transaction (a plain handle click setting
 *   `TableSelection` with no `changes`), or that click would start
 *   entering undo history on its own, breaking `tableSelection.test.ts`'s
 *   own "setting a selection does not enter undo history" invariant. The
 *   `tr.changes.empty` guard below is exactly that: every deletion in this
 *   module always carries real `changes`, so it's never affected; a bare
 *   `tableSelectionChanged` dispatch (no `changes`) always is.
 *
 * The stored inverse is always the *actual* pre-transaction `TableSelection`
 * value, snapshotted — never reconstructed from the row/column positions in
 * the restored document. This matters because `table.from` is invariant
 * across every deletion this module performs (rows/columns are always
 * removed strictly after it), so the exact `{tableFrom, rowIndex}`/
 * `{tableFrom, columnIndex}` that was valid before deletion is valid again,
 * unchanged, once undo restores that exact byte range — no remapping step
 * is needed or wanted here.
 */
export function tableSelectionDeletionHistory(): Extension {
  return invertedEffects.of((tr) => {
    if (tr.changes.empty) {
      return [];
    }
    if (!tr.effects.some((effect) => effect.is(tableSelectionChanged))) {
      return [];
    }
    const previous = tr.startState.field(tableSelectionField, false) ?? null;
    return [tableSelectionChanged.of(previous)];
  });
}
