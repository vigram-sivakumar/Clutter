import { describe, expect, it } from 'vitest';
import { EDGE_BAND_RATIO, resolveDropRegion, sameDropTarget } from './dropTarget';

const at = (height: number, ratio: number, canContain: boolean) =>
  resolveDropRegion({ top: 1000, height }, 1000 + height * ratio, canContain);

describe('resolveDropRegion', () => {
  it.each([20, 28, 40, 64])('uses the same proportional bands at row height %ipx', (height) => {
    expect(at(height, 0.0, true)).toBe('before');
    expect(at(height, EDGE_BAND_RATIO - 0.01, true)).toBe('before');
    expect(at(height, EDGE_BAND_RATIO + 0.01, true)).toBe('inside');
    expect(at(height, 0.5, true)).toBe('inside');
    expect(at(height, 1 - EDGE_BAND_RATIO - 0.01, true)).toBe('inside');
    expect(at(height, 1 - EDGE_BAND_RATIO + 0.01, true)).toBe('after');
    expect(at(height, 0.99, true)).toBe('after');
  });

  it('a row that cannot contain the item has no central band: the halves are before and after', () => {
    expect(at(28, 0.1, false)).toBe('before');
    expect(at(28, 0.49, false)).toBe('before');
    expect(at(28, 0.5, false)).toBe('after');
    expect(at(28, 0.9, false)).toBe('after');
  });

  it('is exclusive and exhaustive: every point is in exactly one region, with no gap at the boundaries', () => {
    const regions = new Set<string>();
    for (let step = 0; step < 100; step++) {
      regions.add(at(28, step / 100, true));
    }
    expect([...regions].sort()).toEqual(['after', 'before', 'inside']);
  });

  it('survives a zero-height rect', () => {
    expect(resolveDropRegion({ top: 0, height: 0 }, 0, true)).toBe('inside');
  });
});

describe('sameDropTarget', () => {
  const inside = { kind: 'inside', folderId: 'a', rect: { top: 1, left: 2, width: 3, height: 4 } } as const;
  const insert = { kind: 'insert', parentId: null, edge: 'before', rowId: 'a', rowKind: 'folder', line: { y: 1, left: 2, width: 3 } } as const;

  it('compares by value, and never equates the two kinds', () => {
    expect(sameDropTarget(null, null)).toBe(true);
    expect(sameDropTarget(inside, { ...inside })).toBe(true);
    expect(sameDropTarget(insert, { ...insert })).toBe(true);
    expect(sameDropTarget(inside, insert)).toBe(false);
    expect(sameDropTarget(inside, null)).toBe(false);
    expect(sameDropTarget(insert, { ...insert, line: { ...insert.line, y: 2 } })).toBe(false);
  });
});
