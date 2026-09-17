import { Prec, type EditorState, type Extension } from '@codemirror/state';
import { keymap, type Command, type KeyBinding } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { type CellBounds, endOfCellContent, findCellIndexAt, getNavigableRows, getRowCellBounds, isAtCellEnd, isAtCellStart, resolveTableRowAtCursor, startOfCellContent } from './tableGeometry';

/**
 * Step 2 of the frozen table UX, built around one explicit rule (see the
 * `atomicRanges` investigation this supersedes — recorded in
 * docs/editor-architecture-decisions.md's table-investigation entries):
 *
 * ```
 * current logical cell
 *        ↓
 * adjacent logical cell, in row-major order
 *        ↓
 * target exists?
 *    ├─ yes → resolve its logical content position and move there
 *    └─ no  → consume the arrow key and stay put
 * ```
 *
 * **Row-major across the whole table, not per-row.** Left/Right traverse
 * every logical cell of the entire table in one flattened sequence — the
 * header's own columns, then each data row's, left to right, top to
 * bottom — exactly the order `tableTabKeymap.ts` (Step 4) already
 * established for Tab/Shift-Tab. The last cell of a row continues directly
 * into the first cell of the next row; only the table's own first cell
 * (Left) and last cell (Right) are true dead ends. This module keeps its
 * own local flattening (`flattenNavigableCells`/`currentFlatIndex` below)
 * rather than importing `tableTabKeymap.ts`'s private (unexported)
 * versions — Tab is explicitly out of this task's scope, so nothing about
 * it is touched, including its own internal helpers.
 *
 * The caret must never fall back to native character-by-character movement
 * while crossing table structure — hidden Markdown syntax (outer `|`,
 * internal `|`, the padding spaces around a `|`, the hidden alignment row,
 * a whitespace-only empty-cell gap, a row-separating newline) must never
 * become a reachable intermediate position. `EditorView.atomicRanges` was
 * tried as an alternative to this file entirely and empirically confirmed
 * insufficient: it collapses a single hidden delimiter's own two raw
 * boundary positions into one, but has no notion of "cell" or "row" at
 * all, so it neither collapses the padding flanking a delimiter into the
 * same jump nor gives repeated presses row-major structure.
 *
 * **Every reachable position inside a real header/data row resolves to
 * *some* logical cell — there is no "can't resolve, defer to native" case
 * left for such a row.** Found by empirically tracing (not guessing) what
 * happens at a row's own outer edges — `row.from` (visually
 * indistinguishable from "the beginning of the first cell" once the
 * leading `|` is hidden, but a distinct raw position, reachable via `Home`
 * or a click at the row's leftmost pixel) and `row.to` (same story for
 * `End`/a click at the rightmost pixel). Traced against the real decorated
 * DOM: from `row.from`, repeated `ArrowLeft` previously walked character-
 * by-character *backward through the alignment row's own hidden text*
 * (`"| --- | --- | --- |"`) into the row above; a single `ArrowRight` from
 * the same position stepped one raw character into the row's own hidden
 * leading delimiter instead of jumping straight to the first cell's
 * content. From `row.to`, repeated `ArrowRight` walked forward through the
 * row's own hidden trailing delimiter, the newline, and into the *next*
 * row's hidden leading delimiter and real cell text. A bare
 * `findCellIndexAt` returns `-1` at both edges (neither is inside
 * `[leftDelimiterTo, rightDelimiterFrom]` for any column), which is what
 * let both commands fall through to native. `resolveArrowCell` below
 * closes this by clamping such an edge position to the row's first/last
 * column (with an explicit `before`/`after` flag) instead of failing to
 * resolve.
 *
 * **The alignment row is a logical cell resolution failure by design (it
 * has no columns, per `getRowCellBounds`), and that failure means
 * "consume, don't move," not "defer to native."** The caret genuinely
 * landing inside the alignment row at all is an unusual, not a primary,
 * path (nothing in `tableDecoration.ts` or the destinations this file
 * itself computes ever places it there — only a stray click or `Home`/
 * `End` executed while some other extension left the caret there could),
 * but per the "never fall back to native" rule it still needs an owned,
 * defined behavior rather than an unresolved gap.
 *
 * Reuses `tableGeometry.ts` in full (the same tree-walking
 * `tableDeletionGuard.ts` already established) rather than re-deriving
 * cell geometry — only the jump policy, the edge-clamping resolution, and
 * the row-major flattening are local to this file.
 *
 * **Only ever intercepts a collapsed selection** — a non-empty selection
 * defers entirely to native ArrowLeft/ArrowRight (which collapses to one
 * edge on a plain, non-extending arrow press, per `@codemirror/commands`'
 * own behavior). Never touches `Shift-ArrowLeft`/`Shift-ArrowRight` either:
 * CM6's keymap resolution matches those as distinct key strings from the
 * bare `ArrowLeft`/`ArrowRight` bound here (the same fact
 * `foldAwareArrowKeymap.ts` already relies on), so selection extension is
 * completely unaffected by this file.
 *
 * `Prec.highest` — above `foldAwareArrowKeymap.ts`'s own (default-
 * precedence) ArrowLeft/ArrowRight handling and `defaultKeymap`'s native
 * `cursorCharLeft`/`cursorCharRight`, so this guard is always asked first
 * regardless of extension-array order; it declines only for genuine
 * interior cell-content movement (real, visible, non-boundary characters),
 * where deferring to native is safe because no hidden syntax is adjacent.
 */

/**
 * A logical cell resolution for arrow-key purposes: `index` into
 * `getRowCellBounds(row)`, plus whether `pos` actually sits *before* the
 * first column's own bounds (the row's own leading hidden-delimiter zone)
 * or *after* the last column's own bounds (the row's own trailing
 * hidden-delimiter zone) rather than genuinely inside a column. Distinct
 * from `tableGeometry.ts`'s `resolveLogicalCell` (used by Tab/vertical
 * navigation, untouched by this file): that one returns `null` for exactly
 * the two edge positions this type exists to still resolve, one column
 * clamped to the nearest real column, because Left/Right's "never defer to
 * native near hidden syntax" contract is stricter than Tab/Up/Down's.
 */
interface ArrowCellResolution {
  readonly index: number;
  readonly before: boolean;
  readonly after: boolean;
}

/**
 * Resolves `pos` (already known, via `resolveTableRowAtCursor`, to sit
 * somewhere inside `row`'s own `[row.from, row.to]` span) to a logical
 * column. Returns `null` only for a row with no columns at all — the
 * alignment row, per `getRowCellBounds`'s own contract — since there is no
 * "nearest column" to clamp to there. For every real header/data row this
 * always succeeds: `findCellIndexAt`'s exact per-column bounds already
 * cover every position from the first column's own `leftDelimiterTo`
 * through the last column's own `rightDelimiterFrom` with no gap between
 * adjacent columns (a `TableDelimiter` is a real, non-empty span, so its
 * own `.from`/`.to` are the two bounds meeting there, never straddled by a
 * third position); the only positions an exact match can't cover are
 * `pos < rowBounds[0].leftDelimiterTo` (before the first column even
 * starts — clamped to column 0, `before: true`) and
 * `pos > rowBounds[last].rightDelimiterFrom` (after the last column ends —
 * clamped to the last column, `after: true`).
 */
function resolveArrowCell(rowBounds: readonly CellBounds[], pos: number): ArrowCellResolution | null {
  const first = rowBounds[0];
  if (!first) {
    return null; // No columns at all — the alignment row.
  }
  const exact = findCellIndexAt(rowBounds, pos);
  if (exact !== -1) {
    return { index: exact, before: false, after: false };
  }
  if (pos < first.leftDelimiterTo) {
    return { index: 0, before: true, after: false };
  }
  return { index: rowBounds.length - 1, before: false, after: true };
}

/**
 * Right into a whitespace-only (empty) cell needs its own entry-position
 * fix, kept local to this file. `startOfCellContent` — shared with
 * `tableVerticalKeymap.ts`'s Up/Down column landing, which this bug report
 * doesn't touch — skips leading whitespace to find where real content
 * starts; for a cell with *no* real content, that skip consumes the entire
 * gap and returns `bounds.rightDelimiterFrom` instead of stopping at
 * `bounds.leftDelimiterTo`. Confirmed empirically via `EditorView.domAtPos`
 * against the real decorated DOM: every position from `leftDelimiterTo` up
 * to (but not including) `rightDelimiterFrom` resolves *inside* the cell's
 * own `Decoration.mark` text node, while `rightDelimiterFrom` itself —
 * sitting immediately before the *next* `TableDelimiter`'s own hidden
 * `Decoration.replace` and its `cm-widgetBuffer` pair — resolves to the
 * row's line `<div>` directly, outside any cell mark. That's the exact
 * "caret on the border" bug: Right from a populated cell into an empty one
 * was landing on that ambiguous far edge. `endOfCellContent` (Left's own
 * destination function) already degenerates to `leftDelimiterTo` for the
 * same whitespace-only case by the symmetry of its own trailing-whitespace-
 * skip formula, which is exactly why Left into an empty cell was never
 * broken — only Right was. `forwardEntryPosition` below reproduces
 * `startOfCellContent`'s exact behavior for a cell with real content
 * (untouched) and only diverges for the whitespace-only case, so
 * populated-cell navigation is unaffected. Also reused, unchanged, as the
 * destination when `resolveArrowCell` reports `before: true` — jumping
 * forward from the row's own leading hidden-delimiter zone into the first
 * column needs exactly the same whitespace-only-cell handling.
 */
function forwardEntryPosition(state: EditorState, bounds: CellBounds): number {
  const text = state.sliceDoc(bounds.leftDelimiterTo, bounds.rightDelimiterFrom);
  if (text.trim() === '') {
    return bounds.leftDelimiterTo;
  }
  return startOfCellContent(state, bounds);
}

/**
 * One entry in the table's own logical cells, flattened row-major (the
 * header's columns, then each `TableRow`'s, in document order) — the same
 * ordering contract `tableTabKeymap.ts`'s own (private, unexported)
 * `flattenTable` establishes for Tab/Shift-Tab, kept as an independent
 * local copy here rather than a shared import so that file — explicitly
 * out of this task's scope — is never touched, not even by adding an
 * export to it.
 */
interface FlatCell {
  readonly row: SyntaxNode;
  readonly columnIndex: number;
  readonly bounds: CellBounds;
}

function flattenNavigableCells(table: SyntaxNode): FlatCell[] {
  const cells: FlatCell[] = [];
  for (const row of getNavigableRows(table)) {
    for (const [columnIndex, bounds] of getRowCellBounds(row).entries()) {
      cells.push({ row, columnIndex, bounds });
    }
  }
  return cells;
}

function currentFlatIndex(cells: readonly FlatCell[], row: SyntaxNode, columnIndex: number): number {
  return cells.findIndex((c) => c.row.from === row.from && c.columnIndex === columnIndex);
}

const tableArrowRight: Command = (view) => {
  const resolved = resolveTableRowAtCursor(view);
  if (!resolved) {
    return false;
  }
  const { table, row, pos } = resolved;
  const rowBounds = getRowCellBounds(row);
  const cell = resolveArrowCell(rowBounds, pos);
  if (!cell) {
    // No columns in this row at all — the alignment row. Never a
    // navigable destination; consume so native never steps through its
    // own fully-hidden interior.
    return true;
  }
  const current = rowBounds[cell.index];
  if (!current) {
    return true; // Unreachable: resolveArrowCell only ever returns a valid index into rowBounds.
  }
  if (cell.before) {
    // Before the first column's own bounds — this row's leading
    // hidden-delimiter zone. Jump straight into the first column's own
    // content (or its sole empty-cell position), never stepping through
    // the hidden leading delimiter one raw character at a time. Stays in
    // this same row — there is real content here to move into first.
    const destination = forwardEntryPosition(view.state, current);
    view.dispatch({ selection: { anchor: destination }, scrollIntoView: true, userEvent: 'select' });
    return true;
  }
  // `cell.after` means `pos` is already past this column's own bounds
  // (this row's trailing hidden-delimiter zone) — conceptually already at
  // this column's own end, so no further `isAtCellEnd` check is needed.
  if (!cell.after && !isAtCellEnd(view.state, current, pos)) {
    return false; // Ordinary interior movement — safe to defer to native.
  }
  const flatCells = flattenNavigableCells(table);
  const flatIndex = currentFlatIndex(flatCells, row, cell.index);
  if (flatIndex === -1) {
    return true; // Unreachable: `current` was itself resolved from this same row/column.
  }
  const next = flatCells[flatIndex + 1];
  if (!next) {
    // Last logical cell of the entire table — nothing further right;
    // consume so native never tunnels through trailing hidden syntax.
    return true;
  }
  const destination = forwardEntryPosition(view.state, next.bounds);
  view.dispatch({ selection: { anchor: destination }, scrollIntoView: true, userEvent: 'select' });
  return true;
};

const tableArrowLeft: Command = (view) => {
  const resolved = resolveTableRowAtCursor(view);
  if (!resolved) {
    return false;
  }
  const { table, row, pos } = resolved;
  const rowBounds = getRowCellBounds(row);
  const cell = resolveArrowCell(rowBounds, pos);
  if (!cell) {
    // The alignment row — see tableArrowRight's own comment.
    return true;
  }
  const current = rowBounds[cell.index];
  if (!current) {
    return true; // Unreachable: resolveArrowCell only ever returns a valid index into rowBounds.
  }
  if (cell.after) {
    // Past the last column's own bounds — this row's trailing
    // hidden-delimiter zone. Jump straight back into the last column's
    // own content end, never stepping through the hidden trailing
    // delimiter one raw character at a time. Stays in this same row —
    // there is real content here to move back into first.
    const destination = endOfCellContent(view.state, current);
    view.dispatch({ selection: { anchor: destination }, scrollIntoView: true, userEvent: 'select' });
    return true;
  }
  // `cell.before` means `pos` is already before this column's own bounds
  // (this row's leading hidden-delimiter zone) — conceptually already at
  // this column's own start, so no further `isAtCellStart` check is
  // needed.
  if (!cell.before && !isAtCellStart(view.state, current, pos)) {
    return false; // Ordinary interior movement — safe to defer to native.
  }
  const flatCells = flattenNavigableCells(table);
  const flatIndex = currentFlatIndex(flatCells, row, cell.index);
  if (flatIndex === -1) {
    return true; // Unreachable: `current` was itself resolved from this same row/column.
  }
  const previous = flatCells[flatIndex - 1];
  if (!previous) {
    // First logical cell of the entire table — nothing further left;
    // consume so native never tunnels through leading hidden syntax.
    return true;
  }
  const destination = endOfCellContent(view.state, previous.bounds);
  view.dispatch({ selection: { anchor: destination }, scrollIntoView: true, userEvent: 'select' });
  return true;
};

const tableArrowKeymapBindings: readonly KeyBinding[] = [
  { key: 'ArrowLeft', run: tableArrowLeft },
  { key: 'ArrowRight', run: tableArrowRight },
];

export function tableArrowKeymap(): Extension {
  return Prec.highest(keymap.of(tableArrowKeymapBindings));
}
