import { EditorState, TextSelection } from 'prosemirror-state';
import {
  TableMap,
  CellSelection,
  addRowAfter,
  addColumnAfter,
} from 'prosemirror-tables';

export function cellContext(state) {
  if (state.selection instanceof CellSelection) {
    const { $anchorCell, $headCell } = state.selection;
    if ($anchorCell.pos !== $headCell.pos) return null;
    const table = $headCell.node(-1),
      tablePos = $headCell.before($headCell.depth - 1),
      start = tablePos + 1;
    const map = TableMap.get(table),
      offset = $headCell.pos - start;
    return { table, tablePos, start, map, offset, rect: map.findCell(offset) };
  }
  if (!(state.selection instanceof TextSelection)) return null;
  const $head = state.selection.$head;
  for (let depth = $head.depth; depth > 0; depth--) {
    if (
      !['cell', 'header_cell'].includes($head.node(depth).type.spec.tableRole)
    )
      continue;
    const table = $head.node(depth - 2),
      tablePos = $head.before(depth - 2),
      start = tablePos + 1;
    const map = TableMap.get(table),
      offset = $head.before(depth) - start;
    return { table, tablePos, start, map, offset, rect: map.findCell(offset) };
  }
  return null;
}
export function cellEnd(doc, position) {
  const cell = doc.nodeAt(position);
  if (!cell || !['cell', 'header_cell'].includes(cell.type.spec.tableRole))
    throw new Error('NOT_A_CELL');
  // The declared schema has paragraph+ cell content, including hard breaks.
  return TextSelection.create(doc, position + cell.nodeSize - 2);
}
function navigate(direction, vertical = false) {
  return (state, dispatch) => {
    const at = cellContext(state);
    if (!at) return false;
    let target;
    if (vertical)
      target =
        at.rect.bottom < at.map.height
          ? at.map.map[at.rect.bottom * at.map.width + at.rect.left]
          : null;
    else {
      const cells = [...new Set(at.map.map)],
        index = cells.indexOf(at.offset) + direction;
      target = cells[index] ?? null;
    }
    // Forward boundary is an intentional no-op, not schema growth or focus escape.
    // First-cell Shift-Tab keeps the previous native backward focus escape.
    if (target == null)
      return (
        state.selection instanceof CellSelection || vertical || direction > 0
      );
    if (dispatch)
      dispatch(
        state.tr
          .setSelection(
            state.selection instanceof CellSelection
              ? CellSelection.create(state.doc, at.start + target)
              : cellEnd(state.doc, at.start + target)
          )
          .setMeta('addToHistory', false)
          .scrollIntoView()
      );
    return true;
  };
}
export const nextCell = navigate(1);
export const previousCell = navigate(-1);
const moveDown = navigate(1, true);
export function nextRowSameColumn(state, dispatch) {
  const at = cellContext(state);
  if (at && state.selection instanceof CellSelection) {
    if (dispatch)
      dispatch(
        state.tr
          .setSelection(cellEnd(state.doc, at.start + at.offset))
          .setMeta('addToHistory', false)
      );
    return true;
  }
  return moveDown(state, dispatch);
}
export function selectCurrentCell(state, dispatch) {
  const at = cellContext(state);
  if (!at) return false;
  if (state.selection instanceof CellSelection) return true;
  if (dispatch)
    dispatch(
      state.tr
        .setSelection(CellSelection.create(state.doc, at.start + at.offset))
        .setMeta('addToHistory', false)
    );
  return true;
}
export function cellLineBreak(state, dispatch) {
  if (!(state.selection instanceof TextSelection) || !cellContext(state))
    return false;
  if (dispatch)
    dispatch(
      state.tr
        .replaceSelectionWith(state.schema.nodes.hard_break.create())
        .scrollIntoView()
    );
  return true;
}
export function appendTableAxis(state, dispatch, tablePos, axis) {
  const table = state.doc.nodeAt(tablePos);
  if (table?.type.spec.tableRole !== 'table') return false;
  const map = TableMap.get(table);
  if (map.problems?.length) return false;
  const start = tablePos + 1,
    source =
      axis === 'row'
        ? map.map[(map.height - 1) * map.width]
        : map.map[map.width - 1];
  const targetState = EditorState.create({
    doc: state.doc,
    selection: cellEnd(state.doc, start + source),
  });
  const command =
    axis === 'row' ? addRowAfter : axis === 'column' ? addColumnAfter : null;
  if (!command) return false;
  return command(
    targetState,
    dispatch &&
      ((tr) => {
        // Placement of the addition uses a temporary last-axis selection, but
        // the user's original selection belongs to the view and stays mapped.
        dispatch(tr.setSelection(state.selection.map(tr.doc, tr.mapping)));
      })
  );
}
