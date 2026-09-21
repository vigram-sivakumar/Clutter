// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { history, redo, undo, undoDepth } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { TableActiveCellController } from './tableActiveCellController';
import { findAllTables, getNavigableRows, getRowCellBounds, endOfCellContent, startOfCellContent } from './tableGeometry';
import { CLUTTER_TABLE_RANGE_MIME } from './tableRangeClipboard';
import { tableCellPaste, tablePaste } from './tablePaste';
import { tableRectangularNormalization } from './tableRectangularNormalization';
import { tableRootSelectionSnap } from './tableRootSelectionSnap';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { tableSelectionDeletionHistory } from './tableSelectionDeletion';

class MockDataTransfer {
  private store = new Map<string, string>();
  setData(type: string, value: string): void {
    this.store.set(type, value);
  }
  getData(type: string): string {
    return this.store.get(type) ?? '';
  }
  clearData(): void {
    this.store.clear();
  }
}

type MockClipboardEvent = Event & { clipboardData: MockDataTransfer };

function dispatchPasteOn(target: EventTarget, populate: (data: MockDataTransfer) => void): MockClipboardEvent {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as MockClipboardEvent;
  event.clipboardData = new MockDataTransfer();
  populate(event.clipboardData);
  target.dispatchEvent(event);
  return event;
}

function internalPayload(rows: readonly (readonly string[])[]): string {
  return JSON.stringify({ kind: 'clutter-table-range', rows });
}

function tsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.join('\t')).join('\n');
}

function htmlTable(rows: readonly (readonly string[])[]): string {
  return `<table>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
}

const mountedViews: EditorView[] = [];
const mountedContainers: HTMLElement[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
  for (const el of mountedContainers.splice(0)) {
    el.remove();
  }
});

/**
 * `tablePaste()` (root-only, handles a `range` `TableSelection`) and
 * `tableCellPaste()` (nested-only, handles the active-cell target) are
 * registered exactly like production (`buildEditorExtensions.ts`,
 * `MarkdownEditor.tsx`) — root's own extensions for the former,
 * `controller.setNestedExtensions([...])` for the latter — since a real
 * `paste` event's target genuinely differs between the two cases (see
 * `tablePaste()`'s own doc comment for why a root-only registration can
 * never see an active-cell paste in the real app).
 */
function mountRootView(doc: string, controller: TableActiveCellController): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        markdownLanguageExtension(),
        tableSelectionField,
        tableSelectionDeletionHistory(),
        tablePaste(),
        history(),
        tableRootSelectionSnap(),
        tableRectangularNormalization(),
      ],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
  mountedViews.push(view);
  controller.setNestedExtensions([tableCellPaste(() => view, controller)]);
  return view;
}

function makeContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  mountedContainers.push(container);
  return container;
}

/** Activates the nested cell editor for `(rowIndex, colIndex)` — the "active cell, no TableSelection" paste target. */
function activateCell(view: EditorView, controller: TableActiveCellController, rowIndex: number, colIndex: number): void {
  const table = findAllTables(view.state)[0]!;
  const row = getNavigableRows(table.node)[rowIndex]!;
  const bounds = getRowCellBounds(row)[colIndex]!;
  const from = startOfCellContent(view.state, bounds);
  const to = endOfCellContent(view.state, bounds);
  controller.activate(view, makeContainer(), from, to, from);
}

/** A `paste` on the active cell's own nested editor — the real event target in production (see `mountRootView`'s own doc comment). */
function dispatchPasteOnActiveCell(controller: TableActiveCellController, populate: (data: MockDataTransfer) => void): MockClipboardEvent {
  return dispatchPasteOn(controller.nestedView!.contentDOM, populate);
}

function selectRange(view: EditorView, anchor: { row: number; col: number }, head: { row: number; col: number }): void {
  const table = findAllTables(view.state)[0]!;
  const range: TableSelection = { kind: 'range', tableFrom: table.from, anchor, head };
  view.dispatch({ effects: [tableSelectionChanged.of(range)] });
}

function selection(view: EditorView): TableSelection | null {
  return view.state.field(tableSelectionField);
}

function cellText(view: EditorView, rowIndex: number, colIndex: number): string {
  const table = findAllTables(view.state)[0]!;
  const row = getNavigableRows(table.node)[rowIndex]!;
  const bounds = getRowCellBounds(row)[colIndex];
  if (!bounds) {
    return '';
  }
  return view.state.sliceDoc(startOfCellContent(view.state, bounds), endOfCellContent(view.state, bounds));
}

const TABLE = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | Delhi |\n| Alex | Engineer | Tokyo |\n| Sam | PM | Oslo |';

describe('tablePaste — active-cell paste', () => {
  it('1x1 paste replaces exactly the active cell', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    activateCell(view, controller, 2, 0); // "Alex"

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['Sam']])));

    expect(cellText(view, 2, 0)).toBe('Sam');
    expect(cellText(view, 2, 1)).toBe('Engineer');
  });

  it('1x2 paste replaces the active cell and its right neighbor', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    activateCell(view, controller, 2, 0); // "Alex"

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['Sam', 'UX']])));

    expect(cellText(view, 2, 0)).toBe('Sam');
    expect(cellText(view, 2, 1)).toBe('UX');
    expect(cellText(view, 2, 2)).toBe('Tokyo'); // untouched
  });

  it('2x2 paste populates a rectangle starting at the active cell', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    activateCell(view, controller, 1, 0); // "Vik"

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['A', 'B'], ['C', 'D']])));

    expect(cellText(view, 1, 0)).toBe('A');
    expect(cellText(view, 1, 1)).toBe('B');
    expect(cellText(view, 2, 0)).toBe('C');
    expect(cellText(view, 2, 1)).toBe('D');
  });

  it('multi-row/multi-column paste populates the exact rectangle, no transposition, no skipped cells', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    activateCell(view, controller, 1, 0);

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['Sam', 'UX', 'Mumbai'], ['John', 'PM', 'Delhi']])));

    expect(cellText(view, 1, 0)).toBe('Sam');
    expect(cellText(view, 1, 1)).toBe('UX');
    expect(cellText(view, 1, 2)).toBe('Mumbai');
    expect(cellText(view, 2, 0)).toBe('John');
    expect(cellText(view, 2, 1)).toBe('PM');
    expect(cellText(view, 2, 2)).toBe('Delhi');
  });

  it('smaller paste leaves surrounding cells unchanged', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    activateCell(view, controller, 2, 0); // "Alex | Engineer | Tokyo"

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['Sam', 'UX']])));

    expect(cellText(view, 2, 2)).toBe('Tokyo');
    expect(cellText(view, 3, 0)).toBe('Sam'); // row below untouched
  });

  it('larger paste expands columns', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView('| Name | Role |\n| --- | --- |\n| Alex | Engineer |', controller);
    activateCell(view, controller, 1, 0);

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['Sam', 'UX', 'Mumbai']])));

    expect(cellText(view, 0, 2)).toBe(''); // header widened, blank
    expect(cellText(view, 1, 0)).toBe('Sam');
    expect(cellText(view, 1, 1)).toBe('UX');
    expect(cellText(view, 1, 2)).toBe('Mumbai');
  });

  it('larger paste expands rows', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView('| Name | Role |\n| --- | --- |\n| Alex | Engineer |', controller);
    activateCell(view, controller, 1, 0);

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['Sam', 'UX'], ['John', 'PM']])));

    expect(cellText(view, 1, 0)).toBe('Sam');
    expect(cellText(view, 2, 0)).toBe('John');
    expect(cellText(view, 2, 1)).toBe('PM');
  });

  it('larger paste expands both rows and columns', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView('| Name | Role |\n| --- | --- |\n| Alex | Engineer |', controller);
    activateCell(view, controller, 1, 0);

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['Sam', 'UX', 'Mumbai'], ['John', 'PM', 'Delhi']])));

    const table = findAllTables(view.state)[0]!;
    expect(getNavigableRows(table.node)).toHaveLength(3);
    expect(cellText(view, 2, 2)).toBe('Delhi');
  });

  it('empty clipboard cells clear the corresponding table cells', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    activateCell(view, controller, 1, 0);

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['', 'X']])));

    expect(cellText(view, 1, 0)).toBe('');
    expect(cellText(view, 1, 1)).toBe('X');
  });

  it('preserves Markdown formatting inside pasted cells', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    activateCell(view, controller, 1, 0);

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['**Bold**']])));

    expect(cellText(view, 1, 0)).toBe('**Bold**');
  });
});

describe('tablePaste — range-selection paste', () => {
  it('2x2 selection + 1x2 paste: only the top row of the selection changes, selection becomes 1x2', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    selectRange(view, { row: 1, col: 0 }, { row: 2, col: 1 }); // Vik/Designer, Alex/Engineer

    dispatchPasteOn(view.contentDOM, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['X', 'Y']])));

    expect(cellText(view, 1, 0)).toBe('X');
    expect(cellText(view, 1, 1)).toBe('Y');
    expect(cellText(view, 2, 0)).toBe('Alex'); // outside the pasted rectangle, unchanged
    expect(cellText(view, 2, 1)).toBe('Engineer');
    expect(selection(view)).toEqual({ kind: 'range', tableFrom: expect.any(Number), anchor: { row: 1, col: 0 }, head: { row: 1, col: 1 } });
  });

  it('2x2 selection + 2x2 paste: selection remains 2x2', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    selectRange(view, { row: 1, col: 0 }, { row: 2, col: 1 });

    dispatchPasteOn(view.contentDOM, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['A', 'B'], ['C', 'D']])));

    expect(selection(view)).toMatchObject({ kind: 'range', anchor: { row: 1, col: 0 }, head: { row: 2, col: 1 } });
  });

  it('1x2 selection + 2x3 paste: table/columns expand, selection becomes 2x3', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 });

    dispatchPasteOn(view.contentDOM, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['A', 'B', 'C'], ['D', 'E', 'F']])));

    expect(selection(view)).toMatchObject({ kind: 'range', anchor: { row: 1, col: 0 }, head: { row: 2, col: 2 } });
    expect(cellText(view, 2, 2)).toBe('F');
  });

  it('multi-row paste selection dimensions are exact', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 0 });

    dispatchPasteOn(view.contentDOM, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['A'], ['B'], ['C']])));

    expect(selection(view)).toMatchObject({ anchor: { row: 1, col: 0 }, head: { row: 3, col: 0 } });
  });

  it('starts at the range top-left regardless of anchor/head drag direction', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    selectRange(view, { row: 2, col: 1 }, { row: 1, col: 0 }); // dragged bottom-right to top-left

    dispatchPasteOn(view.contentDOM, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['X']])));

    expect(cellText(view, 1, 0)).toBe('X');
  });
});

describe('tablePaste — safety and structure', () => {
  it('preserves header semantics and alignment when widening', () => {
    const doc = '| Name | Role |\n| :--- | ---: |\n| Alex | Engineer |';
    const controller = new TableActiveCellController();
    const view = mountRootView(doc, controller);
    activateCell(view, controller, 1, 0);

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['Sam', 'UX', 'Mumbai']])));

    const table = findAllTables(view.state)[0]!;
    const alignRow = getNavigableRows(table.node)[0]!.nextSibling!;
    expect(view.state.sliceDoc(alignRow.from, alignRow.to)).toBe('| :--- | ---: | --- |');
  });

  it('preserves escaped pipes already present in copied Markdown content', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    activateCell(view, controller, 1, 0);

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['A \\| B']])));

    expect(cellText(view, 1, 0)).toBe('A \\| B');
  });

  it('maintains the rectangular invariant — no ragged rows after expansion', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView('| Name | Role |\n| --- | --- |\n| Alex | Engineer |\n| Sam | PM |', controller);
    activateCell(view, controller, 1, 0); // row 1 only

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['A', 'B', 'C']])));

    const table = findAllTables(view.state)[0]!;
    const header = getNavigableRows(table.node)[0]!;
    const headerCount = getRowCellBounds(header).length;
    for (const row of getNavigableRows(table.node)) {
      expect(getRowCellBounds(row)).toHaveLength(headerCount);
    }
  });

  it('is exactly one undoable operation', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    activateCell(view, controller, 1, 0);

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['A', 'B'], ['C', 'D']])));

    expect(undoDepth(view.state)).toBe(1);
  });

  it('undo restores the document in one step', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    const before = view.state.doc.toString();
    activateCell(view, controller, 1, 0);

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['A', 'B']])));
    expect(view.state.doc.toString()).not.toBe(before);

    undo(view);

    expect(view.state.doc.toString()).toBe(before);
  });

  it('redo reapplies the paste', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    activateCell(view, controller, 1, 0);

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['A', 'B']])));
    const afterPaste = view.state.doc.toString();
    undo(view);
    redo(view);

    expect(view.state.doc.toString()).toBe(afterPaste);
  });

  it('root selection never ends inside the table widget after an active-cell paste', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    activateCell(view, controller, 1, 0);

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['A', 'B']])));

    // `table.to` itself is a safe landing spot only when nothing follows
    // the table in the document at all (`tableRootSelectionSnap`'s own
    // documented exemption) — true here, since this fixture's table is the
    // whole document. The invariant being verified is "never strictly
    // inside `[table.from, table.to)`".
    const table = findAllTables(view.state)[0]!;
    const main = view.state.selection.main;
    expect(main.from < table.from || main.from >= table.to).toBe(true);
  });

  it('deactivates the nested cell editor after an active-cell paste', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    activateCell(view, controller, 1, 0);
    expect(controller.activeAnchor).not.toBeNull();

    dispatchPasteOnActiveCell(controller, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['A']])));

    expect(controller.activeAnchor).toBeNull();
  });

  it('normal (non-table) paste is unaffected — this module never intercepts it, so CM6 pastes normally', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView('Some plain text.', controller);
    view.dispatch({ selection: { anchor: 4 } });

    dispatchPasteOn(view.contentDOM, (d) => d.setData('text/plain', 'INSERTED'));

    expect(view.state.doc.toString()).toContain('INSERTED');
  });

  it('non-tabular plain text pasted into an active cell falls through to normal paste (declines interception)', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    activateCell(view, controller, 1, 0);

    dispatchPasteOnActiveCell(controller, (d) => d.setData('text/plain', 'Nairobi'));

    // This module's own table-paste logic declined — the plain text was
    // inserted by the nested editor's own ordinary default paste handling
    // instead (at its current caret, the start of "Vik"), then forwarded to
    // root like any other nested-editor edit. Not replaced/cleared, not a
    // table-shaped mutation — genuinely normal single-value paste behavior.
    expect(cellText(view, 1, 0)).toBe('NairobiVik');
  });

  it('declines when there is no active cell and no range selection', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    view.dispatch({ selection: { anchor: view.state.doc.length } });

    dispatchPasteOn(view.contentDOM, (d) => d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['X']])));

    expect(cellText(view, 1, 0)).toBe('Vik');
  });
});

describe('tablePaste — clipboard format priority', () => {
  it('uses the internal Clutter payload when present', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    activateCell(view, controller, 1, 0);

    dispatchPasteOnActiveCell(controller, (d) => {
      d.setData('text/plain', 'plain-fallback');
      d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['**Internal**']]));
    });

    expect(cellText(view, 1, 0)).toBe('**Internal**');
  });

  it('treats tab-separated text/plain as tabular', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    activateCell(view, controller, 1, 0);

    dispatchPasteOnActiveCell(controller, (d) => d.setData('text/plain', tsv([['Sam', 'UX', 'Pune']])));

    expect(cellText(view, 1, 0)).toBe('Sam');
    expect(cellText(view, 1, 1)).toBe('UX');
    expect(cellText(view, 1, 2)).toBe('Pune');
  });

  it('parses an HTML <table> when no internal payload is present', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    activateCell(view, controller, 1, 0);

    dispatchPasteOnActiveCell(controller, (d) => {
      d.setData('text/plain', 'Sam\tUX');
      d.setData('text/html', htmlTable([['FromHtml', 'Y']]));
    });

    expect(cellText(view, 1, 0)).toBe('FromHtml');
    expect(cellText(view, 1, 1)).toBe('Y');
  });

  it('falls back to text/plain when text/html has no <table>', () => {
    const controller = new TableActiveCellController();
    const view = mountRootView(TABLE, controller);
    activateCell(view, controller, 1, 0);

    dispatchPasteOnActiveCell(controller, (d) => {
      d.setData('text/html', '<div>not a table</div>');
      d.setData('text/plain', tsv([['Sam', 'UX']]));
    });

    expect(cellText(view, 1, 0)).toBe('Sam');
    expect(cellText(view, 1, 1)).toBe('UX');
  });
});
