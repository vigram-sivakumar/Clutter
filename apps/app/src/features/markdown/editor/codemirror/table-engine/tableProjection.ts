import { markBlockRange } from '../blockRangeSelection';
import '../table/tableWidget.css';
import plusIcon from '@shared/icon/svg/plus.svg?raw';
import { tableCellEditor, tableEngineIntegration } from './tableCellEditor';
import { WidgetType, type EditorView } from '@codemirror/view';
import { paintInlineMarkdown } from '../table/renderInlineMarkdown';
import type { TableSnapshot } from './tableModel';
import { attachTableHandleOverlay } from '../table/tableHandleOverlay';
import { createTableSelectionOverlay, positionRangeSelectionOverlay, VISIBLE_CLASS } from '../table/tableSelectionOverlay';
import type { selectionBounds } from './tableInteraction';
import type { OnTableHandleMenuChange } from '../table/tableHandleMenuSync';

// The mounted DOM can outlive an individual WidgetType during reconciliation.
const dragDisposers = new WeakMap<HTMLElement, () => void>();
const structuralDisposers = new WeakMap<HTMLElement, () => void>();
const handleDisposers = new WeakMap<HTMLElement, () => void>();
const selectionDisposers = new WeakMap<HTMLElement, () => void>();
const overflowDisposers = new WeakMap<HTMLElement, () => void>();

function container(parent: HTMLElement, className: string): HTMLDivElement {
  const child = parent.ownerDocument.createElement('div');
  child.className = className;
  parent.appendChild(child);
  return child;
}

/** Quick-add bars use the validated structural command pipeline. */
function attachStructuralControls(root: HTMLElement, view: EditorView, table: HTMLTableElement, inner: HTMLElement): () => void {
  const doc = root.ownerDocument;
  const controller = () => view.plugin(tableCellEditor);
  const from = () => Number(root.dataset.tableFrom);
  const button = (label: string, axis: 'row' | 'column', run: () => void) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'cm-table-quick-add cm-table-quick-add-' + axis;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.innerHTML = plusIcon;
    b.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    b.querySelector('svg')?.setAttribute('focusable', 'false');
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
  // The track includes the visual gap but only the button inserts a row
  // or column. This keeps hover continuous without expanding the click target.
  const rowTrack = container(inner, 'cm-table-quick-add-track cm-table-quick-add-track-row');
  const columnTrack = container(inner, 'cm-table-quick-add-track cm-table-quick-add-track-column');
  rowTrack.append(addRow);
  columnTrack.append(addColumn);
  // Both tracks are anchored to the table-sized inner box. The column
  // track stretches with its height, so no size observer is required.
  return () => {
    rowTrack.remove();
    columnTrack.remove();
  };
}

/** Reuse the existing scroll-content-coordinate selection outline. The
 * controller publishes derived bounds; this helper has no selection state
 * other than the last paint instruction, and never edits Markdown. */
function attachSelectionOutline(wrapper: HTMLElement, scroll: HTMLElement, table: HTMLTableElement): () => void {
  const overlay = createTableSelectionOverlay();
  scroll.append(overlay);
  let bounds: ReturnType<typeof selectionBounds> = null;
  let disposed = false;
  const measure = () => {
    if (disposed || !overlay.isConnected) return;
    if (!bounds) { overlay.classList.remove(VISIBLE_CLASS); return; }
    positionRangeSelectionOverlay(overlay, scroll, table, bounds.top, bounds.bottom, bounds.left, bounds.right);
  };
  const update = (event: Event) => {
    bounds = (event as CustomEvent<ReturnType<typeof selectionBounds>>).detail;
    measure();
  };
  wrapper.addEventListener('table-engine-selection', update);
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
  observer?.observe(table);
  queueMicrotask(measure);
  return () => {
    disposed = true;
    observer?.disconnect();
    wrapper.removeEventListener('table-engine-selection', update);
    overlay.remove();
  };
}

/** Paint only clipped table content, not reserved control gutters.
 * The wrapper's decorative pseudo-elements stay at the viewport edges.
 * No editor transactions, new scroll container, or interaction state.
 */
function attachOverflowFades(wrapper: HTMLElement, scroll: HTMLElement, table: HTMLTableElement): () => void {
  let disposed = false;
  const measure = () => {
    if (disposed || !wrapper.isConnected) return;
    const wrapperRect = wrapper.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const left = scrollRect.left + scroll.clientLeft;
    const right = left + scroll.clientWidth;
    // Ignore subpixel rounding. Only actual clipped cells count: quick-add
    // and handle clearance may still be horizontally scrollable.
    const visible = scroll.clientWidth > 0 && tableRect.height > 0 &&
      tableRect.right > left && tableRect.left < right;
    wrapper.style.setProperty('--cm-table-fade-left', `${left - wrapperRect.left}px`);
    wrapper.style.setProperty('--cm-table-fade-right', `${right - wrapperRect.left}px`);
    wrapper.style.setProperty('--cm-table-fade-top', `${tableRect.top - wrapperRect.top}px`);
    wrapper.style.setProperty('--cm-table-fade-height', `${tableRect.height}px`);
    wrapper.style.setProperty('--cm-table-fade-viewport-width', `${scroll.clientWidth}px`);
    wrapper.classList.toggle('cm-table-overflow-left', visible && tableRect.left < left - 1);
    wrapper.classList.toggle('cm-table-overflow-right', visible && tableRect.right > right + 1);
  };
  scroll.addEventListener('scroll', measure, { passive: true });
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
  observer?.observe(wrapper);
  observer?.observe(scroll);
  observer?.observe(table);
  queueMicrotask(measure);
  return () => {
    disposed = true;
    observer?.disconnect();
    scroll.removeEventListener('scroll', measure);
    wrapper.classList.remove('cm-table-overflow-left', 'cm-table-overflow-right');
    for (const property of ['left', 'right', 'top', 'height', 'viewport-width']) {
      wrapper.style.removeProperty(`--cm-table-fade-${property}`);
    }
  };
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
    const dispose = attachTableHandleOverlay(root.firstElementChild as HTMLElement, from(), () => params => {
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

  override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('div');
    root.className = 'cm-table-widget';
    root.contentEditable = 'false';
    if (this.cellEditing) root.tabIndex = -1;
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
    overflowDisposers.set(root, attachOverflowFades(wrapper, scroll, table));
    if (this.cellEditing) {
      selectionDisposers.set(root, attachSelectionOutline(wrapper, scroll, table));
      view.plugin(tableCellEditor)?.paintWidget(root);
      structuralDisposers.set(root, attachStructuralControls(root, view, table, inner));
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
    const handlesChanged = this.cellEditing && (this.snapshot.from !== previous.snapshot.from || this.snapshot.source !== previous.snapshot.source);
    if (handlesChanged) {
      handleDisposers.get(root)?.();
      handleDisposers.delete(root);

    }
    if (this.snapshot.source === previous.snapshot.source) {
      root.dataset.tableFrom = String(this.snapshot.from);
      markBlockRange(root, _view, this.snapshot.from, this.snapshot.to);
      root.dataset.tableRootSelected = String(this.selected);
      root.firstElementChild!.classList.toggle('cm-table-wrapper-selected', this.selected);
    } else {
      this.paint(root, _view, previous.snapshot);
    }
    if (handlesChanged) this.attachHandles(root, _view);
    if (this.cellEditing) _view.plugin(tableCellEditor)?.paintWidget(root);
    return true;
  }

  private paint(root: HTMLElement, view: EditorView, previous?: TableSnapshot): void {
    const { model, from } = this.snapshot;
    root.dataset.tableFrom = String(from);
    markBlockRange(root, view, from, this.snapshot.to);
    if (this.cellEditing) root.dataset.tableEngineCells = 'true';
    else delete root.dataset.tableEngineCells;
    const wrapper = root.firstElementChild as HTMLElement;
    root.dataset.tableRootSelected = String(this.selected);
    wrapper.classList.toggle('cm-table-wrapper-selected', this.selected);
    wrapper.classList.add('cm-table-wrapper--auto-widths');
    wrapper.style.setProperty('--cm-table-column-count', String(model.header.length));
    const table = wrapper.querySelector('table')!;
    const columns = table.querySelector('colgroup')!;
    while (columns.children.length > model.header.length) columns.lastElementChild!.remove();
    model.header.forEach((_, index) => {
      const col = (columns.children[index] ?? columns.appendChild(document.createElement('col'))) as HTMLTableColElement;
      col.dataset.columnIndex = String(index);
      col.style.removeProperty('width');
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
        if (!view.plugin(tableCellEditor)?.owns(host) && markdown !== priorValues?.[column]) {
          paintInlineMarkdown(host as HTMLElement, markdown, view, view.state.facet(tableEngineIntegration)[0]?.resolvers);
        }
        (host as HTMLElement).dataset.cell = index + ',' + column;
        if (this.cellEditing) {
          (host as HTMLElement).tabIndex = -1;
          (host as HTMLElement).onmousedown = event => view.plugin(tableCellEditor)?.click(
            Number(root.dataset.tableFrom), { row: index, col: column }, host as HTMLElement, event);
          // The padded area and blank area below short text in a tall row
          // belong to the same cell, not to root Markdown.
          (cell as HTMLElement).onmousedown = event => {
            if (event.target instanceof Node && host.contains(event.target)) return;
            view.plugin(tableCellEditor)?.click(Number(root.dataset.tableFrom), { row: index, col: column }, host as HTMLElement, event);
          };
          (host as HTMLElement).onkeydown = event => view.plugin(tableCellEditor)?.selectedKey(
            Number(root.dataset.tableFrom), { row: index, col: column }, host as HTMLElement, event);
        }
        const alignment = model.alignments[column];
        cell.className = alignment === 'none' ? '' : 'cm-table-widget-align-' + alignment;
      });
    });
    if (this.cellEditing) view.plugin(tableCellEditor)?.paintWidget(root);
  }

  // Match the isolated prototype: the editable widget owns every event
  // in its subtree. CM6's root must not infer text edits or a selection
  // from pointer/focus/native events inside this separate editor.
  override ignoreEvent(): boolean {
    return this.cellEditing;
  }

  override destroy(root: HTMLElement): void {
    overflowDisposers.get(root)?.();
    overflowDisposers.delete(root);
    selectionDisposers.get(root)?.();
    selectionDisposers.delete(root);
    handleDisposers.get(root)?.();
    handleDisposers.delete(root);

    structuralDisposers.get(root)?.();
    structuralDisposers.delete(root);
    dragDisposers.get(root)?.();
    dragDisposers.delete(root);

  }
}
