import { history, historyKeymap, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { parser } from '@lezer/markdown';
import { ChangeSet, EditorState, StateField, Transaction, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, drawSelection, keymap, type DecorationSet } from '@codemirror/view';
import { markdownGrammarFor } from '@core/vault/ingest/grammar/markdownGrammarExtensions';
import { readTable, type TableSnapshot } from '../src/features/markdown/editor/codemirror/table-next/tableModel';
import { createCellTransaction, diffCellText, editableCell, type CellAddress } from '../src/features/markdown/editor/codemirror/table-next/tableCellTransaction';
import { executeTableCommand } from '../src/features/markdown/editor/codemirror/table-next/tableTransaction';
import type { TableCommand } from '../src/features/markdown/editor/codemirror/table-next/tableCommands';

const grammar = markdownGrammarFor(false);
const configured = parser.configure(grammar);
const parse = (text: string) => configured.parse(text);
const initial = 'Text above the table.\n\n| Name | Role | Notes |\n| --- | --- | --- |\n| Alice | Design | First cell |\n| Bob | Engineering |  |\n\nText below the table.';
const mode = new URLSearchParams(location.search).get('cell') === 'textarea' ? 'textarea' : 'codemirror';
const status = document.querySelector<HTMLElement>('#status')!;
const source = document.querySelector<HTMLElement>('#source')!;
const stats = document.querySelector<HTMLElement>('#stats')!;
document.querySelector<HTMLElement>('#mode')!.textContent = mode;
const report = (message: string) => { status.textContent = message; };

interface Active { address: CellAddress; host: HTMLTableCellElement; nested?: EditorView; textarea?: HTMLTextAreaElement }

class LabTable {
  private root: EditorView | null = null;
  private snapshot: TableSnapshot | null = null;
  private mount: HTMLElement | null = null;
  private table: HTMLTableElement | null = null;
  private active: Active | null = null;
  private updates = 0;
  private reconciling = false;

  attach(dom: HTMLElement, view: EditorView, snapshot: TableSnapshot) {
    this.dispose();
    this.root = view;
    this.mount = dom;
    const scroll = document.createElement('div');
    scroll.className = 'table-scroll';
    this.table = document.createElement('table');
    scroll.append(this.table);
    dom.append(scroll);
    this.sync(dom, snapshot);
  }

  /** Reuse the scrollport and table, patch cells in place on ordinary edits.
   * Active editor DOM is never moved or recreated for a cell keystroke.
   */
  sync(dom: HTMLElement, snapshot: TableSnapshot): boolean {
    if (dom !== this.mount || !this.table) return false;
    this.snapshot = snapshot;
    const rows = [snapshot.model.header, ...snapshot.model.rows];
    const cols = snapshot.model.header.length;
    const shapeChanged = this.table.rows.length !== rows.length || this.table.rows[0]?.cells.length !== cols;
    if (shapeChanged) {
      this.close();
      this.table.replaceChildren();
      const head = this.table.createTHead();
      const body = this.table.createTBody();
      rows.forEach((_row, r) => {
        const tr = (r === 0 ? head : body).insertRow();
        for (let c = 0; c < cols; c++) {
          const td = document.createElement(r === 0 ? 'th' : 'td');
          td.tabIndex = 0;
          td.setAttribute('aria-label', 'Row ' + (r + 1) + ', column ' + (c + 1));
          td.addEventListener('click', () => this.open({ row: r, col: c }, td));
          td.addEventListener('keydown', event => {
            if (event.target === td && (event.key === 'Enter' || event.key === 'F2')) {
              event.preventDefault();
              this.open({ row: r, col: c }, td);
            }
          });
          tr.append(td);
        }
      });
    }
    rows.forEach((row, r) => row.forEach((text, c) => {
      const td = this.table!.rows[r]!.cells[c]!;
      td.style.width = (snapshot.model.columnWidths?.[c] ?? 180) + 'px';
      if (td !== this.active?.host && td.textContent !== text) td.textContent = text;
    }));
    this.updates++;
    // A nested dispatch can be the source of this root update. Reconcile
    // only after both views have finished applying their transactions.
    queueMicrotask(() => this.reconcile());
    return true;
  }

  private currentCell(address: CellAddress) {
    if (!this.root || !this.snapshot) throw new Error('Table not mounted');
    return editableCell(this.root.state.doc.toString(), this.snapshot, address);
  }

  private apply(address: CellAddress, old: string, changes: ChangeSet, event: string): boolean {
    if (!this.root || !this.snapshot) return false;
    try {
      const tr = createCellTransaction(this.root.state, this.snapshot.from, address, old, changes, parse, event);
      if (tr) this.root.dispatch(tr);
      report('Cell edit committed to root history');
      return true;
    } catch (error) {
      report('Rejected: ' + String(error));
      return false;
    }
  }

  private open(address: CellAddress, host: HTMLTableCellElement) {
    if (this.active?.host === host || !this.root) return;
    this.close();
    let text: string;
    try { text = this.currentCell(address).text; } catch (error) { report(String(error)); return; }
    host.replaceChildren();
    const active: Active = { address, host };
    this.active = active;
    if (mode === 'textarea') {
      const input = document.createElement('textarea');
      input.rows = 1;
      input.value = text;
      active.textarea = input;
      host.append(input);
      input.addEventListener('input', () => {
        const previous = this.currentCell(address).text;
        if (!this.apply(address, previous, diffCellText(previous, input.value), 'input.type')) input.value = previous;
      });
      input.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); this.finish(); }
        else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          this.stepHistory(event.shiftKey);
        }
      });
      input.focus();
      input.setSelectionRange(text.length, text.length);
    } else {
      const nested = new EditorView({
        parent: host,
        state: EditorState.create({
          doc: text, selection: { anchor: text.length },
          extensions: [
            markdown({ extensions: grammar, addKeymap: false }), drawSelection(), EditorView.lineWrapping,
            keymap.of([
              { key: 'Mod-z', run: () => this.stepHistory(false) },
              { key: 'Mod-Shift-z', run: () => this.stepHistory(true) },
              { key: 'Escape', run: () => { this.finish(); return true; } },
            ]),
          ],
        }),
        dispatchTransactions: (transactions, view) => {
          if (this.reconciling) { view.update(transactions); return; }
          let changes = ChangeSet.empty(view.state.doc.length);
          for (const tr of transactions) changes = changes.compose(tr.changes);
          if (changes.empty || this.apply(address, view.state.doc.toString(), changes,
            transactions.at(-1)?.annotation(Transaction.userEvent) ?? 'input.type')) view.update(transactions);
        },
      });
      active.nested = nested;
      nested.focus();
    }
  }

  private reconcile() {
    const active = this.active;
    if (!active || !this.root || !this.snapshot) return;
    try {
      const expected = this.currentCell(active.address).text;
      if (active.textarea && active.textarea.value !== expected) active.textarea.value = expected;
      if (active.nested && active.nested.state.doc.toString() !== expected) {
        const nested = active.nested;
        this.reconciling = true;
        try {
          nested.dispatch({ changes: diffCellText(nested.state.doc.toString(), expected) });
        } finally { this.reconciling = false; }
      }
    } catch { this.close(); }
  }

  close() {
    const active = this.active;
    this.active = null;
    if (!active) return;
    active.nested?.destroy();
    const row = active.address.row === 0 ? this.snapshot?.model.header : this.snapshot?.model.rows[active.address.row - 1];
    active.host.textContent = row?.[active.address.col] ?? '';
  }

  private finish() { this.close(); this.root?.focus(); }

  stepHistory(forward: boolean): boolean {
    if (!this.root) return false;
    // The prototype intentionally clears the active editor on history
    // navigation, avoiding identity guesses after a structural replacement.
    this.finish();
    const changed = forward ? redo(this.root) : undo(this.root);
    report(changed ? (forward ? 'Redo' : 'Undo') + ' applied to root' : 'No history step');
    return true;
  }

  command(command: TableCommand) {
    if (!this.root || !this.snapshot) return;
    this.finish();
    try {
      const changed = executeTableCommand(this.root, this.snapshot.from, command, parse);
      report(changed ? command.kind + ' committed' : 'No change');
    } catch (error) { report('Rejected: ' + String(error)); }
  }

  addRow() { if (this.snapshot) this.command({ kind: 'insertRow', index: this.snapshot.model.rows.length + 1 }); }
  addColumn() { if (this.snapshot) this.command({ kind: 'insertColumn', index: this.snapshot.model.header.length }); }
  resize() { this.command({ kind: 'resizeColumn', col: 0, width: 260 }); }
  dispose(dom?: HTMLElement) {
    if (dom && dom !== this.mount) return;
    this.close();
    this.root = null;
    this.mount = null;
    this.table = null;
    this.snapshot = null;
  }
  get updateCount() { return this.updates; }
}

const controller = new LabTable();
class Projection extends WidgetType {
  constructor(readonly snapshot: TableSnapshot) { super(); }
  eq(other: Projection) { return this.snapshot.from === other.snapshot.from && this.snapshot.source === other.snapshot.source; }
  toDOM(view: EditorView) {
    const dom = document.createElement('div');
    dom.className = 'table-projection';
    dom.contentEditable = 'false';
    controller.attach(dom, view, this.snapshot);
    return dom;
  }
  updateDOM(dom: HTMLElement) { return controller.sync(dom, this.snapshot); }
  ignoreEvent() { return true; }
  destroy(dom: HTMLElement) { controller.dispose(dom); }
}

function project(state: EditorState): DecorationSet {
  const text = state.doc.toString();
  const ranges: Range<Decoration>[] = [];
  // This disposable lab exercises one top-level table only.
  let found = false;
  parse(text).iterate({ enter(node) {
    if (found || node.name !== 'Table') return;
    found = true;
    try {
      const snapshot = readTable(text, node.from, parse);
      ranges.push(Decoration.replace({ widget: new Projection(snapshot), block: true }).range(snapshot.from, snapshot.to));
    } catch (error) { /* Unsupported source remains visible; the field stays pure. */ void error; }
    return false;
  } });
  return Decoration.set(ranges);
}
const field = StateField.define<DecorationSet>({
  create: project,
  update: (value, tr) => tr.docChanged ? project(tr.state) : value,
  provide: f => [EditorView.decorations.from(f), EditorView.atomicRanges.of(view => view.state.field(f))],
});
function refresh(view: EditorView) {
  source.textContent = view.state.doc.toString();
  stats.textContent = 'Undo: ' + undoDepth(view.state) + ' · Redo: ' + redoDepth(view.state) + ' · Projection updates: ' + controller.updateCount;
}
const root = new EditorView({
  parent: document.querySelector<HTMLElement>('#editor')!,
  state: EditorState.create({
    doc: initial, selection: { anchor: initial.length },
    extensions: [
      markdown({ extensions: grammar, addKeymap: false }), history({ minDepth: 1000 }),
      drawSelection(), EditorView.lineWrapping, field, keymap.of(historyKeymap),
      EditorView.updateListener.of(update => refresh(update.view)),
    ],
  }),
});
refresh(root);
document.querySelector('#add-row')!.addEventListener('click', () => controller.addRow());
document.querySelector('#add-column')!.addEventListener('click', () => controller.addColumn());
document.querySelector('#resize')!.addEventListener('click', () => controller.resize());
document.querySelector('#undo')!.addEventListener('click', () => controller.stepHistory(false));
document.querySelector('#redo')!.addEventListener('click', () => controller.stepHistory(true));
document.querySelector('#reset')!.addEventListener('click', () => location.reload());
window.addEventListener('pagehide', () => root.destroy(), { once: true });
