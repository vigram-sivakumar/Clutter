import { dragScrollTarget, edgeScroll, visibleScrollBounds } from './tableDragScroll';
import type { CellAddress } from './tableCellTransaction';

const sameCell = (a: CellAddress, b: CellAddress) => a.row === b.row && a.col === b.col;

/** A transient pointer gesture, not a second selection owner. The controller
 * owns the range; this helper only hit-tests and delivers anchor/head pairs.
 * Do not capture the pointer while native cell text selection owns it.
 */
export class TableDragSelection {
  private gesture: { widget: HTMLElement; abort: AbortController } | null = null;
  private suppressClickWidget: HTMLElement | null = null;

  constructor(private readonly onRange: (widget: HTMLElement, anchor: CellAddress, head: CellAddress) => boolean) {}

  cancel(widget?: HTMLElement): void {
    if (!widget || this.gesture?.widget === widget) {
      this.gesture?.abort.abort();
      this.gesture = null;
    }
    if (!widget || this.suppressClickWidget === widget) this.suppressClickWidget = null;
  }

  consumeClick(widget: HTMLElement, event: MouseEvent): void {
    if (this.suppressClickWidget !== widget) return;
    this.suppressClickWidget = null;
    event.preventDefault();
    event.stopPropagation();
  }

  begin(event: PointerEvent, widget: HTMLElement, host: HTMLElement, anchor: CellAddress): void {
    this.cancel();
    if (event.button !== 0 || !event.isPrimary || event.shiftKey || event.pointerType === 'touch') return;
    const doc = widget.ownerDocument;
    const win = doc.defaultView;
    const scrollport = widget.querySelector<HTMLElement>('.cm-table-scroll');
    if (!win || !scrollport) return;
    const abort = new AbortController();
    this.gesture = { widget, abort };
    const pointer = event.pointerId;
    const originX = event.clientX, originY = event.clientY;
    let x = originX, y = originY;
    let head = anchor;
    let moved = false;
    let frame = 0;
    const listenerOptions = { capture: true, signal: abort.signal };

    const hit = (cx: number, cy: number) => {
      const target = doc.elementFromPoint(cx, cy)?.closest<HTMLElement>('[data-cell]');
      if (!target || target.closest('[data-table-engine-cells="true"]') !== widget) return;
      const [row, col] = target.dataset.cell!.split(',').map(Number);
      if (!Number.isInteger(row) || !Number.isInteger(col)) return;
      const next = { row: row!, col: col! };
      if (sameCell(next, head)) return;
      // Once we leave the anchor, selection belongs to the table. Remove
      // the native text range before the nested editor is unmounted.
      if (!moved) {
        const selection = doc.getSelection();
        if (selection?.anchorNode && host.contains(selection.anchorNode)) selection.removeAllRanges();
      }
      if (!this.onRange(widget, anchor, next)) return;
      head = next;
      moved = true;
      this.suppressClickWidget = widget;
    };

    const bounds = () => visibleScrollBounds(scrollport.getBoundingClientRect(),
      scrollport.clientWidth, scrollport.clientHeight, win.innerWidth, win.innerHeight);

    const tick = () => {
      if (abort.signal.aborted) return;
      if (!widget.isConnected) { this.cancel(widget); return; }
      const visible = bounds();
      if (visible) {
        const dx = edgeScroll(x, visible.left, visible.right, 48, 28);
        // Permit a wide anchor cell to scroll before the first crossing,
        // but never scroll merely because of a stationary click at an edge.
        const dragged = Math.hypot(x - originX, y - originY) >= 5;
        const outside = x <= visible.left || x >= visible.right;
        if (dx && (moved || (dragged && outside))) {
          const before = scrollport.scrollLeft;
          scrollport.scrollLeft += dx;
          const updated = bounds();
          if (updated && scrollport.scrollLeft !== before) {
            const target = dragScrollTarget(x, y, updated);
            hit(target.x, target.y);
          }
        }
      }
      if (!abort.signal.aborted) frame = win.requestAnimationFrame(tick);
    };
    frame = win.requestAnimationFrame(tick);
    abort.signal.addEventListener('abort', () => win.cancelAnimationFrame(frame), { once: true });

    const finish = (next: PointerEvent) => {
      if (next.pointerId !== pointer) return;
      abort.abort();
      if (this.gesture?.abort === abort) this.gesture = null;
      if (next.type === 'pointercancel') this.suppressClickWidget = null;
    };
    doc.addEventListener('pointermove', next => {
      if (next.pointerId !== pointer) return;
      if (!(next.buttons & 1)) { finish(next); return; }
      x = next.clientX; y = next.clientY;
      hit(x, y);
      if (moved) { next.preventDefault(); next.stopPropagation(); }
    }, listenerOptions);
    // Native text selection stays intact inside the initial cell; prevent
    // compatibility mousemove from restarting it after a range is active.
    doc.addEventListener('mousemove', next => {
      if (moved) { next.preventDefault(); next.stopPropagation(); }
    }, listenerOptions);
    host.addEventListener('dragstart', next => next.preventDefault(), listenerOptions);
    doc.addEventListener('pointerup', finish, listenerOptions);
    doc.addEventListener('pointercancel', finish, listenerOptions);
    win.addEventListener('blur', () => this.cancel(widget), { signal: abort.signal });
  }
}
