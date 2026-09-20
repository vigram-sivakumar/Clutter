import { Prec, type ChangeSpec, type EditorState, type Extension } from '@codemirror/state';
import { keymap, type Command, type EditorView, type KeyBinding } from '@codemirror/view';

import type { SyntaxNode } from '@lezer/common';

import { findAllTables, getNavigableRows, getRowCellBounds, padCellContent, type CellBounds, type TableInfo } from './tableGeometry';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';

/**
 * Backspace/Delete over a `TableSelection` (`tableSelection.ts`) now clears
 * the selected cells' own content in place — it never removes a row/column
 * (that's the older, still fully-intact behavior in
 * `tableSelectionDeletion.ts`, kept exactly as-is for a future row/column-
 * handle menu to call directly; see this module's own "why the structural
 * module is untouched" paragraph below). This module owns exactly the new
 * keyboard semantics; it does not touch, replace, or duplicate anything in
 * `tableSelectionDeletion.ts`.
 *
 * **Why the structural module is untouched.** `tableSelectionDeletion.ts`'s
 * `deleteSelectedRow`/`deleteSelectedColumn`/`tableSelectionDeletionKeymap`/
 * `tableSelectionDeletionHistory` are the product's own explicitly-stated
 * future path ("Row/Column handle → menu → Delete row/column → existing
 * structural deletion") — this milestone only stops *wiring*
 * `tableSelectionDeletionKeymap()` to Backspace/Delete in
 * `buildEditorExtensions.ts`, swapping in `tableSelectionClearKeymap()`
 * (below) at that same keyboard position instead. The structural functions
 * themselves, and their own test file, stay exactly as they were — nothing
 * here calls or reimplements them.
 *
 * **Reuses the existing undo/redo history mechanism, not a second one.**
 * `tableSelectionDeletionHistory()` (`tableSelectionDeletion.ts`) is a plain
 * `invertedEffects` provider with no dependency on *which* module produced
 * the transaction — it fires for any transaction carrying real `changes`
 * plus a `tableSelectionChanged` effect, regardless of source. This
 * module's own `dispatchClear` always includes both, so the identical
 * already-installed provider (see `buildEditorExtensions.ts`) already
 * threads this feature's own undo/redo correctly, with no new
 * `invertedEffects` registration needed here.
 *
 * **Clearing never remaps through `tableSelection.ts`'s own
 * `remapTableSelection`.** That function's own `range` branch is
 * conservative-null (`tableSelection.ts`'s own doc comment: "not produced
 * by any code path yet" — stale now that `tableCellRangeSelection.ts`
 * exists, but out of this milestone's scope to fix generally). This module
 * sidesteps that gap entirely for its own transactions: `dispatchClear`
 * always passes an *explicit* `tableSelectionChanged` effect carrying the
 * exact same (unchanged) `TableSelection` value being cleared —
 * `tableSelectionField`'s own `update()` treats an explicit effect as
 * always authoritative, so the field never falls through to
 * `remapTableSelection` for a clear transaction (forward, undo, or redo:
 * see the history paragraph above) at all. Row/column/range indices never
 * need remapping here regardless, since clearing content never inserts or
 * removes a row/column — the selection is, and stays, the exact same
 * value.
 *
 * **Blanking a cell, not deleting its gap.** Every cleared cell's full
 * `[leftDelimiterTo, rightDelimiterFrom)` gap (`getRowCellBounds`) is
 * replaced with `padCellContent('', gapWidth)` (`tableGeometry.ts`) — the
 * same "rebuild the whole gap, don't patch inside it" primitive
 * `TableActiveCellController.forwardToRoot` already uses for the identical
 * reason (a cell's padding is reconstructed around its content, never
 * assumed to already be shaped a particular way) — preserving the gap's
 * existing width (so unrelated columns' alignment in the raw source isn't
 * disturbed) rather than collapsing it to a single space or an empty
 * string. A cell whose gap is already blank/whitespace-only is left
 * untouched (no `ChangeSpec` emitted for it at all) — "clear" the same
 * content twice is a true no-op, not a same-text replacement that would
 * otherwise still register as a pointless undo step.
 */

/** `null` when `bounds`'s own gap is already blank (whitespace-only, including a genuinely empty gap) — nothing to clear. Otherwise the same-width blank replacement (`padCellContent`'s own doc comment). */
function blankCellChange(state: EditorState, bounds: CellBounds): ChangeSpec | null {
  const gapWidth = bounds.rightDelimiterFrom - bounds.leftDelimiterTo;
  const current = state.sliceDoc(bounds.leftDelimiterTo, bounds.rightDelimiterFrom);
  if (current.trim() === '') {
    return null;
  }
  return { from: bounds.leftDelimiterTo, to: bounds.rightDelimiterFrom, insert: padCellContent('', gapWidth) };
}

/** Every non-empty cell in `row` — used for a `row`-kind selection, which always clears every column of its own one row (ragged rows naturally contribute fewer changes, per `getRowCellBounds`'s own per-row cell count). */
function rowClearChanges(state: EditorState, row: SyntaxNode): ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  for (const bounds of getRowCellBounds(row)) {
    const change = blankCellChange(state, bounds);
    if (change) {
      changes.push(change);
    }
  }
  return changes;
}

/** Every non-empty cell at `columnIndex` across every navigable row (header included — a column selection clears its own header cell too, per the product's own column-selection example) — a ragged row with no cell at `columnIndex` simply contributes nothing, the same "preserve ragged rows" reading `tableSelectionDeletion.ts`'s own column deletion already uses. */
function columnClearChanges(state: EditorState, table: TableInfo, columnIndex: number): ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  for (const row of getNavigableRows(table.node)) {
    const bounds = getRowCellBounds(row)[columnIndex];
    if (!bounds) {
      continue;
    }
    const change = blankCellChange(state, bounds);
    if (change) {
      changes.push(change);
    }
  }
  return changes;
}

/** Every non-empty cell inside the rectangular `[minRow, maxRow] × [minCol, maxCol]` range (anchor/head already normalized by the caller, `clearTableSelection`, into min/max order — this function itself takes no position on direction). Row 0 (the header) is a perfectly valid member of a range, unlike the dedicated `row` kind, which structurally excludes it (`TableSelection`'s own doc comment) — a range's own `anchor`/`head` coordinates carry no such restriction. */
function rangeClearChanges(state: EditorState, table: TableInfo, minRow: number, maxRow: number, minCol: number, maxCol: number): ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  const navigableRows = getNavigableRows(table.node);
  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex++) {
    const row = navigableRows[rowIndex];
    if (!row) {
      continue;
    }
    const rowBounds = getRowCellBounds(row);
    for (let col = minCol; col <= maxCol; col++) {
      const bounds = rowBounds[col];
      if (!bounds) {
        continue;
      }
      const change = blankCellChange(state, bounds);
      if (change) {
        changes.push(change);
      }
    }
  }
  return changes;
}

/**
 * Always dispatches the *same* `selection` value back via
 * `tableSelectionChanged` — clearing content never changes what's selected
 * (this milestone's own explicit requirement) — alongside an explicit root
 * `selection` (`view.state.selection.map(...)`, required for
 * `tableRootSelectionSnap`'s own transaction filter to actually inspect it;
 * see `tableSelectionDeletion.ts`'s `dispatchDeletion` for the identical
 * reasoning) so the root caret, wherever it already was — never inside this
 * table, since a `TableSelection` being active means no cell is active
 * either — stays exactly, correctly, there.
 */
function dispatchClear(view: EditorView, changes: ChangeSpec[], selection: TableSelection): void {
  const changeSet = view.state.changes(changes);
  view.dispatch({
    changes,
    selection: view.state.selection.map(changeSet),
    effects: [tableSelectionChanged.of(selection)],
    scrollIntoView: true,
  });
}

/**
 * Exported for `tableCellNavigation.ts`'s own nested-editor keymap — the
 * active cell's nested editor can still hold real DOM focus at the exact
 * moment Backspace/Delete fires even after a row/column handle click has
 * already set `TableSelection` (`tableHandleOverlay.ts`'s own click
 * handlers deactivate the cell's *CM6-state* bookkeeping and unmount its
 * DOM, but never themselves move browser focus — see
 * `tableCellNavigation.ts`'s own doc comment on its Backspace/Delete
 * bindings for the full investigation). `tableSelectionClearKeymap()`
 * below and that nested binding both need the exact same "clear this
 * selection's cells" behavior; this is the one shared implementation
 * both call, never duplicated between them.
 */
export function clearTableSelection(view: EditorView, selection: TableSelection): boolean {
  const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return false;
  }

  let changes: ChangeSpec[];
  if (selection.kind === 'row') {
    const row = getNavigableRows(table.node)[selection.rowIndex];
    if (!row) {
      return false;
    }
    changes = rowClearChanges(view.state, row);
  } else if (selection.kind === 'column') {
    const header = getNavigableRows(table.node)[0];
    const headerColumnCount = header ? getRowCellBounds(header).length : 0;
    if (selection.columnIndex >= headerColumnCount) {
      return false;
    }
    changes = columnClearChanges(view.state, table, selection.columnIndex);
  } else {
    const minRow = Math.min(selection.anchor.row, selection.head.row);
    const maxRow = Math.max(selection.anchor.row, selection.head.row);
    const minCol = Math.min(selection.anchor.col, selection.head.col);
    const maxCol = Math.max(selection.anchor.col, selection.head.col);
    changes = rangeClearChanges(view.state, table, minRow, maxRow, minCol, maxCol);
  }

  // A `TableSelection` is active and valid, so this key is handled either
  // way — every cell already blank is a genuine no-op (nothing to clear),
  // never "fall through" to ordinary root-document Backspace/Delete or the
  // unrelated whole-table arm/delete state machine (`tableDeletionSelection.ts`).
  if (changes.length === 0) {
    return true;
  }
  dispatchClear(view, changes, selection);
  return true;
}

/**
 * `Prec.highest`, installed at the exact keyboard position
 * `tableSelectionDeletionKeymap()` previously held in
 * `buildEditorExtensions.ts` (see this module's own top doc comment) — same
 * "only ever fires when `TableSelection` is set" scoping, so it remains
 * mutually exclusive with `tableWholeDeletionKeymap()`'s own caret-adjacent
 * arm/delete machinery exactly as `tableSelectionDeletionKeymap()` already
 * was.
 */
export function tableSelectionClearKeymap(): Extension {
  const run: Command = (view) => {
    const selection = view.state.field(tableSelectionField, false) ?? null;
    if (!selection) {
      return false;
    }
    return clearTableSelection(view, selection);
  };

  const bindings: readonly KeyBinding[] = [
    { key: 'Backspace', run },
    { key: 'Delete', run },
  ];

  return Prec.highest(keymap.of(bindings));
}
