import { invertedEffects } from '@codemirror/commands';
import { EditorState, StateEffect, Transaction } from '@codemirror/state';
import { sharedMarkdownParser } from '../../../render/sharedMarkdownParser';
import { projectableTableSnapshot } from './tableModel';
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

/** A single newly formed top-level table from ordinary user input (e.g.
 * pasted Markdown or a command inserting Markdown) gets the same selection
 * bookmark. Never select an existing table, external refresh, or ambiguous
 * multi-table insertion. Explicit engine transactions already own intent. */
export const selectNewMarkdownTable = EditorState.transactionExtender.of(tr => {
  if (!tr.docChanged || tr.startState.readOnly || !tr.isUserEvent('input') ||
      tr.annotation(Transaction.addToHistory) === false ||
      tr.effects.some(effect => effect.is(tableSelectionTransition))) return null;
  const ranges: { from: number; to: number }[] = [];
  tr.changes.iterChanges((_a, _b, from, to, inserted) => {
    if (/[|:\-]/.test(inserted.toString())) ranges.push({ from, to });
  });
  if (!ranges.length) return null;
  const oldSource = tr.startState.doc.toString();
  const source = tr.newDoc.toString();
  const oldRanges: { from: number; to: number }[] = [];
  sharedMarkdownParser.parse(oldSource).iterate({ enter(node) {
    if (node.name !== 'Table') return;
    const table = projectableTableSnapshot(oldSource, node.node);
    if (table) oldRanges.push({
      from: tr.changes.mapPos(table.from, 1),
      to: tr.changes.mapPos(table.to, -1),
    });
    return false;
  } });
  const candidates: number[] = [];
  sharedMarkdownParser.parse(source).iterate({ enter(node) {
    if (node.name !== 'Table') return;
    const table = projectableTableSnapshot(source, node.node);
    if (table && ranges.some(r => r.from < table.to && r.to > table.from) &&
        !oldRanges.some(r => r.from < table.to && r.to > table.from)) {
      candidates.push(table.from);
    }
    return false;
  } });
  if (candidates.length !== 1) return null;
  return { effects: tableSelectionTransition.of({
    before: null,
    after: bookmark(candidates[0]!, { kind: 'table', cell: { row: 0, col: 0 } }),
  }) };
});

/** Undefined means an ordinary history event with no table intent.
 * Null means an explicit request to clear table selection.
 */
export function restoredSelection(tr: Transaction): SelectionBookmark | null | undefined {
  if (!tr.isUserEvent('undo') && !tr.isUserEvent('redo')) return undefined;
  let result: SelectionBookmark | null | undefined;
  for (const effect of tr.effects) if (effect.is(tableSelectionTransition)) result = effect.value.after;
  return result;
}
