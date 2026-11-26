// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { TableDragSelection } from './tableDragSelection';

describe('table engine drag scrolling', () => {
  it('scrolls a wide anchor, re-hit-tests the visible edge, and stops on release', () => {
    const widget = document.createElement('div');
    widget.dataset.tableEngineCells = 'true';
    widget.innerHTML = '<div class="cm-table-scroll"><div data-cell="0,0">A</div><div data-cell="0,1">B</div></div>';
    document.body.append(widget);
    const scroll = widget.firstElementChild as HTMLElement;
    const anchor = scroll.firstElementChild as HTMLElement;
    const head = scroll.lastElementChild as HTMLElement;
    Object.defineProperties(scroll, { clientWidth: { value: 200 }, clientHeight: { value: 60 } });
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue({
      x: 20, y: 20, left: 20, top: 20, right: 220, bottom: 80, width: 200, height: 60, toJSON: () => ({}),
    });
    const oldHit = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    const hit = vi.fn((x: number, _y: number) => scroll.scrollLeft > 0 && x <= 219 ? head : anchor);
    Object.defineProperty(document, 'elementFromPoint', { value: hit, configurable: true });
    let frame: FrameRequestCallback | undefined;
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1; });
    const caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const range = vi.fn(() => true);
    const drag = new TableDragSelection(range);
    const pointer = (type: string, x: number, buttons = 1) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 40, buttons });
      Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true }, pointerType: { value: 'mouse' } });
      return event as unknown as PointerEvent;
    };
    try {
      drag.begin(pointer('pointerdown', 210), widget, anchor, { row: 0, col: 0 });
      frame!(0);
      expect(scroll.scrollLeft).toBe(0);
      document.dispatchEvent(pointer('pointermove', 240));
      frame!(16);
      expect(scroll.scrollLeft).toBeGreaterThan(0);
      expect(hit).toHaveBeenLastCalledWith(219, 40);
      expect(range).toHaveBeenCalledWith(widget, { row: 0, col: 0 }, { row: 0, col: 1 });
      const stopped = scroll.scrollLeft;
      document.dispatchEvent(pointer('pointerup', 240, 0));
      frame!(32);
      expect(scroll.scrollLeft).toBe(stopped);
      expect(caf).toHaveBeenCalled();
    } finally {
      drag.cancel();
      raf.mockRestore(); caf.mockRestore();
      if (oldHit) Object.defineProperty(document, 'elementFromPoint', oldHit);
      else Reflect.deleteProperty(document, 'elementFromPoint');
      widget.remove();
    }
  });
});
