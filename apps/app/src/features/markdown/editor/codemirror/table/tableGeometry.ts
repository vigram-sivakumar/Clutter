import { syntaxTree } from '@codemirror/language';
import type { EditorState, SelectionRange } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

/**
 * Shared table syntax-tree/geometry primitives — rendering-mechanism-
 * agnostic by design (per ADR-034, retained across the table rewrite; see
 * docs/table-implementation-plan.md). Originally extracted so the old CSS-
 * table implementation's caret keymaps/guards (deleted 2026-09-17 as ADR-034
 * migration prep) could all reuse one tree-walking notion of "which cell/row
 * is this position in" rather than re-deriving it independently — see
 * docs/editor-architecture-decisions.md's table-investigation entries for
 * the fuller rationale behind delimiter-position-based (not
 * `TableCell`-node-based) addressing. Purely read-only queries over the
 * syntax tree; no state of their own.
 */

/** Standard "move element" permutation: returns a new array where the item at `from` (an index into `arr`) has been relocated to `to`, and everything between shifts to make room — `O(arr.length)`, no aliasing of `arr` itself. Lives here (rather than in `tableRowColumnMove.ts`, its original single consumer) so `tableColumnWidthMetadata.ts` can reuse the exact same permutation for a moved column's own width array without a circular import between the two feature modules. */
export function arrayMove<T>(arr: readonly T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}

export function findEnclosingTable(state: EditorState, pos: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolve(pos, 1);
  while (node && node.name !== 'Table') {
    node = node.parent;
  }
  return node;
}

export interface TableInfo {
  readonly node: SyntaxNode;
  readonly from: number;
  readonly to: number;
}

/** Every `Table` node in the document, in document order — the rendering-mechanism-agnostic enumeration `tableWidgetField.ts` (Architecture E, docs/table-implementation-plan.md) needs to build one block decoration per table. Same tree-walk pattern as every other whole-document scan in this codebase (e.g. `blockSeparatorDecoration.ts`'s `syntaxTree(state).iterate(...)`), just collecting `Table` nodes instead of computing per-node decorations. */
export function findAllTables(state: EditorState): TableInfo[] {
  const tables: TableInfo[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === 'Table') {
        tables.push({ node: node.node, from: node.from, to: node.to });
      }
    },
  });
  return tables;
}

/** The table whose own `.from` is exactly `pos` — `null` if no table starts there. Used by `blockSeparatorDecoration.ts` to tag the separator immediately above a table with that table's own position (for its click-to-insert-a-line-above affordance), without that file needing its own tree-walk. */
export function findTableStartingAt(state: EditorState, pos: number): TableInfo | null {
  const table = findEnclosingTable(state, pos);
  return table && table.from === pos ? { node: table, from: table.from, to: table.to } : null;
}

export interface RowColumnSegment {
  /** Untrimmed source bounds of this column's own cell content within `row`. */
  readonly rawFrom: number;
  readonly rawTo: number;
  /** The `TableDelimiter` immediately to this column's left, or `null` at a row's own leading edge when it has no pipe there. */
  readonly leftDelimiter: SyntaxNode | null;
  /** The `TableDelimiter` immediately to this column's right, or `null` at a row's own trailing edge when it has no pipe there. */
  readonly rightDelimiter: SyntaxNode | null;
}

/**
 * Every column's raw (untrimmed) source segment in `row`, left to right,
 * alongside the `TableDelimiter` node(s) bounding it on each side — the
 * shared column-splitting primitive both `rowCells` (`tableWidgetField.ts`,
 * cell rendering/trimming) and structural column deletion
 * (`tableSelectionDeletion.ts`) build on, rather than each re-deriving
 * GFM's "leading/trailing pipes are optional" rule independently. Splits on
 * every `TableDelimiter` present, however many there are (including zero —
 * a pipe-less absorbed row, one segment spanning the whole row with `null`
 * delimiters on both sides), which is what correctly handles the two
 * under-pipe-count shapes documented on `rowCells` itself: no leading/
 * trailing pipe, and no pipe at all.
 */
export function getRowColumnSegments(row: SyntaxNode): RowColumnSegment[] {
  const delimiters: SyntaxNode[] = [];
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name === 'TableDelimiter') {
      delimiters.push(child);
    }
  }
  if (delimiters.length === 0) {
    return [{ rawFrom: row.from, rawTo: row.to, leftDelimiter: null, rightDelimiter: null }];
  }
  const segments: RowColumnSegment[] = [];
  const first = delimiters[0]!;
  if (first.from > row.from) {
    segments.push({ rawFrom: row.from, rawTo: first.from, leftDelimiter: null, rightDelimiter: first });
  }
  for (let i = 0; i < delimiters.length - 1; i++) {
    segments.push({ rawFrom: delimiters[i]!.to, rawTo: delimiters[i + 1]!.from, leftDelimiter: delimiters[i]!, rightDelimiter: delimiters[i + 1]! });
  }
  const last = delimiters[delimiters.length - 1]!;
  if (last.to < row.to) {
    segments.push({ rawFrom: last.to, rawTo: row.to, leftDelimiter: last, rightDelimiter: null });
  }
  return segments;
}

/**
 * Whether a **non-collapsed** root selection range genuinely overlaps
 * `table`'s own `[from, to)` source range — used by `tableWidgetField.ts`
 * to decide whether a table should show the same visual "selected" halo
 * `tableDeletionSelection.ts`'s whole-table arm/delete state already
 * paints via `.cm-table-wrapper-selected` (`tableWidget.ts`'s own
 * `isSelected`). Deliberately an *open-interval* overlap test
 * (`range.from < table.to && range.to > table.from`), not the inclusive
 * `<=`/`>=` `tableRootSelectionSnap.ts` uses for its own boundary check:
 * that file is deciding "is this endpoint an unsafe place to rest a
 * caret," where touching `table.from`/`table.to` exactly is already
 * unsafe; this is deciding "does the selection actually cover some of the
 * table's own characters," where a selection that merely starts exactly
 * at `table.to` (touching, not covering) must not be treated as including
 * the table it doesn't actually span into. `range.empty` (a collapsed
 * caret) is excluded outright — CM6's `tableRootSelectionSnap` already
 * guarantees a collapsed caret is never `>= table.from && <= table.to` in
 * the first place (see that file's own doc comment), so this exclusion is
 * a defensive restatement of an invariant enforced elsewhere, not a new
 * one: this halo is for a genuine *selection*, never a caret position.
 */
export function tableIntersectsSelectionRange(range: SelectionRange, table: TableInfo): boolean {
  return !range.empty && range.from < table.to && range.to > table.from;
}

/** The `TableHeader`/`TableRow`/alignment-row (`TableDelimiter` as a direct child of `Table`) containing `pos`, walking a table's direct children the same way any table renderer needs to. */
export function findEnclosingRow(table: SyntaxNode, pos: number): SyntaxNode | null {
  const header = table.firstChild;
  if (!header || header.name !== 'TableHeader') {
    return null;
  }
  if (pos >= header.from && pos <= header.to) {
    return header;
  }
  const alignRow = header.nextSibling;
  if (!alignRow || alignRow.name !== 'TableDelimiter') {
    return null;
  }
  if (pos >= alignRow.from && pos <= alignRow.to) {
    return alignRow;
  }
  for (let row = alignRow.nextSibling; row; row = row.nextSibling) {
    if (row.name === 'TableRow' && pos >= row.from && pos <= row.to) {
      return row;
    }
  }
  return null;
}

export interface CellBounds {
  readonly leftDelimiterTo: number;
  readonly rightDelimiterFrom: number;
  /**
   * `true` only for a bounds entry synthesized by `getRectangularRowCellBounds`
   * for a column a ragged row has no real delimiters for yet — collapsed at
   * the row's own `.to`, not a real, addressable source range. A genuinely
   * empty *real* cell (`| |`, or even the tightest `||`) never sets this,
   * even though its own `leftDelimiterTo`/`rightDelimiterFrom` can likewise
   * be equal — `synthetic` is the only reliable signal, never inferred from
   * position equality alone. Any caller about to *write* through a bounds
   * value (not just read/render it) must check this first — see
   * `tableRectangularNormalization.ts`'s own `ensureRectangularCellBounds`.
   */
  readonly synthetic?: boolean;
}

/** The column-gap `[leftDelimiter.to, rightDelimiter.from)` containing `pos`, or `null` if `pos` isn't between two `TableDelimiter` children of `row` (i.e. it's at the row's own leading/trailing edge, or `row` has no delimiter children at all — true of the alignment row, which is one opaque leaf `TableDelimiter`). Works identically for a populated or a fully empty cell, since it never consults `TableCell`. */
export function findEnclosingCellBounds(row: SyntaxNode, pos: number): CellBounds | null {
  let prevDelimiterTo: number | null = null;
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'TableDelimiter') {
      continue;
    }
    if (prevDelimiterTo !== null && pos >= prevDelimiterTo && pos <= child.from) {
      return { leftDelimiterTo: prevDelimiterTo, rightDelimiterFrom: child.from };
    }
    prevDelimiterTo = child.to;
  }
  return null;
}

/** Every column's bounds in `row`, left to right — the array form of `findEnclosingCellBounds`, needed by Step 2 to find the cell before or after a given one (not just the one containing a position). Empty for the alignment row (no delimiter children to pair up), which is exactly the desired "no cells to navigate between" outcome there — no special-casing needed. */
export function getRowCellBounds(row: SyntaxNode): CellBounds[] {
  const bounds: CellBounds[] = [];
  let prevDelimiterTo: number | null = null;
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'TableDelimiter') {
      continue;
    }
    if (prevDelimiterTo !== null) {
      bounds.push({ leftDelimiterTo: prevDelimiterTo, rightDelimiterFrom: child.from });
    }
    prevDelimiterTo = child.to;
  }
  return bounds;
}

/**
 * The rectangular-invariant counterpart to `getRowCellBounds`
 * (`docs/table-range-selection-clipboard-ux-contract.md`'s "CRITICAL TABLE
 * INVARIANT") — every table interaction (navigation, range selection,
 * rendering) must be able to address exactly `headerColumnCount` columns
 * in every row, never fewer, even when the row's own *source* is currently
 * ragged (GFM tolerates a row with fewer cells than the header — a real,
 * still-supported source shape, not something this function eliminates).
 * Missing trailing columns are padded with `synthetic: true` bounds
 * collapsed at `row.to` — a real, addressable (empty) logical cell for
 * every read-only consumer (rendering, navigation, selection geometry),
 * but never a range any caller may *write* through directly: `row.to` has
 * no real delimiters around it yet, so an edit anchored there would insert
 * raw, pipe-less text. A caller about to write through a resolved bounds
 * value must go through `tableRectangularNormalization.ts`'s own
 * `ensureRectangularCellBounds` first, which materializes the real source
 * cell(s) before handing back real (never synthetic) bounds.
 *
 * `getRowCellBounds(row)` itself stays completely unchanged and is still
 * the right choice for a caller that means "only the columns this row
 * actually, currently has" — `tableSelectionClear.ts`'s column/range
 * clearing, most notably, where a ragged row genuinely has nothing to
 * clear at a missing column and contributing no change for it is the
 * correct behavior, not a gap. This function is additive, opted into only
 * where "every logical column, always" is the actual requirement.
 */
export function getRectangularRowCellBounds(headerColumnCount: number, row: SyntaxNode): CellBounds[] {
  const bounds = getRowCellBounds(row);
  if (bounds.length >= headerColumnCount) {
    return bounds;
  }
  const padded = bounds.slice();
  while (padded.length < headerColumnCount) {
    padded.push({ leftDelimiterTo: row.to, rightDelimiterFrom: row.to, synthetic: true });
  }
  return padded;
}

/** The alignment/delimiter row (`| --- | ---: |`) is a single opaque `TableDelimiter` node — see `tableAlignment.ts`'s own doc comment — never a `TableHeader`/`TableRow`. */
export function isAlignmentRow(row: SyntaxNode): boolean {
  return row.name === 'TableDelimiter';
}

/** `pos` counts as "at the start" of `bounds` when only whitespace (or nothing) separates it from the cell's own left delimiter — not a bare `pos === leftDelimiterTo` equality, so a real space between `|` and the cell's text (`| Vik`) is still "the beginning of the cell" by the frozen UX's own wording. Also correctly covers a fully empty cell (the whole gap is blank, so every position in it counts as both start and end). */
export function isAtCellStart(state: EditorState, bounds: CellBounds, pos: number): boolean {
  return state.sliceDoc(bounds.leftDelimiterTo, pos).trim() === '';
}

/** Symmetric to `isAtCellStart`, from the right delimiter. */
export function isAtCellEnd(state: EditorState, bounds: CellBounds, pos: number): boolean {
  return state.sliceDoc(pos, bounds.rightDelimiterFrom).trim() === '';
}

/** The position right after any leading whitespace in `bounds` — i.e. where real content starts, or `bounds.rightDelimiterFrom` if the cell is empty/all-whitespace (there's no real content to land before). */
export function startOfCellContent(state: EditorState, bounds: CellBounds): number {
  const text = state.sliceDoc(bounds.leftDelimiterTo, bounds.rightDelimiterFrom);
  return bounds.leftDelimiterTo + (text.length - text.trimStart().length);
}

/** Symmetric to `startOfCellContent`: the position right before any trailing whitespace, or `bounds.leftDelimiterTo` if the cell is empty/all-whitespace. */
export function endOfCellContent(state: EditorState, bounds: CellBounds): number {
  const text = state.sliceDoc(bounds.leftDelimiterTo, bounds.rightDelimiterFrom);
  return bounds.rightDelimiterFrom - (text.length - text.trimEnd().length);
}

/** Shared precondition for every table keymap guard: a collapsed caret, in an editable view, actually inside a table row. Bails (`null`) the instant any of that isn't true, so the overwhelming common case (no table nearby) is as cheap as one failed tree-resolve. `table` is included alongside `row`/`pos` (Step 3 needs it, to read the header's own canonical column count) — purely additive over Steps 1/2's own destructuring of just `{ row, pos }`, so this doesn't change their behavior. */
export function resolveTableRowAtCursor(view: EditorView): { table: SyntaxNode; row: SyntaxNode; pos: number } | null {
  const { state } = view;
  if (state.readOnly) {
    return null;
  }
  const range = state.selection.main;
  if (!range.empty) {
    return null;
  }
  const pos = range.head;
  const table = findEnclosingTable(state, pos);
  if (!table) {
    return null;
  }
  const row = findEnclosingRow(table, pos);
  if (!row) {
    return null;
  }
  return { table, row, pos };
}

/** The index into `getRowCellBounds(row)` whose gap contains `pos`, or `-1` if `pos` isn't inside any column of `row` (its own leading/trailing edge, or a row — like the alignment row — with no columns at all). Shared by Step 2 (find the neighboring cell) and Step 3 (find which column to recreate in the new row). */
export function findCellIndexAt(rowBounds: readonly CellBounds[], pos: number): number {
  return rowBounds.findIndex((b) => pos >= b.leftDelimiterTo && pos <= b.rightDelimiterFrom);
}

/** Every row a user can actually navigate/edit cells in, in row-major document order: the header, then every `TableRow` — the alignment row is never included (it has no cells, per `getRowCellBounds`). Shared by Step 3 (decide whether Enter fired in the header) and Step 4 (flatten the whole table into one row-major cell sequence for Tab/Shift-Tab). */
export function getNavigableRows(table: SyntaxNode): SyntaxNode[] {
  const header = table.firstChild;
  if (!header || header.name !== 'TableHeader') {
    return [];
  }
  const rows: SyntaxNode[] = [header];
  const alignRow = header.nextSibling;
  if (!alignRow || alignRow.name !== 'TableDelimiter') {
    return rows;
  }
  for (let row = alignRow.nextSibling; row; row = row.nextSibling) {
    if (row.name === 'TableRow') {
      rows.push(row);
    }
  }
  return rows;
}

/** Raw Markdown text for a brand-new, fully empty row with `columnCount` columns — e.g. `| | |` for two columns. */
export function buildEmptyRowText(columnCount: number): string {
  return '|' + ' |'.repeat(columnCount);
}

/** The position, local to a string built by `buildEmptyRowText`, that sits inside column `columnIndex`'s own (single-space, empty) cell. */
export function emptyRowCellOffset(columnIndex: number): number {
  return columnIndex * 2 + 1;
}

/**
 * The width-matched counterpart to `buildEmptyRowText`: a brand-new row
 * whose column `j` cell is `padCellContent('', widths[j])` — every column
 * padded out to its own already-established target width (e.g. the
 * header's own column width) rather than `buildEmptyRowText`'s uniform
 * single space. Used where a row must line up under a specific already-
 * computed per-column width (table-activation seeding); `buildEmptyRowText`
 * itself is untouched and still used wherever a uniform, unformatted blank
 * row is the correct shape (e.g. `tableCellNavigation.ts`'s Enter-creates-
 * a-row).
 */
export function buildWidthMatchedRowText(widths: readonly number[]): string {
  return '|' + widths.map((width) => padCellContent('', width) + '|').join('');
}

/** The position, local to a string built by `buildWidthMatchedRowText`, that sits inside column `columnIndex`'s own cell content start — right after its leading padding space, mirroring `emptyRowCellOffset`'s own "content start, not raw start" contract. */
export function widthMatchedRowCellOffset(widths: readonly number[], columnIndex: number): number {
  let offset = 1;
  for (let i = 0; i < columnIndex; i++) {
    offset += widths[i]! + 1;
  }
  return offset + 1;
}

/**
 * `" " + content + " ".repeat(trailing)"` — a cell's real, logical
 * `content` reconstructed into a full `<padding>content<padding>` gap of
 * at least `minGapWidth` characters (never narrower than the gap already
 * was; only ever wider, when `content` itself overflows it). Always at
 * least one leading and one trailing space, even when `content` is empty
 * (an emptied/never-filled cell stays a genuine, structurally padded
 * blank gap, not a bare `""`) — `1 + content.length + 1` is the true
 * floor `minGapWidth` is clamped up to.
 *
 * The one place this "rebuild the whole gap, don't patch around inside
 * it" reconstruction lives — `TableActiveCellController.forwardToRoot`'s
 * own fix for the padding-loss bug this exists to close: a nested cell
 * editor holds only trimmed logical content (never the surrounding
 * padding, per this codebase's own "nested editor is content-only"
 * contract), so translating its edits back into the root Markdown can
 * never be a plain incremental position-forward — the padding lives
 * entirely outside what the nested editor even knows about, and must be
 * reconstructed fresh around whatever content it currently holds, not
 * patched into place at a fixed offset that assumed content already
 * started at a `content`-shaped boundary.
 */
export function padCellContent(content: string, minGapWidth: number): string {
  const targetWidth = Math.max(minGapWidth, content.length + 2);
  const trailing = targetWidth - content.length - 1;
  return ' ' + content + ' '.repeat(trailing);
}

/**
 * Where a brand-new row should be inserted immediately after `row` (the
 * table's own header or one of its `TableRow`s) — or `null` if `row` isn't
 * a valid target (the alignment row itself, or a malformed table with no
 * delimiter row). For a `TableRow`, this is simply the row's own `.to`.
 * For the header, it is deliberately the delimiter/alignment row's own
 * `.to`, **not** the header's own `.to` — GFM requires the delimiter row
 * to be the header's very next line, so inserting directly after the
 * header would immediately invalidate the table (the same class of
 * corruption Step 1 exists to prevent, reached from a different key).
 * Shared by Step 3 (Enter in the header) and Step 4 (Tab creating a new
 * row when the header is the table's only navigable row).
 */
export function insertRowAfterPosition(row: SyntaxNode): number | null {
  if (row.name === 'TableRow') {
    return row.to;
  }
  if (row.name === 'TableHeader') {
    const alignRow = row.nextSibling;
    if (!alignRow || alignRow.name !== 'TableDelimiter') {
      return null;
    }
    return alignRow.to;
  }
  return null;
}

export interface LogicalCell {
  readonly table: SyntaxNode;
  readonly row: SyntaxNode;
  /** Index into `getNavigableRows(table)` — the table's own logical row number. The alignment row can never produce a `LogicalCell` at all (see below), so this is always a real header/data row. */
  readonly rowIndex: number;
  /** Index into `getRowCellBounds(row)` — the table's own logical column number. */
  readonly columnIndex: number;
  readonly bounds: CellBounds;
}

/**
 * Resolves a document position to its logical `(rowIndex, columnIndex)`
 * table coordinate — the invariant every table interaction (Steps 2–5 so
 * far) is built on. This is deliberately syntax-tree-only: it never reads
 * a pixel position, a rendered layout, or anything from `EditorView` —
 * only `EditorState` and the parse tree. That's what keeps table
 * interaction semantics stable across a rendering change: the old CSS-table
 * rendering that once consumed this was deleted per ADR-034 (2026-09-17),
 * and a table is currently unrendered raw Markdown pending the Architecture
 * E rewrite (docs/table-implementation-plan.md); whatever rendering
 * approach lands, this function's contract — and everything built on it —
 * does not need to change, because it was never coupled to how the table
 * *looks* in the first place.
 *
 * Returns `null` when `pos` isn't inside a table at all, or isn't
 * resolvable to one specific cell — the alignment row (never a valid
 * `LogicalCell`: it has no columns, per `getRowCellBounds`, so it can
 * never be assigned a `rowIndex` either) or a row's own leading/trailing
 * edge outside any cell.
 */
export function resolveLogicalCell(state: EditorState, pos: number): LogicalCell | null {
  const table = findEnclosingTable(state, pos);
  if (!table) {
    return null;
  }
  const row = findEnclosingRow(table, pos);
  if (!row) {
    return null;
  }
  const navigableRows = getNavigableRows(table);
  const rowIndex = navigableRows.findIndex((r) => r.from === row.from);
  if (rowIndex === -1) {
    return null;
  }
  const rowBounds = getRowCellBounds(row);
  const columnIndex = findCellIndexAt(rowBounds, pos);
  const bounds = rowBounds[columnIndex];
  if (!bounds) {
    return null;
  }
  return { table, row, rowIndex, columnIndex, bounds };
}

/**
 * The inverse of `resolveLogicalCell`: given a table and a logical
 * `(rowIndex, columnIndex)` coordinate, returns that cell's own row and
 * bounds. `columnIndex` addresses the table's own header-defined column
 * space (`getRectangularRowCellBounds`), not just whatever a ragged row
 * happens to currently have — a genuinely missing column returns a
 * `synthetic` bounds (see that function's own doc comment), not the
 * *wrong* real one. `null` only when `rowIndex` is out of range or the
 * table has no header at all to define a column space against.
 *
 * **Changed from an earlier "clamp to the row's own last real column"
 * behavior** — the rectangular-invariant milestone's own finding: clamping
 * silently landed vertical navigation (`tableCellNavigation.ts`'s
 * `moveOrExitVertical`) on the *wrong* column for a ragged row instead of a
 * genuinely empty one at the *requested* index, which is what every other
 * navigation command in this table already treats an empty cell as. Every
 * caller resolving a `synthetic` result through to an actual cell
 * activation must materialize it first — see
 * `tableRectangularNormalization.ts`'s own `ensureRectangularCellBounds`.
 */
export function resolveCellAt(table: SyntaxNode, rowIndex: number, columnIndex: number): { row: SyntaxNode; bounds: CellBounds } | null {
  const row = getNavigableRows(table)[rowIndex];
  if (!row) {
    return null;
  }
  const header = getNavigableRows(table)[0];
  const headerColumnCount = header ? getRowCellBounds(header).length : 0;
  const bounds = getRectangularRowCellBounds(headerColumnCount, row)[columnIndex];
  if (!bounds) {
    return null;
  }
  return { row, bounds };
}

/**
 * Whether Backspace at `pos` would delete the newline separating some
 * `Table` from whatever follows it (a freshly-created blank line, an
 * existing paragraph, …), merging them into the table. That newline sits
 * at document position `pos - 1` (Backspace deletes `sliceDoc(pos - 1,
 * pos)`) — confirmed empirically against the installed parser: a table's
 * own `.to` never extends to include its trailing newline (nor, for a
 * table ending at the very end of the document, is a lone final newline
 * absorbed into it either), so the check must resolve the tree at `pos -
 * 1` — a position genuinely inside/at the table's own range — not at
 * `pos` itself, which sits one character *outside* it; resolving at `pos`
 * and walking up parents could never reach a *sibling* `Table` node, only
 * ancestors of whatever block starts after it.
 *
 * Deliberately independent of `resolveTableRowAtCursor`/`findEnclosingTable`:
 * the caret here is *outside* the table entirely, not inside one of its
 * rows, which is exactly why the table's own row/cell boundary checks
 * never catch this — confirmed as a real, reproducible bug: one Backspace
 * press from the empty line immediately below a table deleted that line
 * outright, landing the caret back inside the table's own last cell with
 * no protection engaged at any point.
 */
export function isImmediatelyAfterTable(state: EditorState, pos: number): boolean {
  if (pos < 1) {
    return false;
  }
  let node: SyntaxNode | null = syntaxTree(state).resolve(pos - 1, -1);
  while (node) {
    if (node.name === 'Table' && node.to === pos - 1) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

/**
 * Symmetric to `isImmediatelyAfterTable`: whether Delete at `pos` would
 * delete the newline separating whatever precedes some `Table` from its
 * own first (header) line — that newline sits at `pos` itself (Delete
 * deletes `sliceDoc(pos, pos + 1)`), and the table's own `.from` is one
 * past it, at `pos + 1` — so this resolves the tree at `pos + 1` (inside
 * the table's own range), not at `pos`.
 */
export function isImmediatelyBeforeTable(state: EditorState, pos: number): boolean {
  if (pos >= state.doc.length) {
    return false;
  }
  let node: SyntaxNode | null = syntaxTree(state).resolve(pos + 1, 1);
  while (node) {
    if (node.name === 'Table' && node.from === pos + 1) {
      return true;
    }
    node = node.parent;
  }
  return false;
}
