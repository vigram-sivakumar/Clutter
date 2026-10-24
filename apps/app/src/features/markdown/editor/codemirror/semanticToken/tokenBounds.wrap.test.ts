// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorView } from '@codemirror/view';

import { isWithinTokenBounds, renderedTokenRects } from './tokenMouseHandlers';

type Box = readonly [left: number, top: number, right: number, bottom: number];

const toRect = ([left, top, right, bottom]: Box) => ({ left, top, right, bottom, width: right - left, height: bottom - top });

/**
 * A token that soft-wrapped: it begins at the start of line 2 (x 48–183), but its `from` position is also the
 * wrap point at the END of line 1, which is where `coordsAtPos(from, 1)` answers. jsdom has no layout, so the
 * geometry a browser reports is supplied here.
 */
function fakeView(options: { rendered: readonly Box[]; start: Box | null; end: Box | null }): EditorView {
  return {
    domAtPos: () => ({ node: document.body, offset: 0 }),
    coordsAtPos: (_pos: number, side: number) => {
      const box = side === 1 ? options.start : options.end;
      return box ? toRect(box) : null;
    },
  } as unknown as EditorView;
}

const node = { from: 71, to: 88 };

beforeEach(() => {
  vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(() => [] as unknown as DOMRectList);
});
afterEach(() => vi.restoreAllMocks());

function renderedAs(boxes: readonly Box[]) {
  vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(
    () => boxes.map(toRect) as unknown as DOMRectList
  );
}

describe('a token that wraps onto the next visual line', () => {
  // `from` reports the end of line 1 (zero width), `to` the end of the wrapped text on line 2.
  const wrapped = fakeView({ rendered: [], start: [547, 195, 547, 211], end: [183, 216, 183, 240] });

  it('is hit anywhere on its own rendered box, not just between the two endpoint positions', () => {
    renderedAs([[48, 216, 183, 240]]);
    expect(isWithinTokenBounds(wrapped, node, 66, 228)).toBe(true);
    expect(isWithinTokenBounds(wrapped, node, 150, 228)).toBe(true);
  });

  it('is not hit in the empty space its endpoint box used to cover (end of the line above)', () => {
    renderedAs([[48, 216, 183, 240]]);
    expect(isWithinTokenBounds(wrapped, node, 400, 200)).toBe(false);
  });

  it('is hit on each fragment when the token itself breaks across two lines', () => {
    renderedAs([
      [547, 192, 641, 216],
      [48, 216, 88, 240],
    ]);
    expect(isWithinTokenBounds(wrapped, node, 600, 204)).toBe(true);
    expect(isWithinTokenBounds(wrapped, node, 60, 228)).toBe(true);
    expect(isWithinTokenBounds(wrapped, node, 300, 228)).toBe(false);
  });

  it('ignores zero-width boxes at a boundary', () => {
    renderedAs([
      [547, 195, 547, 211],
      [48, 216, 183, 240],
    ]);
    expect(renderedTokenRects(wrapped, node)).toHaveLength(1);
  });
});

describe('a token on one line', () => {
  it('is hit inside its box and not past its end', () => {
    const view = fakeView({ rendered: [], start: [197, 192, 197, 216], end: [305, 192, 305, 216] });
    renderedAs([[197, 192, 305, 216]]);
    expect(isWithinTokenBounds(view, node, 250, 204)).toBe(true);
    expect(isWithinTokenBounds(view, node, 600, 204)).toBe(false);
  });
});

describe('when the layout cannot be measured', () => {
  it('falls back to the endpoint box, as before', () => {
    const view = fakeView({ rendered: [], start: [100, 10, 100, 30], end: [200, 10, 200, 30] });
    expect(isWithinTokenBounds(view, node, 150, 20)).toBe(true);
    expect(isWithinTokenBounds(view, node, 250, 20)).toBe(false);
  });

  it('allows the click when there are no coordinates at all', () => {
    expect(isWithinTokenBounds(fakeView({ rendered: [], start: null, end: null }), node, 1, 1)).toBe(true);
  });
});
