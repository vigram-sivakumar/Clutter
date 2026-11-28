import type { CellAddress } from './tableCellTransaction';

export interface TableShape { readonly rows: number; readonly cols: number }
export type TableInteraction =
  | { readonly kind: 'none' }
  | { readonly kind: 'editing'; readonly cell: CellAddress }
  | { readonly kind: 'cell'; readonly cell: CellAddress }
  | { readonly kind: 'range'; readonly anchor: CellAddress; readonly head: CellAddress }
  | { readonly kind: 'row' | 'column'; readonly cell: CellAddress }
  | { readonly kind: 'table'; readonly cell: CellAddress };

export const noInteraction: TableInteraction = { kind: 'none' };
export type Direction = 'left' | 'right' | 'up' | 'down';

export function isValidCell(cell: CellAddress, shape: TableShape): boolean {
  return Number.isInteger(cell.row) && Number.isInteger(cell.col) &&
    cell.row >= 0 && cell.row < shape.rows && cell.col >= 0 && cell.col < shape.cols;
}
export function focusCell(state: TableInteraction): CellAddress | null {
  return state.kind === 'none' ? null : state.kind === 'range' ? state.head : state.cell;
}
export function clampInteraction(state: TableInteraction, shape: TableShape): TableInteraction {
  if (state.kind === 'none') return state;
  if (!isValidCell(focusCell(state)!, shape)) return noInteraction;
  if (state.kind === 'range' && !isValidCell(state.anchor, shape)) return noInteraction;
  return state;
}
export function selectionBounds(state: TableInteraction, shape: TableShape) {
  const focus = focusCell(state);
  if (!focus || state.kind === 'editing' || !isValidCell(focus, shape)) return null;
  if (state.kind === 'table') return { top: 0, bottom: shape.rows - 1, left: 0, right: shape.cols - 1 };
  if (state.kind === 'row') return { top: focus.row, bottom: focus.row, left: 0, right: shape.cols - 1 };
  if (state.kind === 'column') return { top: 0, bottom: shape.rows - 1, left: focus.col, right: focus.col };
  const anchor = state.kind === 'range' ? state.anchor : focus;
  if (!isValidCell(anchor, shape)) return null;
  return { top: Math.min(anchor.row, focus.row), bottom: Math.max(anchor.row, focus.row),
    left: Math.min(anchor.col, focus.col), right: Math.max(anchor.col, focus.col) };
}
export function isSelected(state: TableInteraction, cell: CellAddress, shape: TableShape): boolean {
  const bounds = selectionBounds(state, shape);
  return !!bounds && cell.row >= bounds.top && cell.row <= bounds.bottom &&
    cell.col >= bounds.left && cell.col <= bounds.right;
}

/** Resolve the row-major destination without mounting an editor.
 * The controller owns activation, caret placement and focus transfer at edges.
 */
export function tabInteraction(state: TableInteraction, shape: TableShape, backwards: boolean): TableInteraction {
  const cell = focusCell(state);
  if (!cell || !isValidCell(cell, shape)) return noInteraction;
  const index = cell.row * shape.cols + cell.col + (backwards ? -1 : 1);
  if (index < 0 || index >= shape.rows * shape.cols) return noInteraction;
  return { kind: 'cell', cell: { row: Math.floor(index / shape.cols), col: index % shape.cols } };
}

/** Arrows remain inside the table. Shift retains the original range anchor. */
export function arrowInteraction(state: TableInteraction, shape: TableShape, direction: Direction, extend: boolean): TableInteraction {
  const cell = focusCell(state);
  if (!cell || !isValidCell(cell, shape)) return noInteraction;
  const delta = direction === 'left' ? [0, -1] : direction === 'right' ? [0, 1] : direction === 'up' ? [-1, 0] : [1, 0];
  const next = { row: cell.row + delta[0]!, col: cell.col + delta[1]! };
  const head = isValidCell(next, shape) ? next : cell;
  return extend ? { kind: 'range', anchor: state.kind === 'range' ? state.anchor : cell, head } : { kind: 'cell', cell: head };
}
export function extendInteraction(state: TableInteraction, shape: TableShape, head: CellAddress): TableInteraction {
  if (!isValidCell(head, shape)) return noInteraction;
  const anchor = state.kind === 'range' ? state.anchor : focusCell(state);
  return anchor && isValidCell(anchor, shape) ? { kind: 'range', anchor, head } : { kind: 'cell', cell: head };
}
