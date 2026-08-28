// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { IndentTokenWidget } from './IndentTokenWidget';

/**
 * `coordsAt` is a pure function of (dom rect, pos, length) -- jsdom has no
 * layout engine so `getBoundingClientRect()` on a real, rendered widget
 * always returns zeros (see leadingIndentDecoration.test.ts's own doc
 * comment on this limitation); these tests instead stub the rect
 * `coordsAt` reads, exactly like a real browser would report a token
 * rendered at some real position, and verify the interpolation math
 * against it directly. Real-browser confirmation of the full mechanism
 * (that `coordsAtPos` actually reaches this method with real geometry)
 * is documented in docs/editor-architecture-decisions.md, not here.
 */
function stubbedDom(rect: { left: number; right: number; top: number; bottom: number }): HTMLElement {
  const el = document.createElement('span');
  el.getBoundingClientRect = () =>
    ({
      ...rect,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      x: rect.left,
      y: rect.top,
      toJSON() {
        return this;
      },
    }) as DOMRect;
  return el;
}

describe('IndentTokenWidget.coordsAt', () => {
  it('a 2-character token (default indentUnit space run): pos 0/1/2 land at left edge, midpoint, right edge', () => {
    const widget = new IndentTokenWidget(2);
    const dom = stubbedDom({ left: 100, right: 120, top: 10, bottom: 26 });

    expect(widget.coordsAt(dom, 0, 1)).toEqual({ left: 100, right: 100, top: 10, bottom: 26 });
    expect(widget.coordsAt(dom, 1, 1)).toEqual({ left: 110, right: 110, top: 10, bottom: 26 });
    expect(widget.coordsAt(dom, 2, -1)).toEqual({ left: 120, right: 120, top: 10, bottom: 26 });
  });

  it('a 1-character token (tab, or a 1-character indentUnit): pos 0/1 land at the two edges, no interior point', () => {
    const widget = new IndentTokenWidget(1);
    const dom = stubbedDom({ left: 200, right: 220, top: 0, bottom: 16 });

    expect(widget.coordsAt(dom, 0, 1)?.left).toBe(200);
    expect(widget.coordsAt(dom, 1, -1)?.left).toBe(220);
  });

  it('a 4-character token (e.g. a 4-space indentUnit): interpolates evenly into quarters', () => {
    const widget = new IndentTokenWidget(4);
    const dom = stubbedDom({ left: 0, right: 40, top: 0, bottom: 20 });

    expect(widget.coordsAt(dom, 0, 1)?.left).toBe(0);
    expect(widget.coordsAt(dom, 1, 1)?.left).toBe(10);
    expect(widget.coordsAt(dom, 2, 1)?.left).toBe(20);
    expect(widget.coordsAt(dom, 3, 1)?.left).toBe(30);
    expect(widget.coordsAt(dom, 4, 1)?.left).toBe(40);
  });

  it('never hardcodes a pixel width -- follows whatever the real DOM box measures, in this case a non-default marker width', () => {
    const widget = new IndentTokenWidget(2);
    const dom = stubbedDom({ left: 50, right: 82, top: 0, bottom: 20 }); // 32px box, not 20px
    expect(widget.coordsAt(dom, 1, 1)?.left).toBe(66); // 50 + 32/2
  });

  it('vertical geometry is passed through unmodified from the measured box -- never shifted, transformed, or recomputed', () => {
    const widget = new IndentTokenWidget(2);
    const dom = stubbedDom({ left: 0, right: 20, top: 214, bottom: 230 });
    for (const pos of [0, 1, 2]) {
      const rect = widget.coordsAt(dom, pos, 1);
      expect(rect?.top).toBe(214);
      expect(rect?.bottom).toBe(230);
    }
  });

  it('degenerate zero-length token does not divide by zero', () => {
    const widget = new IndentTokenWidget(0);
    const dom = stubbedDom({ left: 5, right: 5, top: 0, bottom: 16 });
    expect(widget.coordsAt(dom, 0, 1)?.left).toBe(5);
  });
});
