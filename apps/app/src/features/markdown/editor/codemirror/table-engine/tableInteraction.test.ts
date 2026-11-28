import { describe, expect, it } from 'vitest';
import { arrowInteraction, clampInteraction, extendInteraction, isSelected, selectionBounds, tabInteraction, type TableInteraction } from './tableInteraction';

const shape = { rows: 3, cols: 3 };
const cell = (row: number, col: number): TableInteraction => ({ kind: 'cell', cell: { row, col } });

describe('table interaction state', () => {
  it('resolves either Tab destination independently of editor activation', () => {
    const edit: TableInteraction = { kind: 'editing', cell: { row: 1, col: 1 } };
    expect(tabInteraction(edit, shape, false)).toEqual(cell(1, 2));
    expect(tabInteraction(edit, shape, true)).toEqual(cell(1, 0));
  });
  it('wraps symmetrically between rows', () => {
    expect(tabInteraction(cell(0, 2), shape, false)).toEqual(cell(1, 0));
    expect(tabInteraction(cell(1, 0), shape, true)).toEqual(cell(0, 2));
  });
  it('exits at the first and last cells rather than trapping focus', () => {
    expect(tabInteraction(cell(0, 0), shape, true)).toEqual({ kind: 'none' });
    expect(tabInteraction(cell(2, 2), shape, false)).toEqual({ kind: 'none' });
  });
  it('extends and shrinks a range with a stable anchor', () => {
    let state = arrowInteraction(cell(1, 1), shape, 'right', true);
    state = arrowInteraction(state, shape, 'down', true);
    expect(selectionBounds(state, shape)).toEqual({ top: 1, bottom: 2, left: 1, right: 2 });
    state = arrowInteraction(state, shape, 'left', true);
    expect(selectionBounds(state, shape)).toEqual({ top: 1, bottom: 2, left: 1, right: 1 });
    expect(arrowInteraction(state, shape, 'up', false)).toEqual(cell(1, 1));
  });
  it('normalises reverse ranges and distinguishes editing from selection', () => {
    const state = extendInteraction(cell(2, 2), shape, { row: 0, col: 1 });
    expect(selectionBounds(state, shape)).toEqual({ top: 0, bottom: 2, left: 1, right: 2 });
    expect(isSelected(state, { row: 1, col: 1 }, shape)).toBe(true);
    expect(isSelected({ kind: 'editing', cell: { row: 1, col: 1 } }, { row: 1, col: 1 }, shape)).toBe(false);
  });
  it('represents row, column and whole table selections in the same model', () => {
    const at = { row: 1, col: 1 };
    expect(selectionBounds({ kind: 'row', cell: at }, shape)).toEqual({ top: 1, bottom: 1, left: 0, right: 2 });
    expect(selectionBounds({ kind: 'column', cell: at }, shape)).toEqual({ top: 0, bottom: 2, left: 1, right: 1 });
    expect(selectionBounds({ kind: 'table', cell: at }, shape)).toEqual({ top: 0, bottom: 2, left: 0, right: 2 });
  });
  it('clears a selection made invalid by a structural change', () => {
    expect(clampInteraction(cell(2, 2), { rows: 2, cols: 3 })).toEqual({ kind: 'none' });
    expect(clampInteraction(extendInteraction(cell(2, 2), shape, { row: 0, col: 0 }), { rows: 2, cols: 3 })).toEqual({ kind: 'none' });
  });
});
