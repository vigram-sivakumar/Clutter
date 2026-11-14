import { goToNextCell, addRowAfter } from 'prosemirror-tables';
// Archived pre-clarification control (0.13). Not the current table policy.
export function nextCellOrRow(state, dispatch) {
  return (
    goToNextCell(1)(state, dispatch) ||
    addRowAfter(
      state,
      dispatch &&
        ((tr) => {
          const after = state.apply(tr);
          goToNextCell(1)(after, (move) => tr.setSelection(move.selection));
          dispatch(tr);
        })
    )
  );
}
