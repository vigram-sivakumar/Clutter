import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

import type { SyntaxNode } from '@lezer/common';

import { parseTableAlignment, type TableColumnAlignment } from './tableAlignment';
import { findAllTables, getNavigableRows, isAlignmentRow, type TableInfo } from './tableGeometry';
import { TableWidget } from './tableWidget';

/**
 * Every cell's raw text in `row`, left to right — deliberately **not**
 * `getRowCellBounds` (which only pairs up consecutive `TableDelimiter`
 * children, by design: built for Tab/Arrow navigation between
 * delimiter-bounded gaps, not for recovering a row's full cell count).
 * That leaves two GFM-legal shapes unrepresented, both required here
 * because `TableWidget` needs every row's *entire* content, not just its
 * navigable columns:
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
 */
function rowCellTexts(state: EditorState, row: SyntaxNode): string[] {
  const delimiters: SyntaxNode[] = [];
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name === 'TableDelimiter') {
      delimiters.push(child);
    }
  }
  if (delimiters.length === 0) {
    return [state.sliceDoc(row.from, row.to).trim()];
  }

  const cells: string[] = [];
  const first = delimiters[0]!;
  if (first.from > row.from) {
    cells.push(state.sliceDoc(row.from, first.from).trim());
  }
  for (let i = 0; i < delimiters.length - 1; i++) {
    cells.push(state.sliceDoc(delimiters[i]!.to, delimiters[i + 1]!.from).trim());
  }
  const last = delimiters[delimiters.length - 1]!;
  if (last.to < row.to) {
    cells.push(state.sliceDoc(last.to, row.to).trim());
  }
  return cells;
}

function buildTableWidgetRange(state: EditorState, table: TableInfo): Range<Decoration> | null {
  const navigableRows = getNavigableRows(table.node);
  const header = navigableRows[0];
  if (!header) {
    return null;
  }

  const alignRow = header.nextSibling;
  const alignments: TableColumnAlignment[] = alignRow && isAlignmentRow(alignRow) ? parseTableAlignment(state.sliceDoc(alignRow.from, alignRow.to)) : [];

  const headerCells = rowCellTexts(state, header);
  const bodyRows = navigableRows.slice(1).map((row) => rowCellTexts(state, row));

  const widget = new TableWidget(headerCells, alignments, bodyRows, state.sliceDoc(table.from, table.to));
  return Decoration.replace({ widget, block: true }).range(table.from, table.to);
}

function buildTableDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const table of findAllTables(state)) {
    const range = buildTableWidgetRange(state, table);
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
 * Render-only in this milestone (M1) — every table in the document
 * becomes one `Decoration.replace({block:true})` `TableWidget`, every
 * cell rendered as static formatted HTML. Not yet wired into
 * `buildEditorExtensions.ts`; exercised only by this field's own tests
 * until M5 wires it into the always-included `rendering` array.
 */
export const tableWidgetField: StateField<DecorationSet> = StateField.define<DecorationSet>({
  create(state) {
    return buildTableDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged) {
      return buildTableDecorations(tr.state);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function tableWidgetDecoration(): Extension {
  return tableWidgetField;
}
