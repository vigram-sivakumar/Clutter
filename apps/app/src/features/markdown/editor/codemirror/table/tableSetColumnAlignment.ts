import type { ChangeSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { parseTableAlignment, splitPipeRowCells, type TableColumnAlignment } from './tableAlignment';
import { findAllTables, getNavigableRows, getRowColumnSegments, isAlignmentRow, type TableInfo } from './tableGeometry';
import { tableSelectionChanged, type TableSelection } from './tableSelection';

/**
 * "Align → Left/Center/Right" (column handle menu) — sets the selected
 * column's own alignment marker in the delimiter/alignment row. The one
 * table structural operation that touches *only* that one row: unlike
 * move/insert/delete/duplicate, alignment carries no content of its own to
 * relocate, so there is nothing for the header or any body row to do here
 * at all — unlike every sibling module in this feature, this one never
 * even reads them.
 *
 * **Marker text is a fixed literal per target alignment, not a preserved/
 * recomputed dash count** (`:---` / `:---:` / `---:`) — the same "a
 * brand-new/changed column's own marker is always the simplest possible
 * shape" precedent `tableColumnInsertion.ts`'s own `alignmentInsertionChange`
 * already establishes for a newly-inserted column's plain `---`. GFM
 * itself places no meaning on a delimiter cell's dash *count* beyond
 * "at least one" — `tableActivationNormalization.ts`'s own canonicalization
 * already recomputes visual dash width independently, so this function
 * doesn't need to.
 *
 * **`left` is not the same as "no explicit alignment."** `parseTableAlignment`
 * (`tableAlignment.ts`) already distinguishes a plain `---` cell (`null` —
 * GFM's own "no alignment specified" state, left to the renderer, which
 * happens to *default* to left-reading text but is not a left-alignment
 * declaration) from an explicit `:---` (`'left'` — a real, opinionated
 * declaration). This function only ever writes one of the three explicit
 * markers; it has no "clear back to plain `---`" mode, matching the
 * product's own current menu (`TableHandleMenu.tsx`'s "Align" submenu:
 * Left/Center/Right only) — see that component's own doc comment for the
 * open "expose a Default/clear option too" question this file deliberately
 * leaves unresolved rather than guessing at.
 *
 * Single-`ChangeSpec` transaction plus a `tableSelectionChanged` effect
 * re-affirming the *same* column index (alignment never moves which
 * column is selected) — identical shape to every other structural
 * operation in this feature, so undo/redo already comes for free from
 * `tableSelectionDeletion.ts`'s own generic `tableSelectionDeletionHistory()`
 * `invertedEffects` provider; no new history registration needed.
 */

function alignmentMarkerFor(alignment: TableColumnAlignment): string {
  if (alignment === 'left') {
    return ':---';
  }
  if (alignment === 'center') {
    return ':---:';
  }
  if (alignment === 'right') {
    return '---:';
  }
  return '---';
}

function alignmentChangeForColumn(alignRowFrom: number, alignRowTo: number, rawText: string, columnIndex: number, alignment: TableColumnAlignment): ChangeSpec | null {
  const cells = splitPipeRowCells(rawText);
  if (columnIndex >= cells.length) {
    return null;
  }
  const next = [...cells];
  next[columnIndex] = alignmentMarkerFor(alignment);
  return { from: alignRowFrom, to: alignRowTo, insert: '| ' + next.join(' | ') + ' |' };
}

function setColumnAlignment(view: EditorView, table: TableInfo, columnIndex: number, alignment: TableColumnAlignment): boolean {
  const navigableRows = getNavigableRows(table.node);
  const header = navigableRows[0];
  if (!header) {
    return false;
  }
  const headerColumnCount = getRowColumnSegments(header).length;
  if (columnIndex < 0 || columnIndex >= headerColumnCount) {
    return false;
  }
  const alignRow = header.nextSibling;
  if (!alignRow || !isAlignmentRow(alignRow)) {
    return false;
  }
  const change = alignmentChangeForColumn(alignRow.from, alignRow.to, view.state.sliceDoc(alignRow.from, alignRow.to), columnIndex, alignment);
  if (!change) {
    // The alignment row is never ragged relative to the header (a GFM
    // invariant `tableRowColumnMove.ts`'s own `alignmentRangeChange` doc
    // comment already relies on identically) — unreachable given the
    // bounds guard above, declines rather than guessing if it somehow
    // isn't.
    return false;
  }

  const changeSet = view.state.changes([change]);
  view.dispatch({
    changes: [change],
    selection: view.state.selection.map(changeSet),
    effects: [tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex })],
    scrollIntoView: true,
  });
  return true;
}

/** Exported for `TableHandleMenu.tsx`'s "Align" submenu — `false` (a no-op) for a non-`column` selection or a table that can no longer be found, mirroring every other menu-facing entry point in this feature's own return-`boolean` contract. */
export function setSelectedColumnAlignment(view: EditorView, selection: TableSelection, alignment: TableColumnAlignment): boolean {
  if (selection.kind !== 'column') {
    return false;
  }
  const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return false;
  }
  return setColumnAlignment(view, table, selection.columnIndex, alignment);
}

/** Exported for `TableHandleMenu.tsx`'s own "which leaf is the current alignment" highlighting (`OverflowMenuSubmenuItemConfig.selected`) — resolves `selection`'s own table/column and reads its current marker via the same `parseTableAlignment` the rendering pipeline (`tableWidgetField.ts`) already uses, so the menu can never disagree with what the table is actually showing. `null` for a non-`column` selection, a table/column that can no longer be resolved, or a table with no delimiter row at all (malformed, or mid-edit) — every case where there's nothing to report, mirroring this module's `resolveXMoveAvailability`-style siblings' own `null`-means-"nothing to compute" convention. */
export function resolveColumnAlignment(view: EditorView, selection: TableSelection): TableColumnAlignment | null {
  if (selection.kind !== 'column') {
    return null;
  }
  const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return null;
  }
  const header = getNavigableRows(table.node)[0];
  if (!header) {
    return null;
  }
  const alignRow = header.nextSibling;
  if (!alignRow || !isAlignmentRow(alignRow)) {
    return null;
  }
  const alignments = parseTableAlignment(view.state.sliceDoc(alignRow.from, alignRow.to));
  return alignments[selection.columnIndex] ?? null;
}
