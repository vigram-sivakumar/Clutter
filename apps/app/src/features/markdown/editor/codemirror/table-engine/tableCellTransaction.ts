import { validatedRootEdit } from './tableTransaction';
import { ChangeSet, EditorState, type Transaction, type ChangeSpec, type StateEffect } from '@codemirror/state';
import { applyTableCommand } from './tableCommands';
import { modelsEqual, readTable, TableEngineError, type ParseMarkdown, type TableSnapshot } from './tableModel';

export interface CellAddress { readonly row: number; readonly col: number }
export interface EditableCell { readonly from: number; readonly to: number; readonly text: string }

/** The mapped editor currently requires materialised cells with canonical padding. Reserve one
 * padding space on either side; any additional spaces are editable content.
 * This allows typing a trailing space without losing it to model trimming.
 */
export function editableCell(source: string, table: TableSnapshot, address: CellAddress): EditableCell {
  const cell = table.cells[address.row]?.[address.col];
  if (!cell || cell.rawTo - cell.rawFrom < 2 ||
    source[cell.rawFrom] !== ' ' || source[cell.rawTo - 1] !== ' ') {
    throw new TableEngineError('Cell needs explicit formatting/materialisation before editing');
  }
  const from = cell.rawFrom + 1;
  const to = cell.rawTo - 1;
  return { from, to, text: source.slice(from, to) };
}

/** Map the nested ChangeSet to the exact editable source span. Validate
 * before either view accepts the edit. No full-cell or full-table rewrite,
 * no independent history, no normalization after a transaction.
 */
export function createCellTransaction(
  state: EditorState,
  tableFrom: number,
  address: CellAddress,
  previousCellText: string,
  changes: ChangeSet,
  parse: ParseMarkdown,
  userEvent = 'input.type',
  effect?: StateEffect<unknown>
): Transaction | null {
  if (state.readOnly) throw new TableEngineError('Read-only document');
  const source = state.doc.toString();
  const before = readTable(source, tableFrom, parse);
  const range = editableCell(source, before, address);
  if (range.text !== previousCellText || changes.length !== range.text.length) {
    throw new TableEngineError('Stale cell revision');
  }
  if (changes.empty) return null;
  const mapped: ChangeSpec[] = [];
  changes.iterChanges((from, to, _fromB, _toB, inserted) => {
    mapped.push({ from: range.from + from, to: range.from + to, insert: inserted });
  });
  const expectedDoc = state.changes(mapped).apply(state.doc).toString();
  const nextText = expectedDoc.slice(range.from, range.from + changes.newLength);
  if (/[\r\n]/.test(nextText)) throw new TableEngineError('Cell must stay on one source line');
  const expectedModel = applyTableCommand(before.model, { kind: 'setCell', ...address, markdown: nextText });
  const after = readTable(expectedDoc, tableFrom, parse);
  if (!modelsEqual(expectedModel, after.model) ||
    after.to !== before.to + changes.newLength - changes.length ||
    editableCell(expectedDoc, after, address).text !== nextText) {
    throw new TableEngineError('Cell edit would alter table structure');
  }
  return validatedRootEdit(state, mapped, expectedDoc, userEvent, false, effect);
}

/** Compute the minimal contiguous change between two cell strings. */
export function diffCellText(before: string, after: string): ChangeSet {
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from++;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > from && newEnd > from && before[oldEnd - 1] === after[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  return ChangeSet.of({ from, to: oldEnd, insert: after.slice(from, newEnd) }, before.length);
}
