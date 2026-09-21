import type { ChangeSpec, EditorState, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { splitPipeRowCells } from './tableAlignment';
import { tableActiveCellChanged, type TableActiveCellController } from './tableActiveCellController';
import {
  findAllTables,
  getNavigableRows,
  getRowColumnSegments,
  insertRowAfterPosition,
  isAlignmentRow,
  padCellContent,
  resolveLogicalCell,
  type TableInfo,
} from './tableGeometry';
import { CLUTTER_TABLE_RANGE_MIME } from './tableRangeClipboard';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';

/**
 * Paste into an existing table — active-cell target (no `TableSelection`)
 * or `range`-kind target (clipboard rectangle replaces from the range's own
 * top-left, ignoring the range's own size — the range shrinks/grows to
 * match whatever was pasted, per the product's own explicit contract).
 *
 * Same transaction shape as every other structural table mutation in this
 * feature (`tableRowInsertion.ts`, `tableColumnInsertion.ts`,
 * `tableSelectionClear.ts`): one plain `changes` array, root selection
 * mapped forward, and an explicit `tableSelectionChanged` effect choosing
 * the resulting selection — so `tableRootSelectionSnap()` and
 * `tableSelectionDeletionHistory()` (already installed, generic over any
 * transaction carrying both) give root-caret safety and selection undo/redo
 * "for free," exactly as they already do for insertion/deletion/clearing.
 *
 * **Deliberately leans on `tableRectangularNormalization()`'s own already-
 * installed transaction filter** for widening rows *outside* the pasted
 * rectangle when the table's column count grows — that filter always pads
 * a ragged row to the header's column count with *blank* cells, which is
 * exactly correct for a row paste never touched. Only rows actually inside
 * the pasted rectangle (plus the header/alignment row, which that filter
 * explicitly never touches — see its own doc comment) are widened here,
 * with real pasted content. This is what keeps this module from having to
 * duplicate that filter's own padding logic for the common case.
 *
 * **Pipe-escaping is out of scope, matching an existing, pre-existing gap.**
 * `TableActiveCellController.forwardToRoot` already writes typed cell
 * content back into the document verbatim, with no escaping of a literal
 * `|` a user might type — this module writes pasted content into a cell
 * gap exactly the same, verbatim way. Already-escaped `\|` in copied
 * Markdown content round-trips correctly (nothing here touches it), but a
 * genuinely new, unescaped `|` arriving via external TSV/HTML paste has the
 * same known limitation ordinary typing already has, not a regression this
 * feature introduces.
 */

interface PasteTarget {
  readonly tableFrom: number;
  readonly row: number;
  readonly col: number;
}

/** Whether the active nested cell (if any) is the paste target — mutually exclusive with a `range` `TableSelection`, which always takes priority when present. */
function resolveActiveCellTarget(view: EditorView, controller: TableActiveCellController): PasteTarget | null {
  const anchor = controller.activeAnchor;
  if (!anchor) {
    return null;
  }
  const cell = resolveLogicalCell(view.state, anchor.from);
  if (!cell) {
    return null;
  }
  return { tableFrom: cell.table.from, row: cell.rowIndex, col: cell.columnIndex };
}

/** Every row padded out to the widest row's own length — missing source cells become `''`, never a ragged clipboard grid. `null` for an empty or zero-width grid (nothing to paste). */
function normalizeGrid(rows: readonly (readonly string[])[]): string[][] | null {
  if (rows.length === 0) {
    return null;
  }
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (width === 0) {
    return null;
  }
  // A cell can only ever be one Markdown source line — a raw newline
  // pasted in from HTML/TSV would otherwise split a table row in two.
  return rows.map((row) => Array.from({ length: width }, (_, i) => (row[i] ?? '').replace(/\r?\n/g, ' ')));
}

function parseHtmlTableGrid(html: string): string[][] | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) {
    return null;
  }
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) {
    return null;
  }
  return rows.map((tr) => Array.from(tr.querySelectorAll('td, th')).map((cell) => (cell.textContent ?? '').trim()));
}

export interface ClipboardTable {
  /** `'internal'` content is already-escaped raw Markdown (round-tripped through Clutter's own copy) — never re-escaped. `'html'`/`'text'` content is plain, unescaped text — a caller writing it into fresh Markdown source (e.g. `tableCreatePaste.ts`, building a brand-new table) must escape it itself; `tablePaste.ts`'s own existing-table paste never has, matching `TableActiveCellController.forwardToRoot`'s own verbatim-write precedent (see this module's own top doc comment). */
  readonly source: 'internal' | 'html' | 'text';
  readonly grid: string[][];
}

/**
 * Clipboard priority: the internal Clutter payload (exact Markdown,
 * survives even a 1x1 copy) first, then a real `<table>` in `text/html`,
 * then tab/newline-delimited `text/plain`. A single-line, tab-free
 * `text/plain` is deliberately never treated as tabular — normal paste
 * (of a single value into a single active cell) stays completely
 * unaffected by this feature; letting it fall through here means the
 * caller declines and ordinary CM6/browser paste proceeds.
 *
 * Exported for `tableCreatePaste.ts` (Milestone 6, paste-creates-a-table
 * outside any existing table) to reuse this exact same parsing/priority
 * logic rather than a second copy of it — the one thing that genuinely
 * differs between the two milestones is what happens to the parsed grid
 * afterward (write into an existing table's cells verbatim, vs. escape and
 * serialize into a brand-new table's Markdown source), not how the
 * clipboard itself is read.
 */
export function readClipboardTable(event: ClipboardEvent): ClipboardTable | null {
  const data = event.clipboardData;
  if (!data) {
    return null;
  }

  const internal = data.getData(CLUTTER_TABLE_RANGE_MIME);
  if (internal) {
    try {
      const parsed: unknown = JSON.parse(internal);
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed as { kind?: unknown }).kind === 'clutter-table-range' &&
        Array.isArray((parsed as { rows?: unknown }).rows)
      ) {
        const grid = normalizeGrid((parsed as { rows: string[][] }).rows);
        if (grid) {
          return { source: 'internal', grid };
        }
      }
    } catch {
      // Malformed internal payload — fall through to the other representations.
    }
  }

  const html = data.getData('text/html');
  if (html) {
    const parsed = parseHtmlTableGrid(html);
    if (parsed) {
      const grid = normalizeGrid(parsed);
      if (grid) {
        return { source: 'html', grid };
      }
    }
  }

  const text = data.getData('text/plain');
  if (text && /[\t\n]/.test(text)) {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\n$/, '');
    const grid = normalizeGrid(normalized.split('\n').map((line) => line.split('\t')));
    if (grid) {
      return { source: 'text', grid };
    }
  }

  return null;
}

function readClipboardGrid(event: ClipboardEvent): string[][] | null {
  return readClipboardTable(event)?.grid ?? null;
}

interface PasteBuildResult {
  readonly changes: ChangeSpec[];
  readonly pasteRows: number;
  readonly pasteCols: number;
}

/** Appends blank columns `[existingCount, newColumnCount)` at `row`'s own trailing edge — `null` (declines) when `row` has no real trailing delimiter to anchor on, the same conservative behavior `columnInsertionChangeForRow` already uses for a row it can't safely extend. `pasteRowData`, when given, supplies real content for whichever of those new columns fall inside the pasted rectangle; every other new column is blank. */
function appendColumnsChange(
  row: ReturnType<typeof getNavigableRows>[number],
  existingCount: number,
  newColumnCount: number,
  targetCol: number,
  pasteCols: number,
  pasteRowData: readonly string[] | null
): ChangeSpec | null {
  if (newColumnCount <= existingCount) {
    return null;
  }
  const segments = getRowColumnSegments(row);
  const lastSegment = existingCount > 0 ? segments[existingCount - 1] : undefined;
  const anchor = existingCount === 0 ? undefined : lastSegment?.rightDelimiter?.to;
  if (anchor === undefined) {
    return null;
  }
  let insert = '';
  for (let col = existingCount; col < newColumnCount; col++) {
    const content = pasteRowData && col >= targetCol && col < targetCol + pasteCols ? (pasteRowData[col - targetCol] ?? '') : '';
    insert += padCellContent(content, 0) + '|';
  }
  return { from: anchor, to: anchor, insert };
}

/**
 * Every change needed to paste `grid` starting at `(targetRow, targetCol)`
 * — content replacement for existing cells inside the pasted rectangle,
 * column-count expansion for the header/alignment row and every row inside
 * the rectangle, and brand-new rows when the rectangle extends past the
 * table's current row count. `null` when the table/header can't be
 * resolved, or `grid` is empty.
 */
function buildPasteChanges(state: EditorState, table: TableInfo, targetRow: number, targetCol: number, grid: readonly (readonly string[])[]): PasteBuildResult | null {
  const navigableRows = getNavigableRows(table.node);
  const header = navigableRows[0];
  if (!header) {
    return null;
  }
  if (targetRow < 0 || targetCol < 0 || targetRow > navigableRows.length) {
    return null;
  }

  const pasteRows = grid.length;
  const pasteCols = grid[0]?.length ?? 0;
  if (pasteRows === 0 || pasteCols === 0) {
    return null;
  }

  const currentColumnCount = getRowColumnSegments(header).length;
  const newColumnCount = Math.max(currentColumnCount, targetCol + pasteCols);
  const columnsToAdd = newColumnCount - currentColumnCount;
  const newRowCount = Math.max(navigableRows.length, targetRow + pasteRows);
  const rowsToAdd = newRowCount - navigableRows.length;

  const changes: ChangeSpec[] = [];

  for (let rowIndex = 0; rowIndex < navigableRows.length; rowIndex++) {
    const row = navigableRows[rowIndex]!;
    const inPasteRange = rowIndex >= targetRow && rowIndex < targetRow + pasteRows;
    if (!inPasteRange) {
      continue;
    }
    const pasteRowData = grid[rowIndex - targetRow]!;
    const segments = getRowColumnSegments(row);
    const existingCount = segments.length;

    const replaceUpTo = Math.min(targetCol + pasteCols, existingCount);
    for (let col = targetCol; col < replaceUpTo; col++) {
      const segment = segments[col];
      if (!segment?.leftDelimiter || !segment.rightDelimiter) {
        continue;
      }
      const content = pasteRowData[col - targetCol] ?? '';
      const from = segment.leftDelimiter.to;
      const to = segment.rightDelimiter.from;
      changes.push({ from, to, insert: padCellContent(content, to - from) });
    }

    const appendChange = appendColumnsChange(row, existingCount, newColumnCount, targetCol, pasteCols, pasteRowData);
    if (appendChange) {
      changes.push(appendChange);
    }
  }

  // The header defines the table's column count and is never touched by
  // `tableRectangularNormalization()`'s own auto-padding — if it wasn't
  // already widened by the loop above (only true when the pasted rectangle
  // doesn't include row 0), it must be widened here explicitly, blank
  // (row 0 not being part of the paste means it never gets real content).
  if (columnsToAdd > 0 && targetRow > 0) {
    const headerAppend = appendColumnsChange(header, currentColumnCount, newColumnCount, targetCol, 0, null);
    if (headerAppend) {
      changes.push(headerAppend);
    }
  }

  if (columnsToAdd > 0) {
    const alignRow = header.nextSibling;
    if (alignRow && isAlignmentRow(alignRow)) {
      const cells = splitPipeRowCells(state.sliceDoc(alignRow.from, alignRow.to));
      const next = [...cells, ...(Array(columnsToAdd).fill('---') as string[])];
      changes.push({ from: alignRow.from, to: alignRow.to, insert: '| ' + next.join(' | ') + ' |' });
    }
  }

  if (rowsToAdd > 0) {
    const lastRow = navigableRows[navigableRows.length - 1]!;
    const insertPos = insertRowAfterPosition(lastRow);
    if (insertPos === null) {
      return null;
    }
    const newRowTexts: string[] = [];
    for (let i = 0; i < rowsToAdd; i++) {
      const newRowIndex = navigableRows.length + i;
      const pasteRowData = grid[newRowIndex - targetRow]!;
      const cells: string[] = [];
      for (let col = 0; col < newColumnCount; col++) {
        cells.push(col >= targetCol && col < targetCol + pasteCols ? (pasteRowData[col - targetCol] ?? '') : '');
      }
      newRowTexts.push('|' + cells.map((c) => padCellContent(c, 0) + '|').join(''));
    }
    changes.push({ from: insertPos, to: insertPos, insert: '\n' + newRowTexts.join('\n') });
  }

  return { changes, pasteRows, pasteCols };
}

/** `controller`/`deactivateCell` are only ever non-null/true together — the active-cell path (`tableCellPaste`) passes both, the range-selection path (`tablePaste`) passes neither, per each caller's own doc comment. */
function pasteGridIntoTable(
  view: EditorView,
  controller: TableActiveCellController | null,
  target: PasteTarget,
  grid: readonly (readonly string[])[],
  deactivateCell: boolean
): boolean {
  const table = findAllTables(view.state).find((t) => t.from === target.tableFrom);
  if (!table) {
    return false;
  }
  const built = buildPasteChanges(view.state, table, target.row, target.col, grid);
  if (!built) {
    return false;
  }
  const { changes, pasteRows, pasteCols } = built;

  if (deactivateCell) {
    controller?.deactivate();
  }

  const changeSet = view.state.changes(changes);
  const nextSelection: TableSelection = {
    kind: 'range',
    tableFrom: target.tableFrom,
    anchor: { row: target.row, col: target.col },
    head: { row: target.row + pasteRows - 1, col: target.col + pasteCols - 1 },
  };
  view.dispatch({
    changes,
    selection: view.state.selection.map(changeSet),
    effects: deactivateCell ? [tableActiveCellChanged.of(null), tableSelectionChanged.of(nextSelection)] : [tableSelectionChanged.of(nextSelection)],
    scrollIntoView: true,
  });

  if (deactivateCell) {
    // The nested cell editor's own DOM was just removed — restore focus to
    // root, the same fix already established at every other active-cell →
    // `TableSelection` transition (`tableHandleOverlay.ts`,
    // `tableCellRangeSelection.ts`).
    view.focus();
  }
  return true;
}

/**
 * `EditorView.domEventHandlers({paste})` on the ROOT view — handles only
 * the `range`-`TableSelection` target. **Deliberately root-only, and
 * deliberately never also checks for an active cell here**, unlike an
 * earlier version of this module: confirmed directly against the installed
 * `@codemirror/view` source (`handleEvent`/`runHandlers` in `domobserver.js`,
 * `handlers.paste` in `domtooltip`-adjacent `paste`/clipboard handling) that
 * when a cell is actively being edited, the native `paste` event's real
 * `target` is the *nested* `EditorView`'s own `contentDOM` — a structurally
 * separate view with its own `handleEvent` listener on that same DOM node.
 * CM6's own unconditional base `handlers.paste` (every `EditorView` has one,
 * regardless of extensions) always calls `event.preventDefault()` the
 * moment it sees `event.clipboardData` at all, *before* the event finishes
 * bubbling — and root's own `runHandlers` loop bails out the instant it
 * sees `event.defaultPrevented`, *before trying any handler, including this
 * one*. So a root-only registration can never fire for an active-cell
 * paste in the real app, even though it bubbles there structurally — this
 * was verified live (not assumed) against a running instance of this
 * editor. `tableCellPaste()` below is the nested-view-side counterpart that
 * actually reaches the active-cell case, the same "reach root imperatively
 * via a `getRootView` closure, because keymaps/DOM listeners don't merge
 * across separate `EditorView` instances" shape `tableCellNavigation()`
 * already established for the identical class of problem.
 *
 * A `range` `TableSelection` never coexists with an active cell (mutually
 * exclusive per `tableSelectionField`'s own semantics), and no nested view
 * is mounted/focused while one is active — root's own `contentDOM` is the
 * paste event's genuine, direct target there, so this handler needs no
 * nested counterpart for that case.
 */
export function tablePaste(): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const selection = view.state.field(tableSelectionField, false) ?? null;
      if (!selection || selection.kind !== 'range') {
        return false;
      }

      const grid = readClipboardGrid(event);
      if (!grid) {
        return false;
      }

      const target: PasteTarget = {
        tableFrom: selection.tableFrom,
        row: Math.min(selection.anchor.row, selection.head.row),
        col: Math.min(selection.anchor.col, selection.head.col),
      };

      // No controller/deactivation involved — see this function's own top
      // doc comment for why an active cell can never be the context here.
      return pasteGridIntoTable(view, null, target, grid, false);
    },
  });
}

/**
 * The active-cell counterpart — installed on the NESTED cell editor's own
 * extensions (`TableActiveCellController.setNestedExtensions`, alongside
 * `tableCellNavigation()`), not root's, per this module's own `tablePaste()`
 * doc comment. Reaches back into the root document/controller exactly the
 * way `tableCellNavigation()` already does: a `getRootView` closure plus
 * the same controller instance, both supplied by `MarkdownEditor.tsx` at
 * construction — never a DOM/event-based hookup, since a nested view's own
 * `domEventHandlers` config is entirely separate from root's.
 */
export function tableCellPaste(getRootView: () => EditorView, controller: TableActiveCellController): Extension {
  return EditorView.domEventHandlers({
    paste(event) {
      const rootView = getRootView();
      const target = resolveActiveCellTarget(rootView, controller);
      if (!target) {
        return false;
      }

      const grid = readClipboardGrid(event);
      if (!grid) {
        return false;
      }

      return pasteGridIntoTable(rootView, controller, target, grid, true);
    },
  });
}
