import { isolateHistory } from '@codemirror/commands';
import { EditorState, Transaction, type StateEffect, type ChangeSpec, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { resolveTableColumnWidths, tableRemovalRangeIncludingWidths } from '../table/tableColumnWidthMetadata';
import type { TableInfo } from '../table/tableGeometry';
import { planTableEdit, type TableCommand } from './tableCommands';
import { projectableTableSnapshot, readTable, TableEngineError, type ParseMarkdown } from './tableModel';

/** Construct exactly one root history entry from a validated Markdown edit.
 * Filters still run. Refuse any change to the proposed source or history intent.
 */
export function validatedRootEdit(
  state: EditorState,
  changes: ChangeSpec,
  expectedDocument: string,
  userEvent: string,
  isolated: boolean,
  effect?: StateEffect<unknown>,
  placement?: Pick<TransactionSpec, 'selection' | 'scrollIntoView'>
): Transaction {
  if (state.readOnly) throw new TableEngineError('Read-only document');
  const tr = state.update({
    changes, userEvent, ...placement,
    annotations: isolated ? isolateHistory.of('full') : undefined,
    effects: effect,
  });
  if (tr.newDoc.toString() !== expectedDocument || tr.annotation(Transaction.userEvent) !== userEvent ||
    tr.annotation(Transaction.addToHistory) === false || (isolated && tr.annotation(isolateHistory) !== 'full') ||
    (effect !== undefined && !tr.effects.includes(effect))) {
    throw new TableEngineError('Table transaction did not survive editor filters unchanged');
  }
  return tr;
}

function createTableRemoval(state: EditorState, from: number, to: number, effect?: StateEffect<unknown>): Transaction {
  const expected = state.doc.sliceString(0, from) + state.doc.sliceString(to);
  return validatedRootEdit(state, { from, to }, expected, 'delete.table', true, effect,
    { selection: { anchor: from }, scrollIntoView: true });
}

/** The live projection already has the shared grammar node. Removing a complete
 * table also works for imported rows the rectangular model cannot represent.
 * Only a width line positively associated with that table belongs to the edit.
 */
export function deleteProjectedTable(view: EditorView, table: TableInfo, effect: StateEffect<unknown>, engineOnly = false): boolean {
  if (view.state.readOnly) return false;
  const range = engineOnly
    ? projectableTableSnapshot(view.state.doc.toString(), table.node)
    : tableRemovalRangeIncludingWidths(table, resolveTableColumnWidths(view.state, table));
  if (!range) return false;
  const { from, to } = range;
  let transaction: Transaction;
  try {
    transaction = createTableRemoval(view.state, from, to, effect);
  } catch (error) {
    if (error instanceof TableEngineError) return false;
    throw error;
  }
  view.dispatch(transaction);
  return true;
}

type RootTableCommand = TableCommand | { readonly kind: 'deleteTable' };

export function createTableTransaction(state: EditorState, tableFrom: number, command: RootTableCommand, parse: ParseMarkdown, effect?: StateEffect<unknown>): Transaction | null {
  if (state.readOnly) return null;
  const source = state.doc.toString();
  if (command.kind === 'deleteTable') {
    const { from, to } = readTable(source, tableFrom, parse);
    return createTableRemoval(state, from, to, effect);
  }
  const edit = planTableEdit(source, tableFrom, command, parse);
  if (!edit) return null;
  return validatedRootEdit(state, edit.change, edit.expectedDocument, 'input.table', true, effect);
}

export function executeTableCommand(view: EditorView, tableFrom: number, command: RootTableCommand, parse: ParseMarkdown, effect?: StateEffect<unknown>): boolean {
  const tr = createTableTransaction(view.state, tableFrom, command, parse, effect);
  if (!tr) return false;
  view.dispatch(tr);
  return true;
}
