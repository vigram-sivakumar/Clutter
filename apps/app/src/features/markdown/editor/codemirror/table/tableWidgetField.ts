import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

import type { SyntaxNode } from '@lezer/common';

import { parseTableAlignment, type TableColumnAlignment } from './tableAlignment';
import { tableActiveCellChanged, type TableActiveCellController } from './tableActiveCellController';
import { findAllTables, getNavigableRows, isAlignmentRow, type TableInfo } from './tableGeometry';
import { TableWidget, type TableCellData } from './tableWidget';

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
function rowCells(state: EditorState, row: SyntaxNode): TableCellData[] {
  const delimiters: SyntaxNode[] = [];
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name === 'TableDelimiter') {
      delimiters.push(child);
    }
  }
  const segments: Array<{ readonly from: number; readonly to: number }> = [];
  if (delimiters.length === 0) {
    segments.push({ from: row.from, to: row.to });
  } else {
    const first = delimiters[0]!;
    if (first.from > row.from) {
      segments.push({ from: row.from, to: first.from });
    }
    for (let i = 0; i < delimiters.length - 1; i++) {
      segments.push({ from: delimiters[i]!.to, to: delimiters[i + 1]!.from });
    }
    const last = delimiters[delimiters.length - 1]!;
    if (last.to < row.to) {
      segments.push({ from: last.to, to: row.to });
    }
  }

  return segments.map(({ from: rawFrom, to: rawTo }) => {
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

function buildTableWidgetRange(state: EditorState, table: TableInfo, controller: TableActiveCellController | undefined): Range<Decoration> | null {
  const navigableRows = getNavigableRows(table.node);
  const header = navigableRows[0];
  if (!header) {
    return null;
  }

  const alignRow = header.nextSibling;
  const alignments: TableColumnAlignment[] = alignRow && isAlignmentRow(alignRow) ? parseTableAlignment(state.sliceDoc(alignRow.from, alignRow.to)) : [];

  const headerCells = rowCells(state, header);
  const bodyRows = navigableRows.slice(1).map((row) => rowCells(state, row));

  const activeAnchor = controller?.activeAnchor ?? null;
  const widget = new TableWidget(
    headerCells,
    alignments,
    bodyRows,
    state.sliceDoc(table.from, table.to),
    table.from,
    controller,
    activeAnchor?.from ?? null,
    activeAnchor?.to ?? null
  );
  return Decoration.replace({ widget, block: true }).range(table.from, table.to);
}

function buildTableDecorations(state: EditorState, controller: TableActiveCellController | undefined): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const table of findAllTables(state)) {
    const range = buildTableWidgetRange(state, table, controller);
    if (range) {
      ranges.push(range);
    }
  }
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
 * Rebuilds on **either** a doc change **or** `controller`'s own
 * `tableActiveCellChanged` marker effect (M5) — a pure activation change
 * (click, Tab, Arrow) carries no document change of its own, so without
 * also checking for that effect this field would never notice a
 * different cell became active and would keep rendering the nested
 * editor mounted in the *previous* cell's `<td>` — see
 * `tableActiveCellChanged`'s own doc comment.
 *
 * A factory, not a module-level singleton, because `TableActiveCellController`
 * is scoped one-per-root-`EditorView` (§D) — each root editor needs its
 * own field instance closing over its own controller.
 */
export function tableWidgetDecoration(controller?: TableActiveCellController): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildTableDecorations(state, controller);
    },
    update(value, tr) {
      controller?.remapActiveAnchor(tr);
      if (tr.docChanged || tr.effects.some((e) => e.is(tableActiveCellChanged))) {
        return buildTableDecorations(tr.state, controller);
      }
      return value;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
