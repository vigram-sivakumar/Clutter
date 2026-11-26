import { tableCellEditor } from './tableCellEditor';
import { WidgetType, type EditorView } from '@codemirror/view';
import { renderInlineMarkdown } from '../table/renderInlineMarkdown';
import { attachTableWidgetBreakoutWidth, type BreakoutWidthHandle } from '../table/tableWidgetBreakoutWidth';
import type { TableSnapshot } from './tableModel';
import { attachTableColumnResizeHandles } from '../table/tableColumnResizeHandle';
import { attachTableHandleOverlay } from '../table/tableHandleOverlay';
import type { OnTableHandleMenuChange } from '../table/tableHandleMenuSync';

// The mounted DOM can outlive an individual WidgetType during reconciliation.
const widthObservers = new WeakMap<HTMLElement, BreakoutWidthHandle>();
const dragDisposers = new WeakMap<HTMLElement, () => void>();
const structuralDisposers = new WeakMap<HTMLElement, () => void>();
const resizeDisposers = new WeakMap<HTMLElement, () => void>();
const handleDisposers = new WeakMap<HTMLElement, () => void>();

function container(parent: HTMLElement, className: string): HTMLDivElement {
  const child = parent.ownerDocument.createElement('div');
  child.className = className;
  parent.appendChild(child);
  return child;
}

/** Quick-add bars use the validated structural command pipeline. */
function attachStructuralControls(root: HTMLElement, view: EditorView, table: HTMLTableElement, inner: HTMLElement, layout: HTMLElement): () => void {
  const doc = root.ownerDocument;
  const controller = () => view.plugin(tableCellEditor);
  const from = () => Number(root.dataset.tableFrom);
  const button = (label: string, axis: 'row' | 'column', run: () => void) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'cm-table-quick-add cm-table-quick-add-' + axis;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 3v10M3 8h10" /></svg>';
    b.onmousedown = event => { event.preventDefault(); event.stopPropagation(); };
    b.onclick = event => { event.preventDefault(); event.stopPropagation(); run(); };
    return b;
  };
  const addRow = button('Add row', 'row', () => {
    controller()?.structural(from(), { kind: 'insertRow', index: table.rows.length }, true);
  });
  const addColumn = button('Add column', 'column', () => {
    const scroll = root.querySelector<HTMLElement>('.cm-table-scroll');
    if (controller()?.structural(from(), { kind: 'insertColumn', index: table.rows[0]!.cells.length }, true) && scroll) {
      scroll.scrollLeft = scroll.scrollWidth;
      doc.defaultView?.requestAnimationFrame(() => { if (scroll.isConnected) scroll.scrollLeft = scroll.scrollWidth; });
    }
  });
  inner.append(addRow);
  layout.append(addColumn);
  const size = () => {
    const rect = table.getBoundingClientRect();
    if (rect.width) addRow.style.width = rect.width + 'px';
    if (rect.height) addColumn.style.height = rect.height + 'px';
  };
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(size);
  observer?.observe(table);
  size();

  return () => observer?.disconnect();
}

/** A read-only projection of root Markdown. Reconcile by logical cell address so
 * a source refresh preserves the scrollport and mounted cells at surviving addresses.
 */
export class TableProjection extends WidgetType {
  constructor(readonly snapshot: TableSnapshot, readonly selected: boolean, readonly cellEditing = false,
    readonly getOnTableHandleMenuChange: () => OnTableHandleMenuChange | undefined = () => undefined) {
    super();
  }

  override eq(other: TableProjection): boolean {
    return other.snapshot.from === this.snapshot.from && other.snapshot.source === this.snapshot.source &&
      other.selected === this.selected && other.cellEditing === this.cellEditing;
  }

  private attachHandles(root: HTMLElement, view: EditorView): void {
    const controller = () => view.plugin(tableCellEditor);
    const from = () => Number(root.dataset.tableFrom);
    const selection = (axis: 'row' | 'column', index: number) => axis === 'row'
      ? { kind: 'row' as const, tableFrom: from(), rowIndex: index }
      : { kind: 'column' as const, tableFrom: from(), columnIndex: index };
    const dispose = attachTableHandleOverlay(root.firstElementChild as HTMLElement, this.snapshot.model.header.length,
      view, null, from(), null, null, () => params => {
        const notify = this.getOnTableHandleMenuChange();
        if (params && notify) controller()?.openHandleMenu(params.selection, notify);
      }, {
        select: (axis, index) => controller()?.selectAxis(from(), axis === 'row' ? { row: index, col: 0 } : { row: 0, col: index }, axis) ?? false,
        move: (axis, index, to) => controller()?.axisCommand(selection(axis, index),
          axis === 'row' ? { kind: 'moveRow', from: index, to } : { kind: 'moveColumn', from: index, to }) ?? false,
        selected: axis => {
          const current = controller()?.currentAxisSelection();
          if (!current || current.tableFrom !== from()) return null;
          return axis === 'row' && current.kind === 'row' ? current.rowIndex :
            axis === 'column' && current.kind === 'column' ? current.columnIndex : null;
        },
      });
    handleDisposers.set(root, dispose);
  }

  private attachResize(root: HTMLElement, view: EditorView): void {
    const { from, model } = this.snapshot;
    const dispose = attachTableColumnResizeHandles(root.firstElementChild as HTMLElement, from, view,
      model.header.length, model.columnWidths, undefined, false,
      (col, width, measured) => view.plugin(tableCellEditor)?.resizeColumn(Number(root.dataset.tableFrom), col, width, measured) ?? false);
    if (dispose) resizeDisposers.set(root, dispose);
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
    if (this.cellEditing) {
      structuralDisposers.set(root, attachStructuralControls(root, view, table, inner, layout));
      this.attachResize(root, view);
      this.attachHandles(root, view);
      const pointerDown = (event: PointerEvent) => view.plugin(tableCellEditor)?.beginDrag(event, root);
      const click = (event: MouseEvent) => view.plugin(tableCellEditor)?.consumeDragClick(root, event);
      const clipboard = (event: ClipboardEvent) => view.plugin(tableCellEditor)?.clipboard(root, event);
      root.addEventListener('copy', clipboard, true);
      root.addEventListener('cut', clipboard, true);
      root.addEventListener('paste', clipboard, true);
      root.addEventListener('pointerdown', pointerDown, true);
      root.addEventListener('click', click, true);
      dragDisposers.set(root, () => {
        root.removeEventListener('copy', clipboard, true);
        root.removeEventListener('cut', clipboard, true);
        root.removeEventListener('paste', clipboard, true);
        root.removeEventListener('pointerdown', pointerDown, true);
        root.removeEventListener('click', click, true);
        view.plugin(tableCellEditor)?.cancelDrag(root);
      });
    }
    return root;
  }

  override updateDOM(root: HTMLElement, _view: EditorView, previous: TableProjection): boolean {
    if (this.cellEditing !== previous.cellEditing) return false;
    const resizeChanged = this.cellEditing && (this.snapshot.from !== previous.snapshot.from || this.snapshot.source !== previous.snapshot.source);
    if (resizeChanged) {
      handleDisposers.get(root)?.();
      handleDisposers.delete(root);
      resizeDisposers.get(root)?.();
      resizeDisposers.delete(root);
    }
    if (this.snapshot.source === previous.snapshot.source) {
      root.dataset.tableFrom = String(this.snapshot.from);
      root.firstElementChild!.classList.toggle('cm-table-wrapper-selected', this.selected);
    } else {
      this.paint(root, _view, previous.snapshot);
    }
    if (resizeChanged) { this.attachResize(root, _view); this.attachHandles(root, _view); }
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
      widthObservers.get(root)?.disconnect();
      widthObservers.delete(root);
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
    handleDisposers.get(root)?.();
    handleDisposers.delete(root);
    resizeDisposers.get(root)?.();
    resizeDisposers.delete(root);
    structuralDisposers.get(root)?.();
    structuralDisposers.delete(root);
    dragDisposers.get(root)?.();
    dragDisposers.delete(root);
    widthObservers.get(root)?.disconnect();
    widthObservers.delete(root);
  }
}
