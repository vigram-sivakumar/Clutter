import type { ChangeSpec, EditorState } from '@codemirror/state';

import { arrayMove, findAllTables, getNavigableRows, getRowColumnSegments, type TableInfo } from './tableGeometry';

/**
 * Persistence model for table column-width presentation metadata — the
 * table-scoped counterpart to `mediaPresentation/mediaPresentationModel.ts`.
 * Widths live in a dedicated attribute line **immediately following** the
 * table's own last line, never inside the table's own Markdown source
 * range:
 *
 *   | Name | Role | City    |
 *   | ---- | ---- | ------- |
 *   | Vik  | UI   | Chennai |
 *   {table-col-widths="120,80,240"}
 *
 * This keeps the table's own GFM grammar (header/delimiter/body rows)
 * completely unmodified. Two facts already true of the existing table code
 * — neither added by this module — are what make that safe:
 * `tableGeometry.ts`'s own `isImmediatelyAfterTable` doc comment records
 * that a `Table` node's `.to` never extends to include a trailing line, and
 * `tableLazyAbsorptionGuard.ts` already ends a table's leaf the moment a
 * following line has no unescaped pipe — which this attribute line, by
 * construction, never does. So the attribute line is excluded from both the
 * table's own parsed range and from lazy-row absorption for reasons that
 * predate and are independent of this module; nothing in `tableGeometry.ts`
 * or the normalization modules needed to change to support it.
 *
 * **Values are absolute integer pixel widths, not the 1–11 proportional
 * encoding `mediaPresentationModel.ts` uses for images.** That encoding
 * exists there to distinguish "proportional share of available width" from
 * "literal pixels" for a construct that defaults to filling its container.
 * A table column has no such default-fill behavior to distinguish from — a
 * persisted width here is always a literal, user-resized pixel value, so
 * reusing the dual-bucket encoding would import a distinction this data has
 * no use for.
 *
 * Independent of any resize UI: this module only parses, serializes,
 * validates, and associates a table's already-persisted width array with
 * its own preceding table, plus computes how that array must change when a
 * column is inserted/duplicated/moved/deleted, or (`materializeWidthsForResize`)
 * first resized. It has no opinion on drag gestures or rendering — no
 * pointer/keyboard interaction lives here, this milestone or otherwise.
 *
 * **Invariant: a valid attribute has exactly one width per logical column.**
 * `resolveTableColumnWidths` enforces this itself — a count mismatch (stale
 * metadata left behind by an edit that predates this module, or hand-edited
 * Markdown) is treated exactly like malformed syntax: the whole attribute is
 * invalid, `null`, and the table falls back to automatic sizing. Never a
 * partial/best-effort array — a table's widths are either every column
 * explicit, or no attribute at all; `{table-col-widths=",,320"}` (one
 * explicit value, the rest blank) is never a representation this module
 * produces or accepts.
 *
 * **Implicit vs. explicit width.** A column with no attribute at all has an
 * *implicit* width of `DEFAULT_TABLE_COLUMN_WIDTH` — nothing is persisted
 * for it, the same "default means absent" precedent
 * `mediaPresentationModel.ts`'s own `serializeImagePresentationTokens`
 * already establishes for images ("returns `''`... when every field is
 * already default"). The *first* resize of any column is what converts a
 * table from implicit to *explicit*: at that moment every column, not just
 * the one resized, needs a real persisted value — `materializeWidthsForResize`
 * is the one place that conversion happens, producing a complete array in a
 * single step. Once explicit, a table stays explicit; every subsequent
 * structural operation and resize operates on that real array, never
 * partially reintroducing an implicit gap.
 */

/**
 * The width a newly-inserted column starts at when the table already has
 * valid width metadata to insert into. Deliberately **not** inherited from
 * any selected/adjacent column — Insert always starts a brand-new column at
 * this fixed value; only Duplicate and Move carry an *existing* column's own
 * width with it (see `nextWidthsAfterColumnDuplication`/`nextWidthsAfterColumnMove`
 * below).
 *
 * No existing pixel-width token was found to reuse: `tableWidget.css`'s
 * table uses `table-layout: fixed` at `width: 100%` with columns auto-split
 * equally (only a `min-width: 2ch` per-cell floor, no per-column pixel
 * default), and `mediaPresentationModel.ts`'s own default is the
 * proportional bucket `11` (full width), not a pixel value applicable here.
 */
export const DEFAULT_TABLE_COLUMN_WIDTH = 200;

const ATTRIBUTE_LINE = /^\{table-col-widths="([^"]*)"\}$/;

/** A width must be a positive integer — zero, negative, or non-integer values are never valid column widths. No upper bound is enforced here; a maximum (if any) is a rendering/UX concern for a later milestone, not this persistence layer's. */
function isValidWidth(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

/**
 * Parses one candidate line's raw text against the attribute syntax.
 * Returns `null` for anything that isn't a well-formed
 * `{table-col-widths="..."}` line (wrong key, missing quotes, trailing
 * text, an unrelated `{...}` attribute) or whose values aren't all valid
 * positive-integer widths — malformed metadata is treated exactly like
 * absent metadata, never a partial/best-effort result.
 */
export function parseTableColumnWidthsAttribute(lineText: string): readonly number[] | null {
  const match = ATTRIBUTE_LINE.exec(lineText.trim());
  if (!match) {
    return null;
  }
  const raw = match[1]!;
  if (raw.trim() === '') {
    return null;
  }
  const tokens = raw.split(',');
  const widths: number[] = [];
  for (const token of tokens) {
    const trimmedToken = token.trim();
    if (!/^\d+$/.test(trimmedToken)) {
      return null;
    }
    const value = Number(trimmedToken);
    if (!isValidWidth(value)) {
      return null;
    }
    widths.push(value);
  }
  return widths;
}

/**
 * The inverse of `parseTableColumnWidthsAttribute` — canonical
 * serialization, comma-separated, no interior spaces (matching the settled
 * syntax exactly). Callers are responsible for `widths` already being
 * valid positive integers; this function does not re-validate.
 */
export function serializeTableColumnWidthsAttribute(widths: readonly number[]): string {
  return `{table-col-widths="${widths.join(',')}"}`;
}

export interface TableColumnWidthsAttribute {
  /** The attribute line's own `[from, to)` range — strictly after `table.to`, on the document line immediately following the table's own last line. Never overlaps the table's own Markdown source range. */
  readonly from: number;
  readonly to: number;
  readonly widths: readonly number[];
}

/**
 * Resolves `table`'s own column-width metadata, if any. The association
 * rule is purely positional, no ID: the attribute line must be the
 * document line *immediately* following the table's own last line, with no
 * blank line or other content between them — the same "attribute directly
 * below the block it decorates, no blank line" convention Pandoc/Quarto and
 * Hugo's Goldmark attributes extension already use for table-level
 * attributes.
 *
 * `null` when: the table is the document's last content (no following line
 * exists at all); the following line is blank or doesn't match the
 * attribute syntax; it matches but fails per-value validation; or it
 * matches and every value is valid but the count doesn't equal the table's
 * own current header column count (this module's own invariant — see the
 * top doc comment). An unrelated `{...}` paragraph after a table (a
 * different key, or malformed) falls into the syntax-mismatch case — never
 * confused with real metadata, never partially accepted.
 */
export function resolveTableColumnWidths(state: EditorState, table: TableInfo): TableColumnWidthsAttribute | null {
  const tableEndLine = state.doc.lineAt(table.to);
  const nextLineNumber = tableEndLine.number + 1;
  if (nextLineNumber > state.doc.lines) {
    return null;
  }
  const line = state.doc.line(nextLineNumber);
  const widths = parseTableColumnWidthsAttribute(line.text);
  if (!widths) {
    return null;
  }
  const header = getNavigableRows(table.node)[0];
  const columnCount = header ? getRowColumnSegments(header).length : 0;
  if (widths.length !== columnCount) {
    return null;
  }
  return { from: line.from, to: line.to, widths };
}

/**
 * The `[from, to)` range of the line immediately after `table`, if that
 * line's text *syntactically* matches `{table-col-widths="..."}` — the raw
 * `ATTRIBUTE_LINE` shape, regardless of whether the value inside the
 * quotes actually parses as valid widths or matches the table's current
 * column count. Deliberately laxer than `resolveTableColumnWidths`, which
 * intentionally collapses "no attribute line" and "an attribute line with
 * an invalid value" into the same `null` — exactly right for "what are
 * this table's valid widths" (rendering, effective-width lookups), and
 * exactly wrong for "is there already a line here I must overwrite rather
 * than leave behind while inserting a second one."
 *
 * **Exists to fix a real, reproduced bug.** `computeTableColumnWidthsCommitChange`
 * used to decide insert-vs-replace from `resolveTableColumnWidths`'s own
 * strict result — so the moment an existing attribute line became
 * malformed for *any* reason (an un-rounded fractional pixel width from an
 * earlier resize, e.g. `{table-col-widths="70.96875,200"}`; a column
 * insert/delete leaving a stale count), the next resize saw "no valid
 * metadata," decided to *insert* a brand-new line, and left the malformed
 * one physically in place — producing two `{table-col-widths="..."}` lines
 * after the same table. This function is what a correct commit path checks
 * instead: "is *some* line already occupying this exact position, no
 * matter how malformed" — if so, that exact range is the one to overwrite,
 * never a reason to insert elsewhere.
 */
export function resolveExistingAttributeLineRange(state: EditorState, table: TableInfo): { from: number; to: number } | null {
  const tableEndLine = state.doc.lineAt(table.to);
  const nextLineNumber = tableEndLine.number + 1;
  if (nextLineNumber > state.doc.lines) {
    return null;
  }
  const line = state.doc.line(nextLineNumber);
  if (!ATTRIBUTE_LINE.test(line.text.trim())) {
    return null;
  }
  return { from: line.from, to: line.to };
}

export interface TableWithColumnWidths {
  readonly table: TableInfo;
  readonly attribute: TableColumnWidthsAttribute | null;
}

/**
 * Every table in `state` alongside its own resolved column-width metadata
 * (or `null`) — the whole-document counterpart to `resolveTableColumnWidths`,
 * for a caller that needs every table's own widths at once (a future
 * normalization-preservation check, a future resize UI's initial state)
 * rather than one table at a time. Reuses `tableGeometry.ts`'s own
 * `findAllTables` rather than re-deriving "every `Table` node in the
 * document."
 */
export function findAllTableColumnWidths(state: EditorState): readonly TableWithColumnWidths[] {
  return findAllTables(state).map((table) => ({ table, attribute: resolveTableColumnWidths(state, table) }));
}

// ---------------------------------------------------------------------------
// Structural-operation synchronization
// ---------------------------------------------------------------------------
//
// Every function below is a pure `existing widths in -> next widths out`
// computation, mirroring the column op it's named after
// (`tableColumnInsertion.ts`/`tableRowColumnMove.ts`/`tableSelectionDeletion.ts`),
// so those files stay the single place that decides *when* to call them and
// *how* to fold the result into their own already-single `changes` array —
// this module never dispatches a transaction itself. `existing` is always
// `attribute?.widths ?? null` (an already-validated array, or no metadata at
// all); every function returns `null` right back when `existing` is `null`,
// per this module's own "don't fabricate metadata a table didn't already
// have" rule (see `nextWidthsAfterColumnInsertion`'s own doc comment for why
// that rule applies even to insertion, which otherwise always has a real new
// value to contribute).

/**
 * The width array after inserting a new column at `targetIndex` — `null`
 * when `existing` is `null` (no metadata to insert into). The new column
 * always starts at `DEFAULT_TABLE_COLUMN_WIDTH`, never inherited from the
 * column the insertion is anchored on — only Duplicate/Move carry an
 * *existing* column's own width along with it.
 *
 * **Deliberately does not create metadata from nothing.** A table with no
 * valid width metadata stays that way after a plain column insert — only
 * Duplicate/Move (which always operate on a specific *existing* column, so
 * there is a concrete width to preserve for a table already under explicit
 * widths) or a future resize opt a table into persisted widths for the
 * first time; a structural insert never does that as a side effect.
 */
export function nextWidthsAfterColumnInsertion(existing: readonly number[] | null, targetIndex: number): readonly number[] | null {
  if (!existing) {
    return null;
  }
  const next = existing.slice();
  next.splice(targetIndex, 0, DEFAULT_TABLE_COLUMN_WIDTH);
  return next;
}

/** The width array after duplicating `columnIndex` into a new column immediately to its right — copies the source column's own width verbatim, mirroring `tableColumnInsertion.ts`'s own `columnDuplicationChangeForRow` copying its raw cell text verbatim. `null` when `existing` is `null`. */
export function nextWidthsAfterColumnDuplication(existing: readonly number[] | null, columnIndex: number): readonly number[] | null {
  if (!existing) {
    return null;
  }
  const width = existing[columnIndex];
  if (width === undefined) {
    return null;
  }
  const next = existing.slice();
  next.splice(columnIndex + 1, 0, width);
  return next;
}

/** The width array after moving the column at `fromIndex` to `toIndex` — the exact same `arrayMove` permutation `tableRowColumnMove.ts`'s own `moveColumn` applies to the column's cells, applied here to its width instead. `null` when `existing` is `null`. */
export function nextWidthsAfterColumnMove(existing: readonly number[] | null, fromIndex: number, toIndex: number): readonly number[] | null {
  if (!existing) {
    return null;
  }
  return arrayMove(existing, fromIndex, toIndex);
}

/**
 * The width array after removing `columnIndex` — `null` when `existing` is
 * `null`. Never called for a table's *last* remaining column: that path
 * deletes the whole table instead (a table cannot have zero columns), and
 * `tableRemovalRangeIncludingWidths` below is what removes that table's
 * attribute line along with it, not this function.
 */
export function nextWidthsAfterColumnDeletion(existing: readonly number[] | null, columnIndex: number): readonly number[] | null {
  if (!existing) {
    return null;
  }
  const next = existing.slice();
  next.splice(columnIndex, 1);
  return next;
}

/**
 * The single `ChangeSpec` that rewrites `attribute`'s own line to reflect
 * `nextWidths` — the one write path every structural op above folds into
 * its own existing `changes` array (never a second transaction/dispatch).
 * `null` (nothing to change) when there's no attribute line to rewrite
 * (`attribute` is `null` — a table with no metadata stays with no metadata;
 * see `nextWidthsAfterColumnInsertion`'s own doc comment) or when
 * `nextWidths` is itself `null` (the paired "no existing metadata" case
 * every `nextWidthsAfter*` function above returns in lockstep with a
 * `null` `attribute`).
 */
export function buildTableColumnWidthsAttributeChange(
  attribute: TableColumnWidthsAttribute | null,
  nextWidths: readonly number[] | null
): ChangeSpec | null {
  if (!attribute || !nextWidths) {
    return null;
  }
  return { from: attribute.from, to: attribute.to, insert: serializeTableColumnWidthsAttribute(nextWidths) };
}

/**
 * The removal range for deleting `table` entirely, extended to also consume
 * its own attribute line (and the newline immediately before it) when one
 * exists — so "delete the table's last column" (or any other path that
 * removes a whole table, e.g. deleting a header row with no body row left to
 * promote) never leaves an orphaned `{table-col-widths="..."}` paragraph
 * with no table above it. Returns `table`'s own unmodified `[from, to)`
 * when there's no attribute line to fold in.
 */
export function tableRemovalRangeIncludingWidths(table: TableInfo, attribute: TableColumnWidthsAttribute | null): { from: number; to: number } {
  if (!attribute) {
    return { from: table.from, to: table.to };
  }
  return { from: table.from, to: attribute.to };
}

/**
 * The complete width array to persist when column `resizedIndex` (of
 * `columnCount` total columns) has just been resized to `resizedWidth` —
 * the implicit→explicit conversion this module's own top doc comment
 * describes. Every column *except* `resizedIndex` is read from `existing`
 * when present (a table already explicit — this is the "subsequent resize"
 * case: only the touched column's own value actually changes) and falls
 * back to `DEFAULT_TABLE_COLUMN_WIDTH` when `existing` is `null` or doesn't
 * cover that index (a table still implicit — "first resize" — or a
 * genuinely new column somehow missing from a stale `existing` array).
 * Never partial: the result always has exactly `columnCount` entries,
 * `resizedIndex`'s own real value included, so
 * `buildTableColumnWidthsAttributeChange`'s caller can always write a fully
 * valid attribute from this result directly.
 *
 * Pure model-layer computation only — no pointer/drag/keyboard code calls
 * this yet; it exists so the resize milestone has a single, already-tested
 * place to convert "the user just dragged column N to W pixels" into the
 * array this module's own invariant requires, rather than inventing that
 * conversion inline in UI code later.
 */
export function materializeWidthsForResize(
  existing: readonly number[] | null,
  columnCount: number,
  resizedIndex: number,
  resizedWidth: number
): readonly number[] {
  const next: number[] = [];
  for (let i = 0; i < columnCount; i++) {
    next.push(i === resizedIndex ? resizedWidth : (existing?.[i] ?? DEFAULT_TABLE_COLUMN_WIDTH));
  }
  return next;
}

/**
 * The minimum pixel width a dragged column may be resized to — a usability
 * floor, not a validation rule (`isValidWidth` above still only requires
 * "positive integer"; this is enforced by the resize gesture itself,
 * `tableColumnResizeHandle.ts`, clamping the live drag value before it's
 * ever committed).
 *
 * No existing literal-pixel width precedent was found anywhere in this
 * codebase to reuse: `tableWidget.css`'s `.cm-table-cell-wrapper` has only
 * a cosmetic `min-width: 2ch` (an empty-cell fallback, not a resize
 * constraint), and `mediaPresentationModel.ts`'s own image-resize minimum
 * (`clampMediaWidth`) is a proportion of the available width, not a literal
 * pixel floor. Chosen fresh: each cell has 12px of horizontal padding on
 * both sides (`--space-12`, `tableWidget.css`) — 24px alone, before any
 * content — so 60px leaves roughly 36px (a handful of real characters) for
 * visible text, comfortably above the point where a column reads as
 * "collapsed."
 */
export const MIN_TABLE_COLUMN_WIDTH = 60;

/**
 * The single `ChangeSpec` that commits `nextWidths` for `table` — the
 * resize-specific counterpart to `buildTableColumnWidthsAttributeChange`
 * above. The two differ in exactly one way, deliberately: this function
 * *creates* a brand-new attribute line only when no line at all occupies
 * that position yet (a first resize on a table with no persisted metadata),
 * where every structural op's own `buildTableColumnWidthsAttributeChange`
 * call correctly never does — resize is the one legitimate trigger for a
 * table's implicit widths to become explicit (this module's own top doc
 * comment); a column insert/duplicate/move/delete is not.
 *
 * **Decides insert-vs-replace from `resolveExistingAttributeLineRange`
 * (lax, positional), never from `resolveTableColumnWidths` (strict,
 * validated)** — this is the actual fix for a real, reproduced duplicate-
 * line bug (see that function's own doc comment for the exact reproduction).
 * Using the strict result here meant a malformed *existing* line (a stray
 * fractional width, a stale column count) read as "no metadata," so the
 * next resize inserted a fresh line and left the malformed one behind.
 * Reuses `serializeTableColumnWidthsAttribute` unchanged either way — no
 * parsing/serialization logic duplicated.
 */
export function computeTableColumnWidthsCommitChange(state: EditorState, table: TableInfo, nextWidths: readonly number[]): ChangeSpec {
  const text = serializeTableColumnWidthsAttribute(nextWidths);
  const existingRange = resolveExistingAttributeLineRange(state, table);
  if (existingRange) {
    return { from: existingRange.from, to: existingRange.to, insert: text };
  }
  return { from: table.to, to: table.to, insert: `\n${text}` };
}
