import { EditorState, Transaction } from '@codemirror/state';
import { drawSelection, EditorView, keymap, ViewPlugin } from '@codemirror/view';
import { defaultKeymap, undo, redo } from '@codemirror/commands';
import { sharedMarkdownParser } from '../../../render/sharedMarkdownParser';
import { renderInlineMarkdown } from '../table/renderInlineMarkdown';
import { createCellTransaction, editableCell, type CellAddress } from './tableCellTransaction';
import { readTable, TableEngineError } from './tableModel';
import { createTableTransaction } from './tableTransaction';
import { bookmark, restoredSelection, tableSelectionTransition, type SelectionBookmark } from './tableSelectionHistory';
import { arrowInteraction, extendInteraction, focusCell, isValidCell, noInteraction, selectionBounds, tabInteraction,
  type Direction, type TableInteraction } from './tableInteraction';
import { clearSelectedCommand, externalCell, pasteSelectedCommand, readGrid, selectedGrid, writeGrid } from './tableClipboard';
import { createPastedTable } from './tableCreatePaste';
import { TableDragSelection } from './tableDragSelection';

const parse = (source: string) => sharedMarkdownParser.parse(source);

/** One nested view per root, with root transactions accepted before nested state. */
export class TableCellEditor {
  nested: EditorView | null = null;
  private active: { tableFrom: number; cell: CellAddress; from: number; to: number } | null = null;
  private forwarding = false;

  // The interaction owns logical selection. The active source span above is
  // only the mapped address of the mounted nested document.
  private interaction: TableInteraction = noInteraction;
  private interactionTable: number | null = null;
  private pendingHistory: SelectionBookmark | null | undefined;

  private readonly drag = new TableDragSelection((widget, anchor, head) => {
    if (!this.root.dom.contains(widget)) return false;
    const tableFrom = Number(widget.dataset.tableFrom);
    try {
      return this.select(tableFrom, { kind: 'range', anchor, head }, true);
    } catch (error) {
      if (!(error instanceof TableEngineError)) throw error;
      return false;
    }
  });

  beginDrag(event: PointerEvent, widget: HTMLElement): void {
    const host = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-cell]') : null;
    if (!host || host.closest('[data-table-engine-cells="true"]') !== widget) return;
    const [row, col] = host.dataset.cell!.split(',').map(Number);
    if (!Number.isInteger(row) || !Number.isInteger(col)) return;
    this.drag.begin(event, widget, host, { row: row!, col: col! });
  }

  consumeDragClick(widget: HTMLElement, event: MouseEvent): void { this.drag.consumeClick(widget, event); }
  cancelDrag(widget?: HTMLElement): void { this.drag.cancel(widget); }

  constructor(readonly root: EditorView) {
    root.dom.ownerDocument.addEventListener('mousedown', this.outsideClick, true);
  }

  private outsideClick = (event: MouseEvent): void => {
    if (this.interactionTable === null) return;
    const target = event.target;
    if (target instanceof Element &&
      this.root.dom.contains(target) && target.closest('[data-table-engine-cells="true"]')) return;
    this.cancelDrag();
    this.close();
  };

  private hostAt(tableFrom: number, cell: CellAddress): HTMLElement | null {
    return this.root.dom.querySelector<HTMLElement>(
      `[data-table-engine-cells="true"][data-table-from="${tableFrom}"] [data-cell="${cell.row},${cell.col}"]`);
  }

  private snapshot(tableFrom: number) {
    return readTable(this.root.state.doc.toString(), tableFrom, parse);
  }

  private shape(tableFrom: number) {
    const { model } = this.snapshot(tableFrom);
    return { rows: model.rows.length + 1, cols: model.header.length };
  }

  // The projection owns DOM; the controller paints only derived interaction
  // attributes on the stable hosts. No root selection or document mutation.
  paintWidget(widget: HTMLElement): void {
    const hosts = widget.querySelectorAll<HTMLElement>('[data-cell]');
    const from = Number(widget.dataset.tableFrom);
    let bounds: ReturnType<typeof selectionBounds> = null;
    let focus: CellAddress | null = null;
    if (this.interactionTable === from && this.interaction.kind !== 'editing') {
      try {
        bounds = selectionBounds(this.interaction, this.shape(from));
        focus = focusCell(this.interaction);
      } catch (error) {
        if (!(error instanceof TableEngineError)) throw error;
      }
    }
    for (const host of hosts) {
      const [row, col] = host.dataset.cell!.split(',').map(Number);
      const selected = !!bounds && row! >= bounds.top && row! <= bounds.bottom &&
        col! >= bounds.left && col! <= bounds.right;
      host.tabIndex = selected && focus?.row === row && focus?.col === col ? 0 : -1;
      const cell = host.parentElement!;
      cell.classList.toggle('cm-table-engine-selected', selected);
      cell.classList.toggle('cm-table-engine-top', selected && row === bounds?.top);
      cell.classList.toggle('cm-table-engine-bottom', selected && row === bounds?.bottom);
      cell.classList.toggle('cm-table-engine-left', selected && col === bounds?.left);
      cell.classList.toggle('cm-table-engine-right', selected && col === bounds?.right);
    }
  }

  private paintSelection(): void {
    this.root.dom.querySelectorAll<HTMLElement>('[data-table-engine-cells="true"]').forEach(widget => this.paintWidget(widget));
  }

  private select(tableFrom: number, interaction: TableInteraction, preventScroll = false): boolean {
    const cell = focusCell(interaction);
    if (!cell || !isValidCell(cell, this.shape(tableFrom))) return false;
    const host = this.hostAt(tableFrom, cell);
    if (!host) return false;
    this.close();
    this.interactionTable = tableFrom;
    this.interaction = interaction;
    this.paintSelection();
    host.focus({ preventScroll });
    return true;
  }

  private navigateTab(backwards: boolean): boolean {
    if (this.interactionTable === null) return false;
    const from = this.interactionTable;
    const next = tabInteraction(this.interaction, this.shape(from), backwards);
    if (next.kind !== 'none') return this.select(from, next);
    const snapshot = this.snapshot(from);
    this.close();
    const anchor = backwards ? Math.max(0, snapshot.from - 1) :
      Math.min(this.root.state.doc.length, snapshot.to + 1);
    this.root.dispatch({ selection: { anchor }, scrollIntoView: true });
    this.root.focus();
    return true;
  }

  private exitEdit(): boolean {
    if (!this.active) return false;
    return this.select(this.active.tableFrom, { kind: 'cell', cell: this.active.cell });
  }

  click(tableFrom: number, cell: CellAddress, host: HTMLElement, event: MouseEvent): void {
    if (event.button !== 0) return;
    if (this.owns(host)) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      if (event.shiftKey && this.interactionTable === tableFrom && this.interaction.kind !== 'none') {
        this.select(tableFrom, extendInteraction(this.interaction, this.shape(tableFrom), cell));
      } else {
        this.activate(tableFrom, cell, host, event);
      }
    } catch (error) {
      if (!(error instanceof TableEngineError)) throw error;
    }
  }

  private clearSelected(): boolean {
    if (this.interactionTable === null) return false;
    const from = this.interactionTable;
    const command = clearSelectedCommand(this.snapshot(from).model, this.interaction);
    if (!command) return false;
    const mark = bookmark(from, this.interaction);
    const tr = createTableTransaction(this.root.state, from, command, parse,
      tableSelectionTransition.of({ before: mark, after: mark }));
    if (tr) {
      this.forwarding = true;
      try { this.root.dispatch(tr); } finally { this.forwarding = false; }
    }
    return true;
  }

  /** Called in capture phase on the projection. Native text copy/cut in the
   * nested editor remains CodeMirror's responsibility. Selected grid events
   * must not bubble to the root's unrelated text selection. */
  clipboard(widget: HTMLElement, event: ClipboardEvent): void {
    if (event.defaultPrevented || !event.clipboardData ||
      this.interactionTable !== Number(widget.dataset.tableFrom) || this.interaction.kind === 'none') return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-table-engine-cells="true"]') !== widget) return;
    const editing = this.interaction.kind === 'editing';
    if (editing && (!this.nested?.dom.contains(target) || event.type !== 'paste')) return;
    const consume = () => { event.preventDefault(); event.stopPropagation(); };
    const from = this.interactionTable;
    const data = event.clipboardData;
    try {
      if (event.type === 'copy' || event.type === 'cut') {
        const grid = selectedGrid(this.snapshot(from).model, this.interaction);
        if (!grid) return;
        consume();
        writeGrid(data, grid, text => renderInlineMarkdown(text));
        if (event.type === 'cut') this.clearSelected();
        return;
      }
      if (event.type !== 'paste') return;
      // A selected host or live cell owns the paste, even if the payload
      // is empty or unsupported; never fall back to root source insertion.
      consume();
      this.cancelDrag();
      const grid = readGrid(data, !editing);
      if (!grid) {
        if (editing && this.nested && this.active) {
          const text = data.getData('text/plain');
          if (text !== '') this.nested.dispatch({
            ...this.nested.state.replaceSelection(externalCell(text, false)),
            userEvent: 'input.paste',
          });
        }
        return;
      }
      const previous = this.interaction;
      const command = pasteSelectedCommand(this.snapshot(from).model, previous, grid);
      if (!command) return;
      const next: TableInteraction = previous.kind === 'editing' ? { kind: 'cell', cell: previous.cell } : previous;
      const effect = tableSelectionTransition.of({ before: bookmark(from, previous), after: bookmark(from, next) });
      const tr = createTableTransaction(this.root.state, from, command, parse, effect);
      this.close();
      if (tr) {
        this.forwarding = true;
        try { this.root.dispatch(tr); } finally { this.forwarding = false; }
      }
      this.select(from, next);
    } catch (error) {
      if (!(error instanceof TableEngineError)) throw error;
      consume();
      // A rejected clipboard edit must not reach the root's normal paste.
    }
  }

  /** Root paste routing calls this only for its existing table-create
   * classification. Other root paste strategies remain unchanged. */
  pasteNewTable(data: DataTransfer): boolean {
    try {
      const grid = readGrid(data, false);
      if (!grid) return false;
      const tr = createPastedTable(this.root.state, grid, parse);
      if (!tr) return false;
      this.cancelDrag();
      this.close();
      this.root.dispatch(tr);
      const mark = tr.effects.find(effect => effect.is(tableSelectionTransition));
      const after = mark?.is(tableSelectionTransition) ? mark.value.after : null;
      if (after) this.select(after.tableFrom, after.interaction);
      return true;
    } catch (error) {
      if (!(error instanceof TableEngineError)) throw error;
      // Unsupported or malformed grids must not be reinterpreted as root
      // Markdown by another paste handler.
      return true;
    }
  }

  private stepHistory(backwards: boolean): boolean {
    this.cancelDrag();
    this.close();
    this.root.focus();
    (backwards ? undo : redo)(this.root);
    return true;
  }

  /** Run after CM6 reconciles its block widgets, not during plugin update.
   * History stores only intent; the current root source validates it. */
  restoreHistory(): void {
    const mark = this.pendingHistory;
    if (mark === undefined) return;
    this.pendingHistory = undefined;
    this.close();
    if (!mark) { this.root.focus(); return; }
    try {
      if (this.select(mark.tableFrom, mark.interaction, true)) return;
    } catch (error) {
      if (!(error instanceof TableEngineError)) throw error;
    }
    this.root.focus();
  }

  selectedKey(tableFrom: number, cell: CellAddress, host: HTMLElement, event: KeyboardEvent): void {
    if (event.target !== host || event.isComposing || event.defaultPrevented ||
      this.interactionTable !== tableFrom || this.interaction.kind === 'none' || this.interaction.kind === 'editing') return;
    const consume = () => { this.cancelDrag(); event.preventDefault(); event.stopPropagation(); };
    try {
      if (event.key === 'Tab') { consume(); this.navigateTab(event.shiftKey); return; }
      if (event.key === 'Escape') { consume(); this.close(); host.blur(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        consume(); this.stepHistory(event.shiftKey); return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        consume(); this.select(tableFrom, { kind: 'table', cell }); return;
      }
      if (event.key === 'Enter' || event.key === 'F2') {
        consume(); this.activate(tableFrom, cell, host); return;
      }
      const directions: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      const direction = directions[event.key];
      if (direction) {
        consume(); this.select(tableFrom, arrowInteraction(this.interaction, this.shape(tableFrom), direction, event.shiftKey)); return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        consume();
        this.clearSelected();
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && [...event.key].length === 1) {
        consume();
        // Match the validated prototype candidate: replace a single selected
        // cell, but do not silently replace a multi-cell range.
        if (this.interaction.kind !== 'cell') return;
        this.activate(tableFrom, cell, host);
        if (!this.nested || !this.active) return;
        const length = this.nested.state.doc.length;
        this.nested.dispatch({ changes: { from: 0, to: length, insert: event.key },
          selection: { anchor: event.key.length }, userEvent: 'input.type' });
      }
    } catch (error) {
      if (!(error instanceof TableEngineError)) throw error;
    }
  }

  owns(host: Element): boolean { return !!this.nested && host.contains(this.nested.dom); }

  activate(tableFrom: number, cell: CellAddress, host: HTMLElement, event?: MouseEvent): void {
    if (this.root.state.readOnly) return;
    this.close();
    let snapshot = readTable(this.root.state.doc.toString(), tableFrom, parse);
    if (!snapshot.cells[cell.row]?.[cell.col]) {
      const tr = createTableTransaction(this.root.state, tableFrom, { kind: 'format' }, parse);
      if (tr) {
        this.forwarding = true;
        try { this.root.dispatch(tr); } finally { this.forwarding = false; }
      }
      snapshot = readTable(this.root.state.doc.toString(), tableFrom, parse);
      host = this.root.dom.querySelector<HTMLElement>(
        `.cm-table-widget[data-table-from="${tableFrom}"] [data-cell="${cell.row},${cell.col}"]`) ?? host;
    }
    const source = this.root.state.doc.toString();
    const range = editableCell(source, snapshot, cell);
    this.active = { tableFrom, cell, from: range.from, to: range.to };
    this.interactionTable = tableFrom;
    this.interaction = { kind: 'editing', cell };
    this.paintSelection();
    const state = EditorState.create({
      doc: range.text,
      selection: { anchor: range.text.length },
      extensions: [
        // The root's drawSelection theme hides native descendant carets.
        // Each nested view must own its cursor and selection layers as well.
        drawSelection(),
        keymap.of([
          { key: 'Mod-z', run: () => this.stepHistory(false) },
          { key: 'Mod-Shift-z', run: () => this.stepHistory(true) },
          { key: 'Tab', run: () => this.navigateTab(false) },
          { key: 'Shift-Tab', run: () => this.navigateTab(true) },
          { key: 'Escape', run: () => this.exitEdit() },
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
      const mark = restoredSelection(tr);
      if (mark !== undefined) this.pendingHistory = mark;
      if (!tr.docChanged) continue;
      if (!this.forwarding) this.cancelDrag();
      if (!this.active) {
        if (this.interactionTable !== null && !this.forwarding) {
          // A source mutation outside the controller may change logical
          // addresses. Do not preserve a stale range on that revision.
          this.close();
        }
        continue;
      }
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
      this.interactionTable = this.active.tableFrom;
    }
  }

  close(): void {
    const host = this.nested?.dom.parentElement;
    this.nested?.dom.remove();
    this.active = null;
    this.interaction = noInteraction;
    this.interactionTable = null;
    this.paintSelection();
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

  destroy(): void {
    this.cancelDrag();
    this.root.dom.ownerDocument.removeEventListener('mousedown', this.outsideClick, true);
    this.nested?.destroy(); this.nested = null; this.active = null;
    this.interaction = noInteraction; this.interactionTable = null; this.pendingHistory = undefined;
  }
}

export const tableCellEditor = ViewPlugin.fromClass(class extends TableCellEditor {
  update(update: import('@codemirror/view').ViewUpdate) { this.sync(update.transactions); }
});
