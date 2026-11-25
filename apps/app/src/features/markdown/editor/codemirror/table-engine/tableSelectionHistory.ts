import { invertedEffects } from '@codemirror/commands';
import { StateEffect, type Transaction } from '@codemirror/state';
import { type TableInteraction } from './tableInteraction';

export interface SelectionBookmark {
  readonly tableFrom: number;
  readonly interaction: TableInteraction;
}
interface SelectionTransition {
  readonly before: SelectionBookmark | null;
  readonly after: SelectionBookmark | null;
}

/** A bookmark is view intent, not a second document or undo stack.
 * Editing is restored as caret-free cell selection, never as a live editor.
 */
export function bookmark(tableFrom: number, interaction: TableInteraction): SelectionBookmark | null {
  if (interaction.kind === 'none') return null;
  return { tableFrom, interaction: interaction.kind === 'editing' ? { kind: 'cell', cell: interaction.cell } : interaction };
}
export const tableSelectionTransition = StateEffect.define<SelectionTransition>({
  map(value, changes) {
    const map = (mark: SelectionBookmark | null) => mark && ({ ...mark, tableFrom: changes.mapPos(mark.tableFrom, -1) });
    return { before: map(value.before), after: map(value.after) };
  },
});
export const tableSelectionHistory = invertedEffects.of(tr => tr.effects.flatMap(effect =>
  effect.is(tableSelectionTransition) ? [tableSelectionTransition.of({ before: effect.value.after, after: effect.value.before })] : []
));

/** Undefined means an ordinary history event with no table intent.
 * Null means an explicit request to clear table selection.
 */
export function restoredSelection(tr: Transaction): SelectionBookmark | null | undefined {
  if (!tr.isUserEvent('undo') && !tr.isUserEvent('redo')) return undefined;
  let result: SelectionBookmark | null | undefined;
  for (const effect of tr.effects) if (effect.is(tableSelectionTransition)) result = effect.value.after;
  return result;
}
