import { isolateHistory } from '@codemirror/commands';
import { EditorState, Transaction, type StateEffect, type ChangeSpec, type EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { planTableEdit, type TableCommand } from './tableCommands';
import { readTable, TableEngineError, type ParseMarkdown } from './tableModel';

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
  selection?: EditorSelection | { anchor: number }
): Transaction {
  if (state.readOnly) throw new TableEngineError('Read-only document');
  const tr = state.update({
    changes, userEvent, selection,
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

type RootTableCommand = TableCommand | { readonly kind: 'deleteTable' };

export function createTableTransaction(state: EditorState, tableFrom: number, command: RootTableCommand, parse: ParseMarkdown, effect?: StateEffect<unknown>): Transaction | null {
  if (state.readOnly) return null;
  const source = state.doc.toString();
  if (command.kind === 'deleteTable') {
    const { from, to } = readTable(source, tableFrom, parse);
    return validatedRootEdit(state, { from, to }, source.slice(0, from) + source.slice(to),
      'delete.table', true, effect, { anchor: from });
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
