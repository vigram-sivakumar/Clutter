import { isolateHistory } from '@codemirror/commands';
import { EditorState, Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { planTableEdit, type TableCommand } from './tableCommands';
import { TableEngineError, type ParseMarkdown } from './tableModel';

/** Isolated prototype adapter for structural edits only. The root history is
 * the sole history. A later cell-edit adapter must forward minimal mapped
 * changes rather than replace the full table on each keystroke.
 */
export function createTableTransaction(state: EditorState, tableFrom: number, command: TableCommand, parse: ParseMarkdown): Transaction | null {
  if (state.readOnly) return null;
  const edit = planTableEdit(state.doc.toString(), tableFrom, command, parse);
  if (!edit) return null;
  const tr = state.update({
    changes: edit.change,
    annotations: isolateHistory.of('full'),
    userEvent: 'input.table',
  });
  // Do not bypass transaction filters. If a filter changes the validated
  // document or drops history semantics, refuse this edit rather than repair it.
  if (tr.newDoc.toString() !== edit.expectedDocument ||
    tr.annotation(isolateHistory) !== 'full' ||
    tr.annotation(Transaction.addToHistory) === false) {
    throw new TableEngineError('Table transaction did not survive editor filters unchanged');
  }
  return tr;
}

export function executeTableCommand(view: EditorView, tableFrom: number, command: TableCommand, parse: ParseMarkdown): boolean {
  const tr = createTableTransaction(view.state, tableFrom, command, parse);
  if (!tr) return false;
  view.dispatch(tr);
  return true;
}
