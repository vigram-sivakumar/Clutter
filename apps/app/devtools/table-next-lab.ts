import { defaultKeymap, history, historyKeymap, isolateHistory, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { parser } from '@lezer/markdown';
import { ChangeSet, EditorState, StateField, Transaction, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, drawSelection, keymap, type DecorationSet } from '@codemirror/view';
import { markdownGrammarFor } from '@core/vault/ingest/grammar/markdownGrammarExtensions';
import { readTable, type TableSnapshot } from '../src/features/markdown/editor/codemirror/table-next/tableModel';
import { createCellTransaction, diffCellText, editableCell, type CellAddress } from '../src/features/markdown/editor/codemirror/table-next/tableCellTransaction';
import { executeTableCommand } from '../src/features/markdown/editor/codemirror/table-next/tableTransaction';
import type { TableCommand } from '../src/features/markdown/editor/codemirror/table-next/tableCommands';
import { arrowInteraction, clampInteraction, extendInteraction, focusCell, isSelected, noInteraction, tabInteraction, type Direction, type TableInteraction } from '../src/features/markdown/editor/codemirror/table-next/tableInteraction';

import { clearSelectedCommand, pasteSelectedCommand, readGrid, selectedGrid, writeGrid } from '../src/features/markdown/editor/codemirror/table-next/tableClipboard';
import { renderInlineMarkdown } from '../src/features/markdown/editor/codemirror/table/renderInlineMarkdown';

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
  private interaction: TableInteraction = noInteraction;
  private drag: AbortController | null = null;
  private suppressClick = false;
  private get shape() { return { rows: (this.snapshot?.model.rows.length ?? -1) + 1, cols: this.snapshot?.model.header.length ?? 0 }; }
  private updates = 0;
  private reconciling = false;

  attach(dom: HTMLElement, view: EditorView, snapshot: TableSnapshot) {
    this.dispose();
    this.root = view;
    this.mount = dom;
    const scroll = document.createElement('div');
    scroll.className = 'table-scroll';
    this.table = document.createElement('table');
    this.table.setAttribute('role', 'grid');
    this.table.setAttribute('aria-label', 'Editable Markdown table');
    this.table.setAttribute('aria-multiselectable', 'true');
    dom.addEventListener('copy', event => this.onClipboard(event, false));
    dom.addEventListener('cut', event => this.onClipboard(event, true));
    dom.addEventListener('paste', event => this.onPaste(event), true);
    dom.addEventListener('focusout', () => queueMicrotask(() => {
      if (this.mount === dom && !dom.contains(dom.ownerDocument.activeElement)) {
        this.close();
        this.interaction = noInteraction;
        this.paint();
      }
    }));
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
      this.drag?.abort();
      this.drag = null;
      this.close();
      this.interaction = noInteraction;
      this.table.replaceChildren();
      const head = this.table.createTHead();
      const body = this.table.createTBody();
      rows.forEach((_row, r) => {
        const tr = (r === 0 ? head : body).insertRow();
        for (let c = 0; c < cols; c++) {
          const td = document.createElement(r === 0 ? 'th' : 'td');
          td.tabIndex = -1;
          td.setAttribute('role', r === 0 ? 'columnheader' : 'gridcell');
          td.setAttribute('aria-label', 'Row ' + (r + 1) + ', column ' + (c + 1));
          td.addEventListener('pointerdown', event => this.beginDrag(event, { row: r, col: c }, td));
          td.addEventListener('mousedown', event => {
            if (event.shiftKey || this.drag) event.preventDefault();
          });
          td.addEventListener('click', event => {
            if (this.suppressClick) { this.suppressClick = false; return; }
            if (this.active?.host === td) return;
            const at = { row: r, col: c };
            if (event.shiftKey) this.select(extendInteraction(this.interaction, this.shape, at));
            else this.open(at, td);
          });
          td.addEventListener('focus', () => {
            if (this.interaction.kind === 'none') {
              this.interaction = { kind: 'cell', cell: { row: r, col: c } };
              this.paint();
            }
          });
          td.addEventListener('keydown', event => {
            if (event.target === td) this.onSelectedKey(event, { row: r, col: c }, td);
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
    this.interaction = clampInteraction(this.interaction, this.shape);
    this.paint();
    this.updates++;
    // A nested dispatch can be the source of this root update. Reconcile
    // only after both views have finished applying their transactions.
    queueMicrotask(() => this.reconcile());
    return true;
  }

  private paint() {
    if (!this.table) return;
    const focus = focusCell(this.interaction);
    for (let r = 0; r < this.table.rows.length; r++) {
      const row = this.table.rows[r]!;
      for (let c = 0; c < row.cells.length; c++) {
        const td = row.cells[c]!;
        const selected = isSelected(this.interaction, { row: r, col: c }, this.shape);
        const current = focus ? focus.row === r && focus.col === c : r === 0 && c === 0;
        const editing = current && this.interaction.kind === 'editing';
        td.tabIndex = current && !editing ? 0 : -1;
        td.classList.toggle('cell-selected', selected);
        td.classList.toggle('cell-editing', editing);
        td.setAttribute('aria-selected', String(selected));
      }
    }
    if (this.mount) this.mount.dataset.interaction = this.interaction.kind;
  }

  private select(next: TableInteraction) {
    this.close();
    this.interaction = next;
    this.paint();
    const at = focusCell(next);
    if (at) this.table?.rows[at.row]?.cells[at.col]?.focus();
  }

  /** Click is still click-to-edit. Crossing into another cell while held
   * converts the gesture into range selection and suppresses the click.
   * Existing active text editors keep native text drag behaviour.
   */
  private beginDrag(event: PointerEvent, anchor: CellAddress, host: HTMLTableCellElement) {
    this.suppressClick = false;
    this.drag?.abort();
    this.drag = null;
    if (event.button !== 0 || !event.isPrimary || event.shiftKey || event.pointerType === 'touch' || this.active?.host === host) return;
    const abort = new AbortController();
    this.drag = abort;
    const doc = host.ownerDocument;
    let moved = false;
    const pointer = event.pointerId;
    const finish = (next: PointerEvent) => {
      if (next.pointerId !== pointer) return;
      abort.abort();
      if (this.drag === abort) this.drag = null;
    };
    doc.addEventListener('pointermove', next => {
      if (next.pointerId !== pointer) return;
      if (!(next.buttons & 1)) { finish(next); return; }
      const td = doc.elementFromPoint(next.clientX, next.clientY)?.closest('td,th');
      if (!(td instanceof HTMLTableCellElement) || td.closest('table') !== this.table) return;
      const tr = td.parentElement;
      if (!(tr instanceof HTMLTableRowElement)) return;
      const head = { row: tr.rowIndex, col: td.cellIndex };
      if (!moved && head.row === anchor.row && head.col === anchor.col) return;
      moved = true;
      this.suppressClick = true;
      next.preventDefault();
      this.select({ kind: 'range', anchor, head });
    }, { signal: abort.signal });
    doc.addEventListener('pointerup', finish, { signal: abort.signal });
    doc.addEventListener('pointercancel', finish, { signal: abort.signal });
    doc.defaultView?.addEventListener('blur', () => {
      abort.abort();
      if (this.drag === abort) this.drag = null;
    }, { signal: abort.signal });
  }

  private clearSelected(): boolean {
    if (!this.root || !this.snapshot) return false;
    const command = clearSelectedCommand(this.snapshot.model, this.interaction);
    if (!command) return false;
    return executeTableCommand(this.root, this.snapshot.from, command, parse);
  }

  private onClipboard(event: ClipboardEvent, cut: boolean) {
    if (this.interaction.kind === 'editing' || !this.root || !this.snapshot || !event.clipboardData) return;
    const grid = selectedGrid(this.snapshot.model, this.interaction);
    if (!grid) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      // Write all formats before mutating the root. A thrown write never cuts.
      writeGrid(event.clipboardData, grid, renderInlineMarkdown);
      if (cut) this.clearSelected();
      report(cut ? 'Cut selected cells' : 'Copied selected cells');
    } catch (error) { report('Clipboard rejected: ' + String(error)); }
  }

  private onPaste(event: ClipboardEvent) {
    if (!this.root || !this.snapshot || !event.clipboardData || this.interaction.kind === 'none') return;
    const previous = this.interaction;
    let handled = false;
    try {
      const grid = readGrid(event.clipboardData, previous.kind !== 'editing');
      if (!grid) return;
      event.preventDefault();
      event.stopPropagation();
      handled = true;
      const command = pasteSelectedCommand(this.snapshot.model, previous, grid);
      if (!command || command.kind !== 'paste') return;
      // Closing editing before a structural update avoids reusing a stale
      // nested cell. Shape updates can clear selection; restore explicitly.
      this.close();
      executeTableCommand(this.root, this.snapshot.from, command, parse);
      const at = { row: command.row, col: command.col };
      this.select(previous.kind === 'editing' ? { kind: 'cell', cell: at } : clampInteraction(previous, this.shape));
      report('Pasted ' + grid.length + ' × ' + grid[0]!.length + ' cells');
    } catch (error) {
      if (!handled) { event.preventDefault(); event.stopPropagation(); }
      report('Paste rejected: ' + String(error));
    }
  }

  private navigateTab(backwards: boolean): boolean {
    const next = tabInteraction(this.interaction, this.shape, backwards);
    if (next.kind !== 'none') {
      this.select(next);
    } else {
      // Leave the table at its edges. Never focus a position within the
      // replaced Markdown range. Lab fixture has surrounding text.
      this.finish();
      if (this.root && this.snapshot) {
        const anchor = backwards ? Math.max(0, this.snapshot.from - 1) : Math.min(this.root.state.doc.length, this.snapshot.to + 1);
        this.root.dispatch({ selection: { anchor } });
      }
    }
    return true;
  }

  private exitEdit(): boolean {
    const at = focusCell(this.interaction);
    if (at) this.select({ kind: 'cell', cell: at });
    return true;
  }

  private onSelectedKey(event: KeyboardEvent, at: CellAddress, host: HTMLTableCellElement) {
    if (event.isComposing || event.defaultPrevented) return;
    const consume = () => { event.preventDefault(); event.stopPropagation(); };
    if (event.key === 'Tab') { consume(); this.navigateTab(event.shiftKey); return; }
    if (event.key === 'Escape') { consume(); this.clearSelection(); return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      consume(); this.stepHistory(event.shiftKey); return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      consume(); this.select({ kind: 'table', cell: at }); return;
    }
    if (event.key === 'Enter' || event.key === 'F2') { consume(); this.open(at, host); return; }
    const directions: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    const direction = directions[event.key];
    if (direction) { consume(); this.select(arrowInteraction(this.interaction, this.shape, direction, event.shiftKey)); return; }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      consume();
      try { this.clearSelected(); this.paint(); } catch (error) { report(String(error)); }
      return;
    }
    if (!event.metaKey && !event.ctrlKey && !event.altKey && [...event.key].length === 1) {
      consume();
      // Replacement typing is only defined for a single selected cell.
      // Leave multi-cell selections unchanged until their UX is agreed.
      if (this.interaction.kind !== 'cell') return;
      try {
        const before = this.currentCell(at).text;
        this.root?.dispatch({ annotations: isolateHistory.of('full') });
        if (this.apply(at, before, diffCellText(before, event.key), 'input.type')) this.open(at, host);
      } catch (error) { report(String(error)); }
    }
  }

  selectAxis(kind: 'row' | 'column' | 'table') {
    const at = focusCell(this.interaction) ?? { row: 0, col: 0 };
    this.select({ kind, cell: at });
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
    this.root.dispatch({ annotations: isolateHistory.of('full') });
    this.interaction = { kind: 'editing', cell: address };
    this.paint();
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
        if (event.isComposing) return;
        if (event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); this.navigateTab(event.shiftKey); }
        else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.exitEdit(); }
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
              { key: 'Tab', run: () => this.navigateTab(false) },
              { key: 'Shift-Tab', run: () => this.navigateTab(true) },
              { key: 'Escape', run: () => this.exitEdit() },
              ...defaultKeymap,
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
    this.interaction = { kind: 'cell', cell: active.address };
    active.nested?.destroy();
    const row = active.address.row === 0 ? this.snapshot?.model.header : this.snapshot?.model.rows[active.address.row - 1];
    active.host.textContent = row?.[active.address.col] ?? '';
  }

  /** Escape from selection is a deselection, not navigation to root text. */
  private clearSelection() {
    this.close();
    this.interaction = noInteraction;
    this.paint();
    const focused = this.mount?.ownerDocument.activeElement;
    if (focused instanceof HTMLElement && this.mount?.contains(focused)) focused.blur();
  }

  private finish() {
    this.close();
    this.interaction = noInteraction;
    this.paint();
    this.root?.focus();
  }

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
    this.drag?.abort();
    this.drag = null;
    this.suppressClick = false;
    this.close();
    this.root = null;
    this.mount = null;
    this.table = null;
    this.snapshot = null;
    this.interaction = noInteraction;
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
      drawSelection(), EditorView.lineWrapping, field, keymap.of([...historyKeymap, ...defaultKeymap]),
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
for (const kind of ['row', 'column', 'table'] as const) {
  const button = document.querySelector<HTMLButtonElement>('#select-' + kind)!;
  button.addEventListener('mousedown', event => event.preventDefault());
  button.addEventListener('click', () => controller.selectAxis(kind));
}
document.querySelector('#reset')!.addEventListener('click', () => location.reload());
window.addEventListener('pagehide', () => root.destroy(), { once: true });
