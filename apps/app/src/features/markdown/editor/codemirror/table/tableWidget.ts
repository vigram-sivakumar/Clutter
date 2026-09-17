import { WidgetType } from '@codemirror/view';

import type { TableColumnAlignment } from './tableAlignment';
import { renderInlineMarkdown } from './renderInlineMarkdown';

const ALIGN_CLASS: Readonly<Record<Exclude<TableColumnAlignment, null>, string>> = {
  left: 'cm-table-widget-align-left',
  center: 'cm-table-widget-align-center',
  right: 'cm-table-widget-align-right',
};

/**
 * Real HTML `<table>` projection of one Markdown table (Architecture E,
 * ADR-034, §B of docs/table-implementation-plan.md) — render-only in this
 * milestone (M1): every cell, including what will eventually be the
 * "active" cell, renders as static formatted HTML via
 * `renderInlineMarkdown`. No click-to-activate, no nested `EditorView` —
 * that's `TableActiveCellController` (M2), deliberately not built here so
 * this milestone can verify decoration shape and inline rendering in
 * isolation first, per the plan's own `docs/implementation-rules.md`
 * discipline.
 *
 * Same shape as `NoteEmbedWidget.ts` (`toDOM`/`destroy`/`eq`), but far
 * simpler — no header row, no controls, no nested `EditorView` lifecycle
 * to manage in this milestone.
 */
export class TableWidget extends WidgetType {
  constructor(
    /** Raw cell text (already trimmed) for the header row, left to right. */
    readonly headerCells: readonly string[],
    /** One entry per column, aligned by index with `headerCells`. */
    readonly alignments: readonly TableColumnAlignment[],
    /** Raw cell text (already trimmed) for every data row, in document order. Rows may be ragged (fewer cells than the header, per GFM) — rendered as-is, no padding to a rectangular grid. */
    readonly bodyRows: readonly (readonly string[])[],
    /** The table's own raw Markdown source — the equality/rebuild signal for `eq()` below, mirroring `NoteEmbedWidget.eq()`'s own `resolution.markdown` comparison: everything this widget renders is a pure function of this string. */
    readonly rawText: string
  ) {
    super();
  }

  override eq(other: TableWidget): boolean {
    return this.rawText === other.rawText;
  }

  override toDOM(): HTMLElement {
    const table = document.createElement('table');
    table.className = 'cm-table-widget';
    table.contentEditable = 'false';

    const thead = document.createElement('thead');
    thead.appendChild(this.buildRow(this.headerCells, 'th'));
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of this.bodyRows) {
      tbody.appendChild(this.buildRow(row, 'td'));
    }
    table.appendChild(tbody);

    return table;
  }

  private buildRow(cells: readonly string[], cellTag: 'th' | 'td'): HTMLTableRowElement {
    const tr = document.createElement('tr');
    cells.forEach((cellText, columnIndex) => {
      const cell = document.createElement(cellTag);
      const alignment = this.alignments[columnIndex];
      if (alignment) {
        cell.classList.add(ALIGN_CLASS[alignment]);
      }
      cell.innerHTML = renderInlineMarkdown(cellText);
      tr.appendChild(cell);
    });
    return tr;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
