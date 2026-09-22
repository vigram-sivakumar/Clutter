import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState, type ChangeSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { buildDelimiterCellText, cellGapWidth, minimumDelimiterGapWidth, parseTableAlignment, splitPipeRowCells, type TableColumnAlignment } from './tableAlignment';
import { findAllTables, findEnclosingTable, getNavigableRows, padCellContent, type TableInfo } from './tableGeometry';

/**
 * Full source-column-width alignment — "Format table" (`TableHandleMenu.tsx`),
 * an explicit user-triggered command, never an automatic one. This is the
 * genuinely new capability this module exists for: every column padded, in
 * the *source*, to its own widest cell's width, so the raw Markdown reads as
 * a visually aligned table (Obsidian/VS Code's own normalized style) rather
 * than Clutter's current "preserve whatever compact spacing the user typed"
 * default.
 *
 * **Deliberately not automatic — modeled directly on `MarkdownEditor.tsx`'s
 * own "Format code" precedent** (`handleFormatFencedCode`, wired from
 * `FencedCodeActionsMenu`'s own explicit menu item): the *only* existing
 * instance in this codebase of "reformat this block's source to a
 * canonical, aligned shape" is deliberately an explicit, user-invoked
 * action, never a transaction filter that runs on every keystroke — for the
 * exact reason this task calls out: the widest cell in a column can change
 * on literally every keystroke while the user is typing into it, and
 * realigning the whole table's source on each one would make the Markdown
 * visibly shift underneath the user's own cursor while they type. This is
 * why `tableRectangularNormalization.ts`'s existing transaction filter
 * (which *does* run on every keystroke) is scoped to fixing ragged **cell
 * count** only — never column **width** — and why this module does not
 * extend that filter with width logic; it is a new, separate, explicitly-
 * triggered command instead, following the same "new command, not a new
 * automatic trigger" shape `handleFormatFencedCode` already established for
 * the same class of problem in a sibling block type.
 *
 * **Width computation reuses `tableAlignment.ts`'s own shared primitives**
 * (`cellGapWidth`, `buildDelimiterCellText`, `minimumDelimiterGapWidth`) —
 * the same ones `tableActivationNormalization.ts`'s own header-only width
 * computation was refactored to share (see that module's own doc comment
 * update) — rather than re-deriving the "total gap width for this cell's
 * content" / "delimiter cell text for this width and alignment" rules a
 * second time. The only genuinely new logic here is scanning *every* row
 * (not just the header) to find each column's true widest cell.
 *
 * **Preserves escaped pipes and inline Markdown verbatim.** Cell boundaries
 * are found with `splitPipeRowCells` (`tableAlignment.ts`'s own
 * unescaped-pipe-aware splitter, not a naive `split('|')`), and each cell's
 * own trimmed content is carried through unchanged into the padded output
 * — this module only ever adds/removes surrounding whitespace, never
 * touches a cell's actual text (so `\|`, `**bold**`, `[[WikiLink]]`, etc.
 * round-trip exactly).
 *
 * **Preserves the rectangular invariant.** A row shorter than the header
 * (a ragged row `tableRectangularNormalization.ts`'s own transaction filter
 * hasn't caught yet, or a table that was never dispatched through a
 * transaction at all — e.g. a freshly-opened file) is treated as having
 * empty trailing cells for width/output purposes, so normalizing a ragged
 * table also completes it into a full rectangle — one pass does both, not
 * two competing normalizations.
 */

interface ParsedTableRow {
  readonly from: number;
  readonly to: number;
  readonly cells: string[];
}

function parsedRow(state: EditorState, node: { from: number; to: number }, columnCount: number): ParsedTableRow {
  const cells = splitPipeRowCells(state.sliceDoc(node.from, node.to));
  const padded = cells.slice(0, columnCount);
  while (padded.length < columnCount) {
    padded.push('');
  }
  return { from: node.from, to: node.to, cells: padded };
}

/** Every column's own target total gap width — the widest of its header cell, every body cell, and the GFM-minimum delimiter width its declared alignment requires. Exported for direct unit testing of the width rule in isolation from the full change-computation/dispatch machinery below. */
export function computeColumnWidths(rows: readonly ParsedTableRow[], alignments: readonly TableColumnAlignment[]): number[] {
  const columnCount = alignments.length;
  const widths: number[] = [];
  for (let i = 0; i < columnCount; i++) {
    let width = minimumDelimiterGapWidth(alignments[i] ?? null);
    for (const row of rows) {
      width = Math.max(width, cellGapWidth(row.cells[i] ?? ''));
    }
    widths.push(width);
  }
  return widths;
}

function buildRowText(cells: readonly string[], widths: readonly number[]): string {
  return '|' + cells.map((cell, i) => padCellContent(cell, widths[i]!) + '|').join('');
}

function buildDelimiterRowText(alignments: readonly TableColumnAlignment[], widths: readonly number[]): string {
  return '|' + widths.map((width, i) => ' ' + buildDelimiterCellText(alignments[i] ?? null, width) + ' |').join('');
}

/**
 * The single `ChangeSpec` that rewrites `table`'s entire source (header
 * through last row) into its width-normalized form — `null` when the table
 * is already normalized (the idempotency contract this task requires:
 * `computeTableNormalizationChange` on an already-normalized table's own
 * output text always returns `null`, since the rebuilt text and the
 * current text are byte-identical). A malformed table (no header, or a
 * header with no delimiter row immediately below it) also returns `null`
 * — nothing this module can safely normalize.
 */
export function computeTableNormalizationChange(state: EditorState, table: TableInfo): ChangeSpec | null {
  const navigableRows = getNavigableRows(table.node);
  const header = navigableRows[0];
  if (!header) {
    return null;
  }
  const alignRow = header.nextSibling;
  if (!alignRow || alignRow.name !== 'TableDelimiter') {
    return null;
  }

  const headerCells = splitPipeRowCells(state.sliceDoc(header.from, header.to));
  const columnCount = headerCells.length;
  if (columnCount === 0) {
    return null;
  }
  const alignments = parseTableAlignment(state.sliceDoc(alignRow.from, alignRow.to));

  const rows = navigableRows.map((row) => parsedRow(state, row, columnCount));
  const widths = computeColumnWidths(rows, alignments);

  const lines = [
    buildRowText(rows[0]!.cells, widths),
    buildDelimiterRowText(alignments, widths),
    ...rows.slice(1).map((row) => buildRowText(row.cells, widths)),
  ];
  const normalizedText = lines.join('\n');

  const currentText = state.sliceDoc(table.from, table.to);
  if (normalizedText === currentText) {
    return null;
  }
  return { from: table.from, to: table.to, insert: normalizedText };
}

/** "Format table" (`TableHandleMenu.tsx`) — normalizes the table containing `pos`. `false` (a no-op, matching every other menu-facing entry point in this feature's own return-`boolean` contract) when `pos` isn't inside a table, or the table is already normalized. */
export function normalizeTableAt(view: EditorView, pos: number): boolean {
  const node = findEnclosingTable(view.state, pos);
  if (!node) {
    return false;
  }
  const table: TableInfo = { node, from: node.from, to: node.to };
  const change = computeTableNormalizationChange(view.state, table);
  if (!change) {
    return false;
  }
  view.dispatch({ changes: [change], scrollIntoView: true });
  return true;
}

/**
 * The headless, string-in/string-out entry point for the durable-save
 * boundary (`PageOperations.save()`, injected via `Application.bootstrap()`
 * — see `AppShell.tsx`'s own wiring). Normalizes every table found in
 * `markdown`, reusing exactly the same `computeTableNormalizationChange`
 * "Format table" itself dispatches through — this is not a second
 * normalization algorithm, just a different entry point into the one that
 * already exists: a throwaway, non-DOM `EditorState` (the same "parse a
 * bare string with just the Markdown grammar" technique
 * `tableActivationNormalization.ts`'s own `planTableActivationNormalization`
 * already establishes for exactly this "no live EditorView available yet"
 * situation) stands in for the live document only long enough to locate
 * every `Table` node and compute its own change; no `EditorView`, no
 * dispatch, no caret/selection/undo-history involvement of any kind — this
 * never touches the user's actual editing session.
 *
 * Every table's own change is computed against the *same* original `state`
 * and the changes never overlap (each is scoped to one table's own
 * `[from, to)` range), so they're safe to collect and apply as a single
 * batch (`state.changes(...)`) rather than needing to re-parse between
 * tables.
 *
 * Returns `markdown` itself, unchanged (same string reference), when there
 * are no tables or every table is already normalized — the save path's own
 * "don't do unnecessary work, don't manufacture a diff that isn't there"
 * requirement (mirrors `computeTableNormalizationChange`'s own per-table
 * `null`-when-already-normalized contract, just rolled up to the
 * whole-document level).
 */
export function normalizeAllTablesInMarkdown(markdown: string): string {
  const state = EditorState.create({
    doc: markdown,
    extensions: [markdownLanguageExtension()],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);

  const tables = findAllTables(state);
  if (tables.length === 0) {
    return markdown;
  }

  const changes = tables
    .map((table) => computeTableNormalizationChange(state, table))
    .filter((change): change is ChangeSpec => change !== null);
  if (changes.length === 0) {
    return markdown;
  }

  return state.changes(changes).apply(state.doc).toString();
}
