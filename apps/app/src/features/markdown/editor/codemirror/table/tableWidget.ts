import { WidgetType, type EditorView } from '@codemirror/view';

import type { TableColumnAlignment } from './tableAlignment';
import type { TableActiveCellController } from './tableActiveCellController';
import { renderInlineMarkdown } from './renderInlineMarkdown';

const ALIGN_CLASS: Readonly<Record<Exclude<TableColumnAlignment, null>, string>> = {
  left: 'cm-table-widget-align-left',
  center: 'cm-table-widget-align-center',
  right: 'cm-table-widget-align-right',
};

/** One cell's raw text plus its trimmed source range (`tableWidgetField.ts`'s own `rowCells` — excludes the padding spaces around the text, matching `tableCellNavigation.ts`'s `trimmedCellRange` contract for the same cell). */
export interface TableCellData {
  readonly text: string;
  readonly from: number;
  readonly to: number;
}

/**
 * Real HTML `<table>` projection of one Markdown table (Architecture E,
 * ADR-034, §B of docs/table-implementation-plan.md). Every cell renders
 * as static formatted HTML via `renderInlineMarkdown`, **except** the one
 * cell matching `controller`'s own `activeFrom`/`activeTo` (if any),
 * which instead hosts `controller.nestedView.dom` — the single reusable
 * nested `EditorView` (M2) — directly (M5).
 *
 * `controller` is `undefined` for a read-only table (a note embed) — every
 * cell then renders static-only, with no click handler at all: the same
 * "omit the capability entirely" gate `buildEditorExtensions.ts`'s
 * `!readOnly` branch already applies to every other editing-only
 * extension, extended here rather than a second gating mechanism
 * (§9/Cross-check). This is also what keeps this milestone from
 * reintroducing "one `EditorView` per cell" even in miniature: a
 * read-only table's cells never get a click handler that could ever call
 * `controller.activate()`, because there is no `controller` for them to
 * call it on.
 *
 * Same shape as `NoteEmbedWidget.ts` (`toDOM`/`destroy`/`eq`).
 */
export class TableWidget extends WidgetType {
  constructor(
    /** Header row's cells, left to right. */
    readonly headerCells: readonly TableCellData[],
    /** One entry per column, aligned by index with `headerCells`. */
    readonly alignments: readonly TableColumnAlignment[],
    /** Every data row's cells, in document order. Rows may be ragged (fewer cells than the header, per GFM) — rendered as-is, no padding to a rectangular grid. */
    readonly bodyRows: readonly (readonly TableCellData[])[],
    /** The table's own raw Markdown source — part of the equality/rebuild signal for `eq()` below, mirroring `NoteEmbedWidget.eq()`'s own `resolution.markdown` comparison: static rendering is a pure function of this string. */
    readonly rawText: string,
    /**
     * The table's own absolute document position — also part of `eq()`,
     * for the same reason `NoteEmbedWidget.eq()` compares its own
     * `pos`/`to` alongside content: an edit entirely *before* this table
     * (inside a different, earlier table, say) shifts every cell's
     * absolute `from`/`to` by the edit's own delta while leaving this
     * table's `rawText` byte-for-byte identical — `eq()` comparing only
     * `rawText` would then report "unchanged," letting CM6 reuse the old
     * DOM (and the click handlers closed over inside it, still holding
     * the *pre-shift* absolute positions) instead of rebuilding with
     * fresh ones. This is ADR-034's own "stale click-handler closures"
     * bug reproducing at the table-position level rather than the
     * per-cell level it was originally found at — caught here the same
     * way `NoteEmbedWidget` already guards against it for its own
     * position-dependent behavior.
     */
    readonly tableFrom: number,
    /** `undefined` for a read-only table — see this class's own doc comment. */
    readonly controller: TableActiveCellController | undefined,
    /** Snapshot of `controller?.activeAnchor?.from` at construction time — a second, independent part of the `eq()` signal: rendering must also rebuild when *which* cell is active changes, even though `rawText` alone wouldn't catch that (activation carries no document change — see `tableActiveCellChanged`'s own doc comment in `tableActiveCellController.ts`). */
    readonly activeFrom: number | null,
    /** Snapshot of `controller?.activeAnchor?.to` at construction time — see `activeFrom`. */
    readonly activeTo: number | null
  ) {
    super();
  }

  override eq(other: TableWidget): boolean {
    return (
      this.rawText === other.rawText &&
      this.tableFrom === other.tableFrom &&
      this.activeFrom === other.activeFrom &&
      this.activeTo === other.activeTo
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    const table = document.createElement('table');
    table.className = 'cm-table-widget';
    table.contentEditable = 'false';

    const thead = document.createElement('thead');
    thead.appendChild(this.buildRow(view, this.headerCells, 'th'));
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of this.bodyRows) {
      tbody.appendChild(this.buildRow(view, row, 'td'));
    }
    table.appendChild(tbody);

    return table;
  }

  private buildRow(view: EditorView, cells: readonly TableCellData[], cellTag: 'th' | 'td'): HTMLTableRowElement {
    const tr = document.createElement('tr');
    cells.forEach((cell, columnIndex) => {
      const element = document.createElement(cellTag);
      const alignment = this.alignments[columnIndex];
      if (alignment) {
        element.classList.add(ALIGN_CLASS[alignment]);
      }

      const isActive = this.controller && this.activeFrom === cell.from && this.activeTo === cell.to;
      if (isActive && this.controller!.nestedView) {
        element.appendChild(this.controller!.nestedView.dom);
      } else {
        element.innerHTML = renderInlineMarkdown(cell.text);
        if (this.controller) {
          const controller = this.controller;
          element.addEventListener('mousedown', (event) => {
            event.preventDefault();
            // `cell.from`/`cell.to` are re-resolved fresh into this exact
            // `toDOM()` call's own closure at click time — never a range
            // captured earlier and reused across a rebuild (ADR-034's own
            // "stale click-handler closures" bug this guards against;
            // `TableActiveCellController.activate()`'s own doc comment).
            controller.activate(view, element, cell.from, cell.to, cell.to);
          });
        }
      }
      tr.appendChild(element);
    });
    return tr;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
