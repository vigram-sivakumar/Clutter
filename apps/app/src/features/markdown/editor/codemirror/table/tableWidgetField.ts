import { ensureSyntaxTree } from '@codemirror/language';
import { sharedMarkdownParser } from '../../../render/sharedMarkdownParser';
import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

import type { SyntaxNode } from '@lezer/common';

import { snapshotFromTableNode, TableEngineError } from '../table-engine/tableModel';
import { TableProjection } from '../table-engine/tableProjection';
import { parseTableAlignment, type TableColumnAlignment } from './tableAlignment';
import { tableActiveCellChanged, type TableActiveCellController } from './tableActiveCellController';
import { tableDeletionSelectionChanged, tableDeletionSelectionField } from './tableDeletionSelection';
import type { OnTableHandleMenuChange } from './tableHandleMenuSync';
import { findAllTables, getNavigableRows, getRowColumnSegments, isAlignmentRow, tableIntersectsSelectionRange, type TableInfo } from './tableGeometry';
import { resolveTableColumnWidths } from './tableColumnWidthMetadata';
import { tableSelectionChanged, tableSelectionField } from './tableSelection';
import { TableWidget, type TableCellData } from './tableWidget';

function tableDiagnosticsEnabled(): boolean {
  return import.meta.env.DEV && typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debugTables');
}

function logTableDiagnostic(event: string, details: Record<string, unknown>): void {
  if (tableDiagnosticsEnabled()) {
    console.info('[Clutter table diagnostics]', event, details);
  }
}

/**
 * Every cell's raw text + trimmed source range in `row`, left to right —
 * deliberately **not** `getRowCellBounds` (which only pairs up
 * consecutive `TableDelimiter` children, by design: built for Tab/Arrow
 * navigation between delimiter-bounded gaps, not for recovering a row's
 * full cell count). That leaves two GFM-legal shapes unrepresented, both
 * required here because `TableWidget` needs every row's *entire* content,
 * not just its navigable columns:
 *
 * - **No leading/trailing pipe** (`A|B|C`, confirmed empirically: only
 *   the interior `|` becomes a `TableDelimiter`) — `getRowCellBounds`
 *   returns zero bounds for a single delimiter, silently dropping both
 *   the row's first and last cells.
 * - **No pipe at all** (a plain-text line directly after a table with no
 *   blank line, absorbed as a one-cell `TableRow` per GFM — confirmed:
 *   parses as one `TableCell` spanning the row, zero `TableDelimiter`
 *   children) — `getRowCellBounds` returns zero bounds here too.
 *
 * Handles both by splitting on every `TableDelimiter` in the row (however
 * many there are, including zero) rather than requiring delimiter pairs:
 * a leading/trailing segment is only counted as a cell when real row
 * content precedes/follows the first/last delimiter — exactly how GFM's
 * own "leading and trailing pipes are optional" rule reads.
 *
 * **Trims each segment's own leading/trailing whitespace into `from`/`to`,
 * not just `text`** (M5, docs/table-implementation-plan.md) — the same
 * "editable content excludes the padding spaces around it" contract
 * `tableCellNavigation.ts`'s own `trimmedCellRange` establishes for
 * keyboard-driven activation, needed here too so a *click*-activated cell
 * mounts the nested editor over the same range, not one that includes
 * `"| Name |"`'s literal padding (`" Name "`).
 *
 * **A whitespace-only (but non-zero-length) segment collapses to a
 * zero-width range at its own start, not `{from: rawTo, to: rawFrom}`.**
 * The naive `{from: rawFrom + leading, to: rawTo - trailing}` inverts
 * (`from > to`) for exactly this case — confirmed directly: for a
 * single-space gap (`rawTo === rawFrom + 1`), `leading`/`trailing` are
 * both `1` (trimming a whitespace-only string removes the whole thing on
 * both ends), giving `from = rawTo`, `to = rawFrom`. `state.sliceDoc`
 * silently tolerates this (`ChangeDesc`'s own `clip()` clamps `to` up to
 * `from`, so the resulting `text` still reads as `''`, masking the bug in
 * isolation), but the *stored* inverted range itself is real and
 * corrupts anything built on it later — `TableActiveCellController`'s own
 * `anchor.from` (used as `forwardToRoot`'s insertion offset) would then
 * point at the *end* of the gap instead of the start. Only a truly
 * zero-length segment (delimiters immediately adjacent, no padding at
 * all) already avoided this on its own (`leading = trailing = 0`).
 *
 * Exported for `tableActivationNormalization.ts`'s own reuse (per-column
 * trimmed text, including for the alignment/delimiter row, which this
 * function handles identically to any other row) — it needs the exact
 * same "every cell's real content, however many/few delimiters exist"
 * splitting this function already provides, so it reuses this rather than
 * re-deriving a second segment-splitter.
 *
 * **Also returns each segment's own untrimmed `rawFrom`/`rawTo`**
 * (`TableCellData.rawFrom`/`.rawTo`) alongside the trimmed `from`/`to` —
 * required for `TableWidget`'s own active-cell *containment* check
 * (confirmed as a real, separately-discovered bug: typing a *trailing*
 * space inside the active cell grows `TableActiveCellController`'s own
 * anchor, via plain `ChangeSet.mapPos`, to include that space, but this
 * function's own trim then immediately excludes that same trailing space
 * from the freshly-recomputed `to` — an exact-equality match between
 * the controller's anchor and this cell's trimmed bounds then fails on
 * the very next rebuild, even though nothing structural changed, making
 * the cell appear to have no active match at all). `TableWidget` checks
 * whether the anchor falls *within* `[rawFrom, rawTo]`, not whether it
 * exactly equals `[from, to]`.
 */
export function rowCells(state: EditorState, row: SyntaxNode): TableCellData[] {
  return getRowColumnSegments(row).map(({ rawFrom, rawTo }) => {
    const raw = state.sliceDoc(rawFrom, rawTo);
    const trimmed = raw.trim();
    if (trimmed === '') {
      return { text: '', from: rawFrom, to: rawFrom, rawFrom, rawTo };
    }
    const leading = raw.length - raw.trimStart().length;
    const trailing = raw.length - raw.trimEnd().length;
    return { text: trimmed, from: rawFrom + leading, to: rawTo - trailing, rawFrom, rawTo };
  });
}

/**
 * The rectangular-table invariant's own rendering half
 * (`docs/table-range-selection-clipboard-ux-contract.md`'s "CRITICAL TABLE
 * INVARIANT" — `tableRectangularNormalization.ts`'s own top doc comment
 * has the full two-layer design). `rowCells` above returns exactly as many
 * entries as `row`'s own *source* currently has — correct and unchanged
 * for every other caller, but insufficient on its own for rendering: a
 * ragged row (fewer cells than the header) would render fewer `<td>`s than
 * the header has `<th>`s, visually exposing the missing cell, for *any*
 * table state — including a freshly-opened file that hasn't been edited
 * yet, or a permanently read-only note embed that can never dispatch a
 * normalizing transaction at all. Purely additive/visual: appends
 * `synthetic: true`-flagged, empty `TableCellData` entries (collapsed at
 * `rowEnd`, the row's own `.to`) up to `targetCount` — never a document
 * edit. `TableWidget`'s own click handler checks `cell.synthetic` before
 * activating one, materializing the real source cell first via
 * `tableRectangularNormalization.ts`'s own `ensureRectangularCellBounds`.
 */
function padRowCells(cells: readonly TableCellData[], targetCount: number, rowEnd: number): TableCellData[] {
  if (cells.length >= targetCount) {
    return cells as TableCellData[];
  }
  const padded = cells.slice();
  while (padded.length < targetCount) {
    padded.push({ text: '', from: rowEnd, to: rowEnd, rawFrom: rowEnd, rawTo: rowEnd, synthetic: true });
  }
  return padded;
}

function buildTableWidgetRange(
  state: EditorState,
  table: TableInfo,
  controller: TableActiveCellController | undefined,
  getOnTableHandleMenuChange: () => OnTableHandleMenuChange | undefined,
  automaticSizing = false
): Range<Decoration> | null {
  const navigableRows = getNavigableRows(table.node);
  const header = navigableRows[0];
  if (!header) {
    return null;
  }

  const alignRow = header.nextSibling;
  const alignments: TableColumnAlignment[] = alignRow && isAlignmentRow(alignRow) ? parseTableAlignment(state.sliceDoc(alignRow.from, alignRow.to)) : [];

  const headerCells = rowCells(state, header);
  const bodyRows = navigableRows.slice(1).map((row) => padRowCells(rowCells(state, row), headerCells.length, row.to));

  const activeAnchor = controller?.activeAnchor ?? null;
  // `false` (not throwing): a read-only note embed's nested view still
  // installs `tableWidgetDecoration()` (rendering) but never
  // `tableWholeDeletionKeymap()` (editing-only) — see
  // `tableDeletionSelection.ts`'s own doc comment. This field is always
  // registered wherever this StateField is (see `buildEditorExtensions.ts`),
  // so the fallback only ever matters for a config that installs this
  // field independently of that wiring, e.g. a narrower test harness.
  const armedForDeletion = state.field(tableDeletionSelectionField, false);

  // `false` for the same reason `armedForDeletion` above defaults
  // defensively — a narrower test harness that installs this StateField
  // without `tableSelectionField` alongside it.
  const tableSelection = state.field(tableSelectionField, false) ?? null;
  const hasTableSelectionInThisTable = tableSelection?.tableFrom === table.from;
  const selectedColumnIndex =
    hasTableSelectionInThisTable && tableSelection!.kind === 'column' ? tableSelection!.columnIndex : null;
  const selectedRowIndex = hasTableSelectionInThisTable && tableSelection!.kind === 'row' ? tableSelection!.rowIndex : null;
  // Normalized here, once, rather than in `TableWidget`/`tableSelectionOverlay.ts` —
  // `anchor`/`head` (`tableSelection.ts`'s own `range` kind) may name either
  // corner first (a drag can run in any of the four directions), so every
  // consumer downstream of this point works with plain bounds, never with
  // "which one is the anchor."
  const selectedRange =
    hasTableSelectionInThisTable && tableSelection!.kind === 'range'
      ? {
          minRow: Math.min(tableSelection!.anchor.row, tableSelection!.head.row),
          maxRow: Math.max(tableSelection!.anchor.row, tableSelection!.head.row),
          minCol: Math.min(tableSelection!.anchor.col, tableSelection!.head.col),
          maxCol: Math.max(tableSelection!.anchor.col, tableSelection!.head.col),
        }
      : null;

  // A cell belonging to *this* table is currently active — `activeAnchor`
  // itself is the controller's one global active-cell position (the same
  // value is passed to every table's widget, per this function's own
  // per-cell containment check elsewhere in this file), so it must be
  // range-checked against `table`'s own bounds here to mean "active in
  // this table," not just "some cell somewhere is active."
  const hasActiveCellInThisTable =
    !!activeAnchor && activeAnchor.from >= table.from && activeAnchor.to <= table.to;

  // The root-selection halo (Milestone: "table selection halo for normal
  // root selections") is suppressed while a cell *in this table* is being
  // edited — showing a root-selection-derived "whole table selected" halo
  // at the same time as an active, focused cell would visually contradict
  // what's actually being edited, even though nothing stops the root
  // selection from technically still overlapping this table's range (e.g.
  // a stale Ctrl+A selection from before the cell was clicked — activating
  // a cell never changes the root selection, see
  // `TableActiveCellController.activate()`'s own doc comment). Whole-table
  // deletion arming (`armedForDeletion`) already can't coincide with an
  // active cell — `tableDeletionSelectionField` un-arms itself on the same
  // `tableActiveCellChanged` effect — so it needs no equivalent guard here.
  // A `TableSelection` in this table is suppressed the same way, for the
  // identical reason — a column/row selection is a strictly more specific
  // claim about what's selected than a coarse "the root selection happens
  // to overlap this table" halo, and the two must never both render at
  // once (this milestone's own instruction).
  const showSelectionHalo =
    armedForDeletion === table.from ||
    (!hasActiveCellInThisTable && !hasTableSelectionInThisTable && tableIntersectsSelectionRange(state.selection.main, table));

  // Resolved fresh here, once, rather than inside `TableWidget` itself —
  // `TableWidget` stays a pure rendering function of data already handed to
  // it, the same "no state of its own" shape every other field here already
  // follows. Read explicitly into `eq()` (below `TableWidget`'s own
  // constructor) specifically because a resize commit only ever rewrites
  // the attribute line, never `table`'s own `[from, to)` range — `rawText`
  // (this same call's `state.sliceDoc(table.from, table.to)`) is therefore
  // byte-identical before and after a resize, and would report "no rebuild
  // needed" on its own; this field is what actually notices the change.
  const columnWidths = resolveTableColumnWidths(state, table)?.widths ?? null;

  const widget = new TableWidget(
    headerCells,
    alignments,
    bodyRows,
    state.sliceDoc(table.from, table.to),
    table.from,
    controller,
    activeAnchor?.from ?? null,
    activeAnchor?.to ?? null,
    showSelectionHalo,
    selectedColumnIndex,
    selectedRowIndex,
    selectedRange,
    getOnTableHandleMenuChange,
    automaticSizing ? null : columnWidths,
    automaticSizing
  );
  return Decoration.replace({ widget, block: true }).range(table.from, table.to);
}

function buildTableDecorations(
  state: EditorState,
  controller: TableActiveCellController | undefined,
  getOnTableHandleMenuChange: () => OnTableHandleMenuChange | undefined,
  readOnlyProjection: boolean,
  editableProjection: boolean,
  reason: 'create' | 'transaction'
): DecorationSet {
  // This field owns block replacements for every table in the document, not just
  // the currently visible viewport. `syntaxTree(state)` may otherwise expose
  // only the parser's currently available (viewport-prioritised) prefix after
  // undo/redo or a structural edit. Scanning that partial tree silently omits
  // tables and lets their raw Markdown reach the DOM.
  //
  // First ask CodeMirror to complete its incremental parse. If that bounded
  // attempt times out, use Clutter's shared parser synchronously as a correctness
  // fallback. Both parsers use the same grammar; the fallback is deliberately
  // rare and ensures the replacement set is never built from a partial tree.
  const incrementalTree = ensureSyntaxTree(state, state.doc.length, 5000);
  const usedFallbackParser = incrementalTree === null;
  const tree = incrementalTree ?? sharedMarkdownParser.parse(state.doc.toString());
  const tables = findAllTables(state, tree);

  const ranges: Range<Decoration>[] = [];
  const source = (readOnlyProjection || editableProjection) && tables.length ? state.doc.toString() : null;
  for (const table of tables) {
    if (source !== null) {
      try {
        const snapshot = snapshotFromTableNode(source, table.node);
        // Editable projection owns its full source, including valid width
        // metadata. Leaving a concealed paragraph outside the widget gives
        // the native selection/undo system a second editable landing site.
        const to = editableProjection ? snapshot.to : table.to;
        const selected = tableIntersectsSelectionRange(state.selection.main, { ...table, to });
        const widget = new TableProjection(snapshot, selected, editableProjection, getOnTableHandleMenuChange);
        ranges.push(Decoration.replace({ widget, block: true }).range(table.from, to));
        continue;
      } catch (error) {
        // Imported tables outside the engine's domain retain their existing renderer.
        if (!(error instanceof TableEngineError)) throw error;
      }
    }
    const range = buildTableWidgetRange(state, table, controller, getOnTableHandleMenuChange, editableProjection || readOnlyProjection);
    if (range) {
      ranges.push(range);
    }
  }
  logTableDiagnostic('projection-build', {
    reason,
    docLength: state.doc.length,
    treeLength: tree.length,
    usedFallbackParser,
    tableCount: tables.length,
    tableRanges: tables.map(({ from, to }) => ({ from, to })),
    decorationCount: ranges.length,
  });
  return Decoration.set(ranges, true);
}

/**
 * `StateField`, not a `ViewPlugin` — required by the same CM6 constraint
 * `blockSeparatorDecoration.ts`'s own `blockSeparatorField` documents:
 * block-level decorations must come from a `StateField`
 * (`RangeError: Block decorations may not be specified via plugins`).
 * Confirmed early per the ADR-034 prototype's own noted risk
 * (docs/table-implementation-plan.md, M1).
 *
 * `controller`, when supplied, has its `remapActiveAnchor(tr)` called
 * synchronously here, before decorations rebuild — the ordering
 * `TableActiveCellController.remapActiveAnchor`'s own doc comment
 * requires (M2's "StateField/updateListener ordering hazard" fix).
 * `undefined` for a read-only table (a note embed, M5's own gating) —
 * every cell then renders static-only, with no click handler at all,
 * the same "omit the capability entirely" gate the deleted keymap files
 * used to apply themselves.
 *
 * Rebuilds on a doc change, `controller`'s own `tableActiveCellChanged`
 * marker effect (M5), `tableDeletionSelectionChanged`, **or a selection
 * change** (`tr.selection`, root-selection-halo milestone) — a pure
 * activation change (click, Tab, Arrow) carries no document change of its
 * own, so without also checking for that effect this field would never
 * notice a different cell became active and would keep rendering the
 * nested editor mounted in the *previous* cell's `<td>` — see
 * `tableActiveCellChanged`'s own doc comment. The `tr.selection` check is
 * the equivalent fix for the halo: `Ctrl+A`/a mouse drag/Shift+Arrow all
 * change `state.selection` with no `docChanged` and no effect of their
 * own — same truthiness check `tableRootSelectionSnap.ts`'s own filter
 * already uses for "did this transaction touch the selection at all."
 * `buildTableDecorations` is cheap to call on every selection change (one
 * syntax-tree scan for `findAllTables`, bounded by the number of tables in
 * the document); CM6's own widget `eq()` reconciliation (`TableWidget.eq`)
 * still skips any DOM rebuild for a table whose `showSelectionHalo` (and
 * every other prop) didn't actually change, so an ordinary cursor move
 * elsewhere in a table-free — or halo-unaffected — document costs a cheap
 * recompute, not a repaint.
 *
 * A factory, not a module-level singleton, because `TableActiveCellController`
 * is scoped one-per-root-`EditorView` (§D) — each root editor needs its
 * own field instance closing over its own controller.
 */
export function tableWidgetDecoration(
  controller?: TableActiveCellController,
  getOnTableHandleMenuChange: () => OnTableHandleMenuChange | undefined = () => undefined,
  readOnlyProjection = false,
  editableProjection = false
): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildTableDecorations(state, controller, getOnTableHandleMenuChange, readOnlyProjection, editableProjection, 'create');
    },
    update(value, tr) {
      controller?.remapActiveAnchor(tr);
      const hasRelevantEffect = tr.effects.some((e) =>
        e.is(tableActiveCellChanged) || e.is(tableDeletionSelectionChanged) || e.is(tableSelectionChanged)
      );
      const shouldRebuild = tr.docChanged || !!tr.selection || hasRelevantEffect;
      logTableDiagnostic('state-field-update', {
        docChanged: tr.docChanged,
        selectionChanged: !!tr.selection,
        relevantEffect: hasRelevantEffect,
        effectCount: tr.effects.length,
        shouldRebuild,
        docLength: tr.state.doc.length,
        selection: {
          anchor: tr.state.selection.main.anchor,
          head: tr.state.selection.main.head,
        },
      });
      if (shouldRebuild) {
        return buildTableDecorations(tr.state, controller, getOnTableHandleMenuChange, readOnlyProjection, editableProjection, 'transaction');
      }
      return value;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
