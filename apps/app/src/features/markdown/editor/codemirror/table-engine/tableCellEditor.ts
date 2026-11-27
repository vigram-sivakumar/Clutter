import { EditorState, Facet, Prec, Transaction } from '@codemirror/state';
import { closeBrackets, closeBracketsKeymap, closeCompletion, completionStatus, insertBracket } from '@codemirror/autocomplete';
import { semanticCompletion } from '../completion';
import { wikiLinkAutocomplete } from '../wikilink/wikiLinkAutocomplete';
import type { GetWikiLinkSuggestions } from '../wikilink/wikiLinkSuggestion';
import type { GetHeadingSuggestions } from '../completionPopup/headingCompletion';
import { tagAutocomplete } from '../tag/tagAutocomplete';
import { dateAutocomplete } from '../date/dateAutocomplete';
import type { GetTagSuggestions } from '../tag/tagSuggestion';
import { tableDeletionSelectionChanged, tableDeletionSelectionField } from '../table/tableDeletionSelection';
import { tableAtCaret } from '../table/tableRootSelectionSnap';
import type { PasteAssets } from '../paste/assetPaste';
import { drawSelection, EditorView, keymap, tooltips, ViewPlugin } from '@codemirror/view';
import { completionPopupDOM } from '../completionPopup/completionTooltipSpace';
import { defaultKeymap, isolateHistory, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { formatShortcutsKeymap } from '../format/formatShortcutsKeymap';
import { markdownLanguageExtension } from '../markdownLanguage';
import type { ParticipantResolvers } from '../highlight/inlineLivePreviewParticipants';
import { inlinePreviewExtensions, refreshInlinePresentation } from '../highlight/inlineLivePreviewRegion';
import { sharedMarkdownParser } from '../../../render/sharedMarkdownParser';
import { paintInlineMarkdown, renderInlineMarkdown } from '../table/renderInlineMarkdown';
import { createCellTransaction, editableCell, type CellAddress } from './tableCellTransaction';
import { logicalCellText, tableCellTransport } from './tableCellTransport';
import { readTable, TableEngineError } from './tableModel';
import { createTableTransaction, validatedRootEdit } from './tableTransaction';
import type { TableCommand } from './tableCommands';
import { bookmark, restoredSelection, tableSelectionTransition, type SelectionBookmark } from './tableSelectionHistory';
import { arrowInteraction, extendInteraction, focusCell, isValidCell, noInteraction, selectionBounds, tabInteraction,
  type Direction, type TableInteraction } from './tableInteraction';
import { clearSelectedCommand, externalCell, pasteSelectedCommand, readGrid, selectedGrid, writeGrid, type Grid } from './tableClipboard';
import { createPastedTable } from './tableCreatePaste';
import { TableDragSelection } from './tableDragSelection';
import type { TableHandleMenuSelection, OnTableHandleMenuChange } from '../table/tableHandleMenuSync';

const parse = (source: string) => sharedMarkdownParser.parse(source);
const tableControls = 'button, .cm-table-row-handle, .cm-table-column-handle, .cm-table-row-handle-hit, .cm-table-column-handle-hit';

/** Dependencies of the table editor. */
export const tableEngineIntegration = Facet.define<{
  readonly getPasteAssets?: () => PasteAssets | undefined;
  readonly resolvers?: ParticipantResolvers;
  readonly getTagSuggestions?: () => GetTagSuggestions | undefined;
  readonly getWikiLinkSuggestions?: () => GetWikiLinkSuggestions | undefined;
  readonly getHeadingSuggestions?: () => GetHeadingSuggestions | undefined;
}>();

interface ActiveCell { tableFrom: number; cell: CellAddress; from: number; to: number }

/** At most one live nested view per root, scoped to a single cell activation. */
export class TableCellEditor {
  nested: EditorView | null = null;
  private active: ActiveCell | null = null;
  private forwarding = false;

  // The interaction owns logical selection. The active source span above is
  // only the mapped address of the mounted nested document.
  private interaction: TableInteraction = noInteraction;
  private interactionTable: number | null = null;
  private pendingHistory: SelectionBookmark | null | undefined;
  private historyFocus: SelectionBookmark | null = null;
  private handleMenu: { selection: TableHandleMenuSelection; notify: OnTableHandleMenuChange } | null = null;

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
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(tableControls) || target?.closest('.cm-tooltip')) return;
    const host = target?.closest<HTMLElement>('[data-cell]') ??
      target?.closest('th, td')?.querySelector<HTMLElement>(':scope > [data-cell]') ?? null;
    if (!host || host.closest('[data-table-engine-cells="true"]') !== widget) return;
    const [row, col] = host.dataset.cell!.split(',').map(Number);
    if (!Number.isInteger(row) || !Number.isInteger(col)) return;
    this.drag.begin(event, widget, host, { row: row!, col: col! });
  }

  consumeDragClick(widget: HTMLElement, event: MouseEvent): void { this.drag.consumeClick(widget, event); }
  cancelDrag(widget?: HTMLElement): void { this.drag.cancel(widget); }

  constructor(readonly root: EditorView) {
    root.dom.ownerDocument.addEventListener('mousedown', this.outsideClick, true);
    root.dom.ownerDocument.addEventListener('keydown', this.historyKey, true);
    root.dom.ownerDocument.addEventListener('beforeinput', this.nativeHistory, true);
    root.contentDOM.addEventListener('focus', this.repairRootFocus);
  }

  /** A root selection must always exist in CM6, even while a widget owns
   * focus. If the root actually regains focus on a parked, hidden position,
   * move to real text or neutral widget focus rather than selecting it.
   * Defer until after CM6's focus/selection update and widget reconciliation. */
  repairRootFocus = (): void => {
    if (this.root.dom.ownerDocument.activeElement !== this.root.contentDOM) return;
    queueMicrotask(() => {
      if (!this.root.dom.isConnected || this.root.state.readOnly ||
          this.root.dom.ownerDocument.activeElement !== this.root.contentDOM) return;
      const range = this.root.state.selection.main;
      if (!range.empty) return;
      const table = tableAtCaret(this.root.state, range.head);
      if (table) this.dismissTableSpace(table.from, range.head >= table.to);
    });
  };

  /** Native WebKit can deliver Undo/Redo as beforeinput rather than a
   * keydown. Both routes must target the one root history, never browser
   * history for a contenteditable nested document or its projection. */
  private ownsHistoryTarget(target: EventTarget | null): boolean {
    const doc = this.root.dom.ownerDocument;
    // Neutral focus after a non-cell click or quick-add still belongs to
    // this editor's single root history, not native browser history.
    if (target instanceof HTMLElement && target === doc.activeElement &&
        target.matches('.cm-table-widget[data-table-engine-cells="true"]') &&
        this.root.dom.contains(target)) return true;
    if (this.interactionTable === null || this.interaction.kind === 'none') return false;
    const cell = focusCell(this.interaction);
    const host = cell && this.hostAt(this.interactionTable, cell);
    if (target instanceof Node && host?.contains(target)) return true;
    if (!this.historyFocus) return false;
    return (target === doc.body && doc.activeElement === doc.body) ||
      (target === this.root.contentDOM && (doc.activeElement === this.root.contentDOM || doc.activeElement === doc.body || !!host?.contains(doc.activeElement)));
  }

  private historyKey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing || event.altKey ||
      !(event.metaKey || event.ctrlKey) || (event.code !== 'KeyZ' && event.key.toLowerCase() !== 'z') ||
      !this.ownsHistoryTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    this.stepHistory(!event.shiftKey);
  };

  private nativeHistory = (event: InputEvent): void => {
    if (event.defaultPrevented || !event.cancelable || event.isComposing ||
        (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') ||
        !this.ownsHistoryTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    this.stepHistory(event.inputType === 'historyUndo');
  };

  /** Tab and arrow selection, not only restored history, may lose DOM
   * focus during WebKit reconciliation. Repair only our own selection,
   * and never take focus from an unrelated control. */
  private repairSelectionFocus(mark: SelectionBookmark): void {
    queueMicrotask(() => {
      if (this.historyFocus !== mark || !this.root.dom.isConnected) return;
      const doc = this.root.dom.ownerDocument;
      if (doc.activeElement !== doc.body && doc.activeElement !== this.root.contentDOM) return;
      const cell = focusCell(mark.interaction);
      if (cell) this.hostAt(mark.tableFrom, cell)?.focus({ preventScroll: true });
    });
  }

  private outsideClick = (event: MouseEvent): void => {
    const target = event.target;
    // The active cell's CM6 tooltip lives outside the scrollport. Its
    // mousedown must reach CM6's option handler before outside dismissal.
    if (target instanceof Node && this.nested && completionPopupDOM(this.nested)?.contains(target)) return;
    // Table whitespace and borders share the controller's dismissal path.
    const widget = target instanceof Element
      ? target.closest<HTMLElement>('[data-table-engine-cells="true"]') : null;
    if (event.button === 0 && !event.shiftKey && widget && widget.closest('.cm-editor') === this.root.dom &&
        target instanceof Element && !target.closest(`th, td, ${tableControls}`)) {
      // Leave native scrollbar gestures alone; the scrollport's padding
      // above a scrollbar is still ordinary surrounding whitespace.
      if (target instanceof HTMLElement && target.classList.contains('cm-table-scroll')) {
        const rect = target.getBoundingClientRect();
        if (target.offsetHeight > target.clientHeight + target.clientTop &&
            event.clientY >= rect.top + target.clientTop + target.clientHeight) return;
      }
      if (this.dismissTableSpace(Number(widget.dataset.tableFrom))) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (this.interactionTable === null) return;
    if (target instanceof Element && target.closest('.cm-table-handle-menu')) return;
    // The portaled backdrop is a sibling of the menu surface, not a
    // descendant of the menu. Its mousedown precedes Overlay's click-to-
    // dismiss callback. Let that callback close only the menu, not the
    // selected axis. Other overlays and ordinary outside clicks are not
    // exempt.
    if (this.handleMenu && target instanceof Element) {
      const backdrop = target.closest('.overlay__backdrop');
      if (backdrop?.parentElement?.querySelector(':scope > .overlay__surface .cm-table-handle-menu')) return;
    }
    if (target instanceof Element &&
      this.root.dom.contains(target) && target.closest('[data-table-engine-cells="true"]')) return;
    this.cancelDrag();
    this.close();
  };

  private clearRootTableInteraction(tableFrom?: number): void {
    const armed = this.root.state.field(tableDeletionSelectionField, false) ?? null;
    // Collapse any previous root text range when ownership transfers to a
    // cell. A parked boundary is never a typing target while the host owns focus.
    const table = tableFrom !== undefined && !this.root.state.selection.main.empty
      ? this.snapshot(tableFrom) : null;
    if (armed === null && !table) return;
    const anchor = table ? table.from > 0 ? table.from - 1 :
      Math.min(table.to + 1, this.root.state.doc.length) : undefined;
    this.root.dispatch({
      effects: armed === null ? [] : [tableDeletionSelectionChanged.of(null)],
      selection: anchor === undefined ? undefined : { anchor },
    });
  }

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
    let full = false;
    if (this.interactionTable === from && this.interaction.kind !== 'editing') {
      try {
        const shape = this.shape(from);
        bounds = selectionBounds(this.interaction, shape);
        full = !!bounds && bounds.top === 0 && bounds.left === 0 &&
          bounds.bottom === shape.rows - 1 && bounds.right === shape.cols - 1;
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
      const axis = this.interactionTable === from ? this.interaction.kind : 'none';
      cell.classList.toggle('cm-table-column-selected', selected && axis === 'column');
      cell.parentElement?.classList.toggle('cm-table-row-selected', axis === 'row' && focus?.row === row);
      cell.classList.toggle('cm-table-engine-selected', selected);
      cell.classList.toggle('cm-table-engine-top', selected && row === bounds?.top);
      cell.classList.toggle('cm-table-engine-bottom', selected && row === bounds?.bottom);
      cell.classList.toggle('cm-table-engine-left', selected && col === bounds?.left);
      cell.classList.toggle('cm-table-engine-right', selected && col === bounds?.right);
    }
    // The root owns coarse selection/deletion arming; the engine owns the
    // more specific interaction. Suppress the coarse halo while editing or
    // selecting cells, and restore it when that interaction closes.
    widget.firstElementChild?.classList.toggle('cm-table-wrapper-selected',
      full || (widget.dataset.tableRootSelected === 'true' &&
      !(this.interactionTable === from && this.interaction.kind !== 'none')));
    widget.firstElementChild?.dispatchEvent(new CustomEvent('table-engine-selection', { detail: bounds }));
  }

  private paintSelection(): void {
    this.root.dom.querySelectorAll<HTMLElement>('[data-table-engine-cells="true"]').forEach(widget => this.paintWidget(widget));
  }

  private select(tableFrom: number, interaction: TableInteraction, preventScroll = false): boolean {
    const cell = focusCell(interaction);
    if (!cell || !isValidCell(cell, this.shape(tableFrom))) return false;
    this.clearRootTableInteraction(tableFrom);
    const host = this.hostAt(tableFrom, cell);
    if (!host) return false;
    // Keep the range owner stable while the pointer crosses cells. Only
    // tear down an editor/interaction when ownership actually changes.
    if (!(preventScroll && this.interactionTable === tableFrom &&
        this.interaction.kind === 'range' && interaction.kind === 'range')) this.close();
    this.interactionTable = tableFrom;
    this.interaction = interaction;
    this.paintSelection();
    host.focus({ preventScroll });
    this.historyFocus = bookmark(tableFrom, interaction);
    if (this.historyFocus) this.repairSelectionFocus(this.historyFocus);
    return true;
  }

  /** Preserve a safe idle caret, or move focus to nearby text or the widget itself. */
  private dismissTableSpace(tableFrom: number, preferAfter = true): boolean {
    if (this.root.state.readOnly) return false;
    try {
      const table = this.snapshot(tableFrom);
      const before = table.from > 0 ? table.from - 1 : null;
      const after = table.to < this.root.state.doc.length ? table.to + 1 : null;
      const candidates = preferAfter ? [after, before] : [before, after];
      const range = this.root.state.selection.main;
      const idleTextCaret = this.interactionTable === null && range.empty && !tableAtCaret(this.root.state, range.head);
      const anchor = idleTextCaret
        ? range.head
        : candidates.find(pos => pos !== null && !tableAtCaret(this.root.state, pos));
      this.cancelDrag();
      this.close();
      this.clearRootTableInteraction();
      if (anchor !== undefined && anchor !== null) {
        if (!range.empty || range.head !== anchor) this.root.dispatch({ selection: { anchor } });
        this.root.focus();
      } else {
        // No actual text line exists. Do not invent one on a mouse click.
        const widget = this.hostAt(tableFrom, { row: 0, col: 0 })?.closest<HTMLElement>('.cm-table-widget');
        if (!widget) return false;
        if (!range.empty || range.head !== table.to) {
          this.root.dispatch({ selection: { anchor: table.to } });
        }
        widget.focus({ preventScroll: true });
      }
      return true;
    } catch (error) {
      if (!(error instanceof TableEngineError)) throw error;
      return false;
    }
  }

  /** Explicit block selection, not an incidental root-focus gesture. */
  selectBlock(tableFrom: number): boolean {
    if (this.root.state.readOnly) return false;
    try {
      this.cancelDrag();
      return this.select(tableFrom, { kind: 'table', cell: { row: 0, col: 0 } });
    } catch (error) {
      if (!(error instanceof TableEngineError)) throw error;
      return false;
    }
  }

  private navigateTab(backwards: boolean): boolean {
    if (this.interactionTable === null) return false;
    const from = this.interactionTable;
    const next = tabInteraction(this.interaction, this.shape(from), backwards);
    if (next.kind !== 'none') return this.select(from, next);
    return this.leaveTable(from, backwards);
  }

  /** Enter opens the neighbouring cell for typing; never wrap or leave at a boundary. */
  private navigateEnter(backwards: boolean): boolean {
    if (this.interactionTable === null || this.nested?.composing) return false;
    const from = this.interactionTable;
    const cell = focusCell(this.interaction);
    if (!cell) return false;
    const shape = this.shape(from);
    const bounds = selectionBounds(this.interaction, shape);
    if (!backwards && (this.interaction.kind === 'table' ||
        (this.interaction.kind === 'range' && bounds?.top === 0 && bounds.left === 0 &&
          bounds.bottom === shape.rows - 1 && bounds.right === shape.cols - 1))) {
      this.cancelDrag();
      return this.enterCell(from, { row: 0, col: 0 }, 'start');
    }
    const next = { row: cell.row + (backwards ? -1 : 1), col: cell.col };
    if (isValidCell(next, shape)) {
      this.cancelDrag();
      return this.enterCell(from, next, 'start');
    }
    // Consume the boundary key too: preserve the current selection/editor.
    return true;
  }

  /** Restore legacy active-cell arrow semantics without changing the
   * accepted caret-free selection and Tab behaviour. */
  private navigateEditingArrow(direction: Direction): boolean {
    if (!this.active || !this.nested || this.nested.composing) return false;
    const { tableFrom, cell } = this.active;
    const sel = this.nested.state.selection.main;
    const horizontal = direction === 'left' || direction === 'right';
    const backwards = direction === 'left' || direction === 'up';
    if (horizontal && (!sel.empty || sel.head !== (backwards ? 0 : this.nested.state.doc.length))) return false;
    if (!sel.empty) return false;
    const shape = this.shape(tableFrom);
    const next = horizontal
      ? focusCell(tabInteraction(this.interaction, shape, backwards))
      : { row: cell.row + (backwards ? -1 : 1), col: cell.col };
    if (next && isValidCell(next, shape)) {
      this.cancelDrag();
      return this.enterCell(tableFrom, next, direction === 'left' ? 'end' : 'start');
    }
    return this.leaveTable(tableFrom, backwards);
  }

  /** An explicit keyboard exit may create a real text line at EOF, but
   * never focus the root on the table's hidden last source line. */
  private leaveTable(tableFrom: number, backwards: boolean): boolean {
    const snapshot = this.snapshot(tableFrom);
    // At the first document position there is no preceding text line.
    if (backwards && snapshot.from === 0) return true;
    const mark = bookmark(tableFrom, this.interaction);
    const end = snapshot.to;
    if (!backwards && end === this.root.state.doc.length) {
      // Same legacy EOF exit: create an ordinary line below the table.
      // Preflight it through the root filter and history pipeline.
      try {
        const tr = validatedRootEdit(this.root.state, { from: end, insert: '\n' },
          this.root.state.doc.toString() + '\n', 'input.table.exit', true,
          tableSelectionTransition.of({ before: mark, after: null }),
          { selection: { anchor: end + 1 }, scrollIntoView: true });
        this.cancelDrag();
        this.close();
        this.root.dispatch(tr);
      } catch (error) {
        if (!(error instanceof TableEngineError)) throw error;
        return true;
      }
    } else {
      this.cancelDrag();
      this.close();
      this.root.dispatch({ selection: { anchor: backwards ? snapshot.from - 1 : end + 1 }, scrollIntoView: true });
    }
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

  /** Structural actions use the same model validation and root history as
   * cell/clipboard edits. The projection supplies an explicit table/index,
   * never a stale root text caret or a legacy selection field. */
  structural(tableFrom: number, command: Extract<TableCommand, { kind: 'insertRow' | 'deleteRow' | 'duplicateRow' | 'insertColumn' | 'deleteColumn' | 'duplicateColumn' }>, quick = false): boolean {
    if (this.root.state.readOnly) return false;
    try {
      this.clearRootTableInteraction();
      const shape = this.shape(tableFrom);
      const row = command.kind === 'insertRow' || command.kind === 'deleteRow' || command.kind === 'duplicateRow';
      const count = row ? shape.rows : shape.cols;
      const index = command.index;
      const insert = command.kind === 'insertRow' || command.kind === 'insertColumn';
      const remove = command.kind === 'deleteRow' || command.kind === 'deleteColumn';
      if (!Number.isInteger(index) || index < 0 || index > (insert ? count : count - 1)) return false;
      const whole = remove && count === 1;
      const nextIndex = insert ? index : remove ? Math.min(index, count - 2) : index + 1;
      const next: TableInteraction = quick || whole ? noInteraction :
        { kind: row ? 'row' : 'column', cell: row ? { row: nextIndex, col: 0 } : { row: 0, col: nextIndex } };
      const before = this.interactionTable === tableFrom ? bookmark(tableFrom, this.interaction) : null;
      const effect = tableSelectionTransition.of({ before, after: bookmark(tableFrom, next) });
      const tr = createTableTransaction(this.root.state, tableFrom, whole ? { kind: 'deleteTable' } : command, parse, effect);
      if (!tr) return false;
      this.cancelDrag();
      this.close();
      this.forwarding = true;
      try { this.root.dispatch(tr); } finally { this.forwarding = false; }
      if (next.kind !== 'none') this.select(tableFrom, next);
      else if (whole) this.root.focus();
      else this.dismissTableSpace(tableFrom);
      return true;
    } catch (error) {
      if (!(error instanceof TableEngineError)) throw error;
      return false;
    }
  }

  selectAxis(tableFrom: number, cell: CellAddress, axis: 'row' | 'column'): boolean {
    try {
      this.cancelDrag();
      return this.select(tableFrom, { kind: axis, cell });
    } catch (error) {
      if (!(error instanceof TableEngineError)) throw error;
      return false;
    }
  }

  currentAxisSelection(): TableHandleMenuSelection | null {
    if (this.interactionTable === null) return null;
    const i = this.interaction;
    if (i.kind === 'row') return { kind: 'row', tableFrom: this.interactionTable, rowIndex: i.cell.row };
    if (i.kind === 'column') return { kind: 'column', tableFrom: this.interactionTable, columnIndex: i.cell.col };
    return null;
  }

  matchesAxis(selection: TableHandleMenuSelection): boolean {
    const current = this.currentAxisSelection();
    return !!current && current.tableFrom === selection.tableFrom &&
      (current.kind === 'row' && selection.kind === 'row' ? current.rowIndex === selection.rowIndex :
        current.kind === 'column' && selection.kind === 'column' && current.columnIndex === selection.columnIndex);
  }

  /** Menu availability derives from the same model that validates commands. */
  axisMenuState(selection: TableHandleMenuSelection) {
    if (!this.matchesAxis(selection)) return null;
    try {
      const { model } = this.snapshot(selection.tableFrom);
      const alignment = selection.kind === 'column' ? model.alignments[selection.columnIndex] : undefined;
      return {
        rowMoveAvailability: selection.kind === 'row' ? {
          canMoveUp: selection.rowIndex > 0,
          canMoveDown: selection.rowIndex < model.rows.length,
        } : null,
        columnMoveAvailability: selection.kind === 'column' ? {
          canMoveLeft: selection.columnIndex > 0,
          canMoveRight: selection.columnIndex < model.header.length - 1,
        } : null,
        columnAlignment: alignment && alignment !== 'none' ? alignment : null,
      };
    } catch (error) {
      if (!(error instanceof TableEngineError)) throw error;
      return null;
    }
  }

  openHandleMenu(selection: TableHandleMenuSelection, notify: OnTableHandleMenuChange): void {
    if (!this.matchesAxis(selection)) return;
    this.handleMenu = { selection, notify };
    notify({ selection });
  }

  dismissHandleMenu(): void {
    const menu = this.handleMenu;
    this.handleMenu = null;
    // Explicit dismissal (Escape or backdrop) leaves the axis selected.
    // Give keyboard ownership back to the selected cell host, not the
    // decorative menu anchor, unless an action already closed the menu.
    if (menu && this.matchesAxis(menu.selection)) {
      const cell = focusCell(this.interaction);
      if (cell) this.hostAt(menu.selection.tableFrom, cell)?.focus({ preventScroll: true });
    }
  }

  /** The original menu/drag surface supplies logical commands only.
   * No legacy selection field or mutation is used for an engine table. */
  axisCommand(selection: TableHandleMenuSelection, action: TableCommand | 'clear'): boolean {
    if (!this.matchesAxis(selection) || this.root.state.readOnly) return false;
    const from = selection.tableFrom;
    try {
      if (action === 'clear') {
        const result = this.clearSelected();
        const cell = focusCell(this.interaction);
        if (cell) this.hostAt(from, cell)?.focus({ preventScroll: true });
        return result;
      }
      if (action.kind === 'insertRow' || action.kind === 'deleteRow' || action.kind === 'duplicateRow' ||
          action.kind === 'insertColumn' || action.kind === 'deleteColumn' || action.kind === 'duplicateColumn') {
        return this.structural(from, action);
      }
      const next: TableInteraction = action.kind === 'moveRow' ? { kind: 'row', cell: { row: action.to, col: 0 } } :
        action.kind === 'moveColumn' ? { kind: 'column', cell: { row: 0, col: action.to } } : this.interaction;
      const tr = createTableTransaction(this.root.state, from, action, parse, tableSelectionTransition.of({
        before: bookmark(from, this.interaction), after: bookmark(from, next),
      }));
      if (!tr) {
        const cell = focusCell(this.interaction);
        if (cell) this.hostAt(from, cell)?.focus({ preventScroll: true });
        return false;
      }
      this.cancelDrag();
      this.close();
      this.forwarding = true;
      try { this.root.dispatch(tr); } finally { this.forwarding = false; }
      this.select(from, next, true);
      return true;
    } catch (error) {
      if (!(error instanceof TableEngineError)) throw error;
      return false;
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
      const files = Array.from(data.files ?? []);
      if (files.length) this.root.state.facet(tableEngineIntegration)[0]?.getPasteAssets?.()?.onSkipped?.(
        files.map(file => file.name || 'file'), 'target');
      const grid = readGrid(data, !editing);
      // A one-cell clipboard payload is text when a caret is active,
      // even when the source supplied Clutter MIME or a one-cell HTML
      // table. Only an actual multi-cell grid replaces cell contents.
      // In caret-free selection mode a scalar still replaces the cell.
      if (editing && this.nested && this.active &&
        (!grid || (grid.length === 1 && grid[0]?.length === 1))) {
        const text = grid ? grid[0]![0]! : data.getData('text/plain');
        if (text !== '') this.nested.dispatch({
          // External Markdown retains the established odd/even escaping
          // contract; grids already contain normalized raw cell source.
          // Decode exactly once before the logical input filter encodes.
          ...this.nested.state.replaceSelection(logicalCellText(grid ? text : externalCell(text, false))),
          userEvent: 'input.paste',
        });
        return;
      }
      if (!grid) return;
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
  pasteNewTable(grid: Grid): boolean {
    try {
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
    if ((backwards ? undoDepth : redoDepth)(this.root.state) === 0) return true;
    this.cancelDrag();
    // Do not focus the root before dispatch: history restoration chooses
    // the focus destination, including an ordinary root text position.
    this.close();
    (backwards ? undo : redo)(this.root);
    if (this.interaction.kind === 'none') this.root.focus();
    return true;
  }

  /** Run after CM6 reconciles its block widgets, not during plugin update.
   * Creation and history store only intent; the current root source validates it. */
  restoreHistory(): void {
    const mark = this.pendingHistory;
    if (mark === undefined) return;
    this.pendingHistory = undefined;
    this.close();
    if (!mark) { this.root.focus(); return; }
    try {
      if (this.select(mark.tableFrom, mark.interaction, true)) {
        // select() establishes the same focus repair used by Tab.
        return;
      }
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
        consume(); this.stepHistory(!event.shiftKey); return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        consume(); this.select(tableFrom, { kind: 'table', cell }); return;
      }
      if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        consume(); this.navigateEnter(event.shiftKey); return;
      }
      if (event.key === 'F2') {
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
        const state = this.nested.state;
        const length = state.doc.length;
        // A selected cell is replaced, not wrapped. For the first WikiLink
        // bracket, run CM6's own pairing command against the proposed empty
        // cell and compose it into the same validated root edit. Never
        // publish a separate clear transaction or hand-roll a closer.
        if (event.key === '[') {
          const clear = state.update({ changes: { from: 0, to: length }, selection: { anchor: 0 } });
          const pair = insertBracket(clear.state, event.key);
          if (pair) {
            this.nested.dispatch({ changes: clear.changes.compose(pair.changes),
              selection: pair.newSelection, effects: pair.effects, userEvent: 'input.type' });
            return;
          }
        }
        this.nested.dispatch({ changes: { from: 0, to: length, insert: event.key },
          selection: { anchor: event.key.length }, userEvent: 'input.type' });
      }
    } catch (error) {
      if (!(error instanceof TableEngineError)) throw error;
    }
  }

  owns(host: Element): boolean { return !!this.nested && host.contains(this.nested.dom); }

  /** Root boundary navigation shares the same activation path as a click. */
  enterCell(tableFrom: number, cell: CellAddress, cursorAt: 'start' | 'end'): boolean {
    if (this.root.state.readOnly) return false;
    try {
      const host = this.hostAt(tableFrom, cell);
      if (!host) return false;
      this.activate(tableFrom, cell, host);
      if (!this.active || !this.nested) return false;
      this.nested.dispatch({ selection: { anchor: cursorAt === 'start' ? 0 : this.nested.state.doc.length } });
      return true;
    } catch (error) {
      if (!(error instanceof TableEngineError)) throw error;
      return false;
    }
  }

  activate(tableFrom: number, cell: CellAddress, host: HTMLElement, event?: MouseEvent): void {
    if (this.root.state.readOnly) return;
    // Only the focused cell may own a completion popup. Prose completion
    // deliberately does not close on blur, so close it when ownership moves.
    if (completionStatus(this.root.state) !== null) closeCompletion(this.root);
    this.clearRootTableInteraction(tableFrom);
    host = this.hostAt(tableFrom, cell) ?? host;
    this.close();
    let snapshot = readTable(this.root.state.doc.toString(), tableFrom, parse);
    if (!snapshot.cells[cell.row]?.[cell.col]) {
      const tr = createTableTransaction(this.root.state, tableFrom, { kind: 'materialize' }, parse);
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
    // Match the prototype: history never groups typing across two cell
    // activations, and no detached nested view can retain native state.
    this.root.dispatch({ annotations: isolateHistory.of('full') });
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
        EditorView.lineWrapping,
        tableCellTransport(),
        // Same CM6 inline pair insertion and type-over as the main editor.
        // Block quote conversion is deliberately not a cell feature.
        closeBrackets(),
        // Same inline participants and WikiLink widget as the main editor.
        // No block styling or Markdown block keymap in a single cell.
        markdownLanguageExtension(),
        inlinePreviewExtensions(this.root.state.facet(tableEngineIntegration)[0]?.resolvers, false, 'table'),
        formatShortcutsKeymap(),
        // The shared WikiLink pipe-accept command gets first refusal;
        // ordinary pipe typing still follows the mapped input route.
        wikiLinkAutocomplete('table'),
        // Own the physical pipe key before native contenteditable input.
        // Route it through the same nested transaction filter and root
        // preflight as ordinary text; never allow a default insertion after
        // a refused edit. IME input stays on CM6's composition path.
        Prec.highest(keymap.of([{
          key: '|',
          run: view => {
            if (view.composing) return false;
            view.dispatch({ ...view.state.replaceSelection('|'), userEvent: 'input.type' });
            return true;
          },
        }])),
        // Escape belongs to a visible completion popup, not to an
        // invisible pending query after ordinary cell typing. Cancel
        // that query and exit the cell in the same gesture. Register
        // before semanticCompletion: CM6's default completion keymap
        // also has Prec.highest; equal precedence follows extension order.
        Prec.highest(keymap.of([{
          key: 'Escape',
          run: view => {
            if (completionStatus(view.state) !== 'pending') return false;
            closeCompletion(view);
            return this.exitEdit();
          },
        }])),
        // Same providers, popup and lifecycle as prose. Only WikiLink's
        // source context differs; single-line cells still exclude embeds.
        semanticCompletion(
          this.root.state.facet(tableEngineIntegration)[0]?.getWikiLinkSuggestions ?? (() => undefined),
          this.root.state.facet(tableEngineIntegration)[0]?.getTagSuggestions,
          () => undefined,
          this.root.state.facet(tableEngineIntegration)[0]?.getHeadingSuggestions,
          {}, {}, 'table'
        ),
        // CM6 owns the external tooltip container, theme, positioning and
        // disposal. Preserve table overflow and the shared tooltipSpace.
        tooltips({ parent: this.root.dom.ownerDocument.body }),
        tagAutocomplete(),
        dateAutocomplete(),
        Prec.low(keymap.of([
          { key: 'Mod-z', run: () => this.stepHistory(true) },
          { key: 'Mod-Shift-z', run: () => this.stepHistory(false) },
          { key: 'Mod-y', run: () => this.stepHistory(false) },
          { key: 'Tab', run: () => this.navigateTab(false) },
          { key: 'Shift-Tab', run: () => this.navigateTab(true) },
          // CM6's completion keymap runs first. Its Enter command may
          // decline during the popup's interaction delay; don't navigate
          // away from the cell in that case.
          { key: 'Enter', run: view => completionStatus(view.state) === 'active' || this.navigateEnter(false) },
          { key: 'Shift-Enter', run: () => this.navigateEnter(true) },
          { key: 'Mod-a', run: () => this.select(tableFrom, { kind: 'table', cell }) },
          { key: 'Ctrl-a', run: () => this.select(tableFrom, { kind: 'table', cell }) },
          { key: 'Escape', run: () => this.exitEdit() },
          { key: 'ArrowLeft', run: () => this.navigateEditingArrow('left') },
          { key: 'ArrowRight', run: () => this.navigateEditingArrow('right') },
          { key: 'ArrowUp', run: () => this.navigateEditingArrow('up') },
          { key: 'ArrowDown', run: () => this.navigateEditingArrow('down') },
          ...closeBracketsKeymap,
          ...defaultKeymap,
        ])),
      ],
    });
    host.replaceChildren();
    this.nested = new EditorView({ state, parent: host, dispatchTransactions: (transactions, view) => {
      if (view === this.nested) this.dispatch(transactions);
    } });
    this.nested.focus();
    if (event) this.nested.contentDOM.dispatchEvent(new MouseEvent('mousedown', {
      clientX: event.clientX, clientY: event.clientY, button: 0, detail: event.detail, bubbles: false,
    }));
  }

  private dispatch(transactions: readonly Transaction[]): void {
    if (!this.nested || !this.active) return;
    for (const tr of transactions) {
      if (!tr.docChanged) { this.nested.update([tr]); continue; }
      const active: ActiveCell | null = this.active;
      if (!active) return;
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
        // The host's live canEdit gate may drop the root transaction at
        // dispatch (after state filters ran). The child must not get ahead
        // of the authoritative document, or run a completion side effect
        // on an insertion that never reached the root.
        if (this.root.state === rootTr.startState) return;
        if (this.active !== active || !this.nested) return;
        if (this.root.state.sliceDoc(active.from, active.to) !== tr.newDoc.toString()) {
          // A synchronous reconciliation superseded the proposed cell text.
          this.close();
          return;
        }
        this.nested.update([tr]);
      } catch (error) {
        if (!(error instanceof TableEngineError)) throw error;
        // Both views retain the last accepted revision.
      }
    }
  }

  sync(transactions: readonly Transaction[]): void {
    for (const tr of transactions) {
      const created = tr.docChanged && tr.isUserEvent('input') && !tr.isUserEvent('input.paste.table')
        ? tr.effects.find(effect => effect.is(tableSelectionTransition) &&
            effect.value.before === null && effect.value.after?.interaction.kind === 'table')
        : undefined;
      const mark = created?.is(tableSelectionTransition) ? created.value.after : restoredSelection(tr);
      if (mark !== undefined) this.pendingHistory = mark;
      if (!tr.docChanged) continue;
      if (!this.forwarding) {
        const dragging = this.drag.inProgress;
        this.cancelDrag();
        if (dragging && this.interaction.kind === 'range') this.close();
      }
      if (!this.active) {
        if (this.interactionTable !== null && !this.forwarding) {
          // A revision outside this exact table does not invalidate its
          // cell addresses. A changed or removed table still closes.
          const oldFrom = this.interactionTable;
          const newFrom = tr.changes.mapPos(oldFrom, 1);
          try {
            const before = readTable(tr.startState.doc.toString(), oldFrom, parse);
            const after = readTable(tr.newDoc.toString(), newFrom, parse);
            if (before.source !== after.source) this.close();
            else {
              this.interactionTable = newFrom;
              this.historyFocus = bookmark(newFrom, this.interaction);
              if (this.historyFocus) this.repairSelectionFocus(this.historyFocus);
            }
          } catch (error) {
            if (!(error instanceof TableEngineError)) throw error;
            this.close();
          }
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
      if (!this.forwarding) {
        // A change outside the active text may still remove the table,
        // insert a preceding row/column or turn it into unsupported input.
        // Validate the mapped span against the same logical cell before
        // accepting further nested keystrokes.
        try {
          const snap = readTable(tr.newDoc.toString(), this.active.tableFrom, parse);
          const cell = snap.cells[this.active.cell.row]?.[this.active.cell.col];
          if (!cell || this.active.from < cell.rawFrom || this.active.to > cell.rawTo ||
              tr.newDoc.sliceString(this.active.from, this.active.to) !== this.nested?.state.doc.toString()) this.close();
        } catch (error) {
          if (!(error instanceof TableEngineError)) throw error;
          this.close();
        }
      }
    }
  }

  close(): void {
    const menu = this.handleMenu;
    this.handleMenu = null;
    menu?.notify(null);
    this.historyFocus = null;
    const nested = this.nested;
    const host = nested?.dom.parentElement;
    this.nested = null;
    this.active = null;
    nested?.destroy();
    this.interaction = noInteraction;
    this.interactionTable = null;
    this.paintSelection();
    if (host) {
      // The next projection paints current Markdown. Force an update when only focus changed.
      const root = host.closest<HTMLElement>('.cm-table-widget');
      const [row, col] = (host.dataset.cell ?? '').split(',').map(Number);
      try {
        const snapshot = readTable(this.root.state.doc.toString(), Number(root?.dataset.tableFrom), parse);
        paintInlineMarkdown(host, [snapshot.model.header, ...snapshot.model.rows][row!]![col!]!, this.root,
          this.root.state.facet(tableEngineIntegration)[0]?.resolvers);
      } catch { host.textContent = ''; }
    }
  }

  destroy(): void {
    this.handleMenu = null;
    this.cancelDrag();
    this.root.dom.ownerDocument.removeEventListener('mousedown', this.outsideClick, true);
    this.root.dom.ownerDocument.removeEventListener('keydown', this.historyKey, true);
    this.root.dom.ownerDocument.removeEventListener('beforeinput', this.nativeHistory, true);
    this.root.contentDOM.removeEventListener('focus', this.repairRootFocus);
    this.historyFocus = null;
    this.nested?.destroy(); this.nested = null; this.active = null;
    this.interaction = noInteraction; this.interactionTable = null; this.pendingHistory = undefined;
  }
}

export const tableCellEditor = ViewPlugin.fromClass(class extends TableCellEditor {
  update(update: import('@codemirror/view').ViewUpdate) {
    this.sync(update.transactions);
    if (update.transactions.some(tr => tr.effects.some(effect => effect.is(refreshInlinePresentation)))) {
      this.nested?.dispatch({ effects: refreshInlinePresentation.of(null) });
    }
  }
});
