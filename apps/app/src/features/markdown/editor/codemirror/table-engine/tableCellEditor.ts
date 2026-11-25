import { EditorState, Transaction } from '@codemirror/state';
import { EditorView, keymap, ViewPlugin } from '@codemirror/view';
import { defaultKeymap, undo, redo } from '@codemirror/commands';
import { sharedMarkdownParser } from '../../../render/sharedMarkdownParser';
import { renderInlineMarkdown } from '../table/renderInlineMarkdown';
import { createCellTransaction, editableCell, type CellAddress } from './tableCellTransaction';
import { readTable, TableEngineError } from './tableModel';
import { createTableTransaction } from './tableTransaction';
import { bookmark, tableSelectionTransition } from './tableSelectionHistory';

const parse = (source: string) => sharedMarkdownParser.parse(source);

/** One nested view per root, with root transactions accepted before nested state. */
export class TableCellEditor {
  nested: EditorView | null = null;
  private active: { tableFrom: number; cell: CellAddress; from: number; to: number } | null = null;
  private forwarding = false;

  constructor(readonly root: EditorView) {}

  owns(host: Element): boolean { return !!this.nested && host.contains(this.nested.dom); }

  activate(tableFrom: number, cell: CellAddress, host: HTMLElement, event?: MouseEvent): void {
    if (this.root.state.readOnly) return;
    let snapshot = readTable(this.root.state.doc.toString(), tableFrom, parse);
    if (!snapshot.cells[cell.row]?.[cell.col]) {
      const tr = createTableTransaction(this.root.state, tableFrom, { kind: 'format' }, parse);
      if (tr) this.root.dispatch(tr);
      snapshot = readTable(this.root.state.doc.toString(), tableFrom, parse);
      host = this.root.dom.querySelector<HTMLElement>(
        `.cm-table-widget[data-table-from="${tableFrom}"] [data-cell="${cell.row},${cell.col}"]`) ?? host;
    }
    this.close();
    const source = this.root.state.doc.toString();
    const range = editableCell(source, snapshot, cell);
    this.active = { tableFrom, cell, from: range.from, to: range.to };
    const state = EditorState.create({
      doc: range.text,
      selection: { anchor: range.text.length },
      extensions: [
        keymap.of([
          { key: 'Mod-z', run: () => { this.close(); undo(this.root); return true; } },
          { key: 'Mod-Shift-z', run: () => { this.close(); redo(this.root); return true; } },
          { key: 'Escape', run: () => { this.close(); return true; } },
          ...defaultKeymap,
        ]),
      ],
    });
    host.replaceChildren();
    if (!this.nested) {
      this.nested = new EditorView({ state, parent: host, dispatchTransactions: transactions => this.dispatch(transactions) });
    } else {
      host.appendChild(this.nested.dom);
      this.nested.setState(state);
    }
    this.nested.focus();
    if (event) this.nested.contentDOM.dispatchEvent(new MouseEvent('mousedown', {
      clientX: event.clientX, clientY: event.clientY, button: 0, detail: event.detail, bubbles: false,
    }));
  }

  private dispatch(transactions: readonly Transaction[]): void {
    if (!this.nested || !this.active) return;
    for (const tr of transactions) {
      if (!tr.docChanged) { this.nested.update([tr]); continue; }
      const active = this.active;
      const mark = bookmark(active.tableFrom, { kind: 'editing', cell: active.cell });
      try {
        // Keep the exact editable span chosen at activation as spaces are typed.
        const rootTr = createCellTransaction(this.root.state, active.tableFrom, active.cell,
          tr.startState.doc.toString(), tr.changes, parse, tr.annotation(Transaction.userEvent) ?? 'input.type',
          tableSelectionTransition.of({ before: mark, after: mark }),
          { from: active.from, to: active.to, text: tr.startState.doc.toString() });
        if (!rootTr) continue;
        this.forwarding = true;
        try { this.root.dispatch(rootTr); } finally { this.forwarding = false; }
        this.nested.update([tr]);
      } catch (error) {
        if (!(error instanceof TableEngineError)) throw error;
        // Both views retain the last accepted revision.
      }
    }
  }

  sync(transactions: readonly Transaction[]): void {
    for (const tr of transactions) {
      if (!this.active || !tr.docChanged) continue;
      if (!this.forwarding) {
        let touched = false;
        tr.changes.iterChangedRanges((from, to) => {
          if (from <= this.active!.to && to >= this.active!.from) touched = true;
        });
        if (touched) { this.close(); continue; }
      }
      this.active.from = tr.changes.mapPos(this.active.from, -1);
      this.active.to = tr.changes.mapPos(this.active.to, 1);
      this.active.tableFrom = tr.changes.mapPos(this.active.tableFrom, 1);
    }
  }

  close(): void {
    const host = this.nested?.dom.parentElement;
    this.nested?.dom.remove();
    this.active = null;
    if (host) {
      // The next projection paints current Markdown. Force an update when only focus changed.
      const root = host.closest<HTMLElement>('.cm-table-widget');
      const [row, col] = (host.dataset.cell ?? '').split(',').map(Number);
      try {
        const snapshot = readTable(this.root.state.doc.toString(), Number(root?.dataset.tableFrom), parse);
        host.innerHTML = renderInlineMarkdown([snapshot.model.header, ...snapshot.model.rows][row!]![col!]!, { styled: true });
      } catch { host.textContent = ''; }
    }
  }

  destroy(): void { this.nested?.destroy(); this.nested = null; this.active = null; }
}

export const tableCellEditor = ViewPlugin.fromClass(class extends TableCellEditor {
  update(update: import('@codemirror/view').ViewUpdate) { this.sync(update.transactions); }
});
