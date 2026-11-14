import { goToNextCell, addRowAfter } from 'prosemirror-tables';
// Explicit exploratory Q-04 profile, shared by the raw control and two-view lab.
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
