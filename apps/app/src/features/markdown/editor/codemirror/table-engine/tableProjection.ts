import { tableCellEditor } from './tableCellEditor';
import { WidgetType, type EditorView } from '@codemirror/view';
import { renderInlineMarkdown } from '../table/renderInlineMarkdown';
import { attachTableWidgetBreakoutWidth, type BreakoutWidthHandle } from '../table/tableWidgetBreakoutWidth';
import type { TableSnapshot } from './tableModel';

// The mounted DOM can outlive an individual WidgetType during reconciliation.
const widthObservers = new WeakMap<HTMLElement, BreakoutWidthHandle>();
const dragDisposers = new WeakMap<HTMLElement, () => void>();
const structuralDisposers = new WeakMap<HTMLElement, () => void>();

function container(parent: HTMLElement, className: string): HTMLDivElement {
  const child = parent.ownerDocument.createElement('div');
  child.className = className;
  parent.appendChild(child);
  return child;
}

/** Stage M8 with the established quick-add bars. A small context-action
 * surface exposes the same structural API for browser acceptance until
 * M9 replaces it with the product's row/column handle menu. */
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

  let menu: HTMLElement | null = null;
  const close = () => {
    menu?.remove(); menu = null;
    doc.removeEventListener('mousedown', outside, true);
    doc.removeEventListener('keydown', escape, true);
  };
  const outside = (event: MouseEvent) => { if (!menu?.contains(event.target as Node)) close(); };
  const escape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && menu) { event.preventDefault(); event.stopPropagation(); close(); }
  };
  const open = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const host = target.closest<HTMLElement>('[data-cell]');
    if (!host || host.closest('[data-table-engine-cells="true"]') !== root) return;
    const [row, col] = host.dataset.cell!.split(',').map(Number);
    if (row === undefined || col === undefined) return;
    event.preventDefault(); event.stopPropagation(); close();
    menu = doc.createElement('div');
    menu.className = 'cm-table-engine-structural-actions';
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', 'Table structural actions');
    const actions = [
      ['Insert row above', { kind: 'insertRow', index: row }, 'row'],
      ['Insert row below', { kind: 'insertRow', index: row + 1 }, 'row'],
      ['Duplicate row', { kind: 'duplicateRow', index: row }, 'row'],
      ['Delete row', { kind: 'deleteRow', index: row }, 'row'],
      ['Insert column left', { kind: 'insertColumn', index: col }, 'column'],
      ['Insert column right', { kind: 'insertColumn', index: col + 1 }, 'column'],
      ['Duplicate column', { kind: 'duplicateColumn', index: col }, 'column'],
      ['Delete column', { kind: 'deleteColumn', index: col }, 'column'],
    ] as const;
    for (const [label, command, axis] of actions) {
      const action = doc.createElement('button');
      action.type = 'button';
      action.textContent = label;
      action.dataset.tableAction = label;
      action.onmousedown = e => { e.preventDefault(); e.stopPropagation(); };
      action.onclick = e => {
        e.preventDefault(); e.stopPropagation();
        close();
        const c = controller();
        if (c?.selectAxis(from(), { row, col }, axis)) c.structural(from(), command);
      };
      menu.append(action);
    }
    root.append(menu);
    const win = doc.defaultView;
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.max(4, Math.min(event.clientX, (win?.innerWidth ?? 1024) - rect.width - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(event.clientY, (win?.innerHeight ?? 768) - rect.height - 4)) + 'px';
    doc.addEventListener('mousedown', outside, true);
    doc.addEventListener('keydown', escape, true);
  };
  root.addEventListener('contextmenu', open);
  return () => {
    observer?.disconnect();
    root.removeEventListener('contextmenu', open);
    close();
  };
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
    if (this.cellEditing) {
      structuralDisposers.set(root, attachStructuralControls(root, view, table, inner, layout));
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
    structuralDisposers.get(root)?.();
    structuralDisposers.delete(root);
    dragDisposers.get(root)?.();
    dragDisposers.delete(root);
    widthObservers.get(root)?.disconnect();
    widthObservers.delete(root);
  }
}
