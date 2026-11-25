import { tableCellEditor } from './tableCellEditor';
import { WidgetType, type EditorView } from '@codemirror/view';
import { renderInlineMarkdown } from '../table/renderInlineMarkdown';
import { attachTableWidgetBreakoutWidth, type BreakoutWidthHandle } from '../table/tableWidgetBreakoutWidth';
import type { TableSnapshot } from './tableModel';

// The mounted DOM can outlive an individual WidgetType during reconciliation.
const widthObservers = new WeakMap<HTMLElement, BreakoutWidthHandle>();

function container(parent: HTMLElement, className: string): HTMLDivElement {
  const child = parent.ownerDocument.createElement('div');
  child.className = className;
  parent.appendChild(child);
  return child;
}

/** A read-only projection of root Markdown. Reconcile by logical cell address so
 * a source refresh preserves the scrollport and mounted cells at surviving addresses.
 */
export class TableProjection extends WidgetType {
  constructor(readonly snapshot: TableSnapshot, readonly selected: boolean, readonly cellEditing = false) {
    super();
  }

  override eq(other: TableProjection): boolean {
    return other.snapshot.from === this.snapshot.from && other.snapshot.source === this.snapshot.source &&
      other.selected === this.selected && other.cellEditing === this.cellEditing;
  }

  override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('div');
    root.className = 'cm-table-widget';
    root.contentEditable = 'false';
    const wrapper = container(root, 'cm-table-wrapper');
    const scroll = container(wrapper, 'cm-table-scroll');
    const layout = container(scroll, 'cm-table-layout');
    const inner = container(layout, 'cm-table-inner');
    const table = document.createElement('table');
    inner.appendChild(table);
    table.appendChild(document.createElement('colgroup'));
    table.createTHead();
    table.createTBody();
    this.paint(root, view);
    return root;
  }

  override updateDOM(root: HTMLElement, _view: EditorView, previous: TableProjection): boolean {
    if (this.snapshot.source === previous.snapshot.source) {
      root.dataset.tableFrom = String(this.snapshot.from);
      root.firstElementChild!.classList.toggle('cm-table-wrapper-selected', this.selected);
    } else {
      this.paint(root, _view, previous.snapshot);
    }
    if (this.cellEditing) _view.plugin(tableCellEditor)?.paintWidget(root);
    return true;
  }

  private paint(root: HTMLElement, view: EditorView, previous?: TableSnapshot): void {
    const { model, from } = this.snapshot;
    root.dataset.tableFrom = String(from);
    if (this.cellEditing) root.dataset.tableEngineCells = 'true';
    else delete root.dataset.tableEngineCells;
    const wrapper = root.firstElementChild as HTMLElement;
    wrapper.classList.toggle('cm-table-wrapper-selected', this.selected);
    wrapper.classList.toggle('cm-table-wrapper--explicit-widths', !!model.columnWidths);
    if (model.columnWidths && !widthObservers.has(root)) {
      widthObservers.set(root, attachTableWidgetBreakoutWidth(root, wrapper));
    } else if (!model.columnWidths) {
      this.destroy(root);
      wrapper.style.removeProperty('--table-breakout-max-width');
    }

    const table = wrapper.querySelector('table')!;
    const columns = table.querySelector('colgroup')!;
    while (columns.children.length > model.header.length) columns.lastElementChild!.remove();
    model.header.forEach((_, index) => {
      const col = (columns.children[index] ?? columns.appendChild(document.createElement('col'))) as HTMLTableColElement;
      col.dataset.columnIndex = String(index);
      col.style.width = model.columnWidths ? model.columnWidths[index] + 'px' : '';
    });

    const body = table.tBodies[0]!;
    while (body.rows.length > model.rows.length) body.deleteRow(-1);
    [model.header, ...model.rows].forEach((values, index) => {
      const section = index === 0 ? table.tHead! : body;
      const row = section.rows[Math.max(0, index - 1)] ?? section.insertRow();
      while (row.cells.length > values.length) row.deleteCell(-1);
      const priorValues = index === 0 ? previous?.model.header : previous?.model.rows[index - 1];
      values.forEach((markdown, column) => {
        const cell = row.cells[column] ?? row.appendChild(document.createElement(index === 0 ? 'th' : 'td'));
        const host = cell.firstElementChild ?? container(cell, 'cm-table-cell-wrapper');
        if (!view.plugin(tableCellEditor)?.owns(host) && markdown !== priorValues?.[column]) host.innerHTML = renderInlineMarkdown(markdown, { styled: true });
        (host as HTMLElement).dataset.cell = index + ',' + column;
        if (this.cellEditing) {
          (host as HTMLElement).tabIndex = -1;
          (host as HTMLElement).onmousedown = event => view.plugin(tableCellEditor)?.click(
            Number(root.dataset.tableFrom), { row: index, col: column }, host as HTMLElement, event);
          (host as HTMLElement).onkeydown = event => view.plugin(tableCellEditor)?.selectedKey(
            Number(root.dataset.tableFrom), { row: index, col: column }, host as HTMLElement, event);
        }
        const alignment = model.alignments[column];
        cell.className = alignment === 'none' ? '' : 'cm-table-widget-align-' + alignment;
      });
    });
    if (this.cellEditing) view.plugin(tableCellEditor)?.paintWidget(root);
  }

  override ignoreEvent(): boolean { return false; }

  override destroy(root: HTMLElement): void {
    widthObservers.get(root)?.disconnect();
    widthObservers.delete(root);
  }
}
