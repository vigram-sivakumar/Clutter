// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { history, undo, undoDepth } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableActiveCellChanged, TableActiveCellController } from './tableActiveCellController';
import { findAllTables } from './tableGeometry';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { tableWidgetDecoration } from './tableWidgetField';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

function mountView(doc: string, extraExtensions: readonly unknown[] = []): EditorView {
  const controller = new TableActiveCellController();
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [markdownLanguageExtension(), tableWidgetDecoration(controller), tableSelectionField, ...(extraExtensions as never[])],
    }),
    parent,
  });
  mountedViews.push(view);
  return view;
}

const TABLE = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | Delhi |\n| Alex | Engineer | Tokyo |';

function tableFrom(view: EditorView): number {
  return findAllTables(view.state)[0]!.from;
}

describe('tableSelectionField — explicit set/clear', () => {
  it('a column selection effect sets kind, tableFrom, and columnIndex', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);

    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 1 }) });

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: from, columnIndex: 1 });
  });

  it('a row selection effect sets kind, tableFrom, and rowIndex', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);

    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: from, rowIndex: 2 }) });

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: from, rowIndex: 2 });
  });

  it('an explicit null effect clears an existing selection', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 0 }) });

    view.dispatch({ effects: tableSelectionChanged.of(null) });

    expect(view.state.field(tableSelectionField)).toBeNull();
  });
});

describe('tableSelectionField — mutual exclusivity with the active cell', () => {
  it('a plain tableActiveCellChanged (cell activation) clears an existing selection', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 0 }) });
    expect(view.state.field(tableSelectionField)).not.toBeNull();

    // Mirrors TableActiveCellController.activate()'s own dispatch shape —
    // just the marker effect, no changes, no tableSelectionChanged.
    view.dispatch({ effects: tableActiveCellChanged.of(null) });

    expect(view.state.field(tableSelectionField)).toBeNull();
  });

  it("a handle click's own dispatch (tableSelectionChanged + tableActiveCellChanged together) is not self-cancelling — the new selection wins", () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);

    // The exact shape tableHandleOverlay.ts's own click handlers dispatch.
    view.dispatch({
      effects: [tableActiveCellChanged.of(null), tableSelectionChanged.of({ kind: 'row', tableFrom: from, rowIndex: 1 })],
    });

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: from, rowIndex: 1 });
  });
});

describe('tableSelectionField — does not touch the document or root selection', () => {
  it('setting a selection does not change the document text', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    const before = view.state.doc.toString();

    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 0 }) });

    expect(view.state.doc.toString()).toBe(before);
  });

  it('setting a selection does not move the root document selection', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    const selectionBefore = view.state.selection.main;

    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 0 }) });

    expect(view.state.selection.main.from).toBe(selectionBefore.from);
    expect(view.state.selection.main.to).toBe(selectionBefore.to);
  });

  it('setting a selection does not enter undo history', () => {
    const view = mountView(TABLE, [history()]);
    const from = tableFrom(view);
    const depthBefore = undoDepth(view.state);

    view.dispatch({ effects: [tableActiveCellChanged.of(null), tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 0 })] });

    expect(undoDepth(view.state)).toBe(depthBefore);
    // Confirm there is nothing for undo() to even act on — dispatching it
    // must not resurrect a previous (nonexistent) document state.
    const docBefore = view.state.doc.toString();
    undo(view);
    expect(view.state.doc.toString()).toBe(docBefore);
  });
});

describe('tableSelectionField — structural remapping', () => {
  it('a selected column survives a row inserted elsewhere in the table (columnIndex unchanged)', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 2 }) });

    // Insert a brand-new row after the first data row (Enter-in-a-cell's
    // own shape — buildEmptyRowText — without needing an active cell).
    const table = findAllTables(view.state)[0]!;
    const firstDataRowEnd = view.state.doc.lineAt(table.from).number; // header line
    const insertLine = view.state.doc.line(firstDataRowEnd + 2); // first data row
    view.dispatch({ changes: { from: insertLine.to, to: insertLine.to, insert: '\n| | | |' } });

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: from, columnIndex: 2 });
  });

  it('a selected column is cleared once the header itself loses that many columns', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 2 }) });

    // Replace the whole table with an equivalent, but 2-column, version —
    // column index 2 (the third column) no longer exists.
    const table = findAllTables(view.state)[0]!;
    const twoColumn = '| Name | Role |\n| --- | --- |\n| Vik | Designer |\n| Alex | Engineer |';
    view.dispatch({ changes: { from: table.from, to: table.to, insert: twoColumn } });

    expect(view.state.field(tableSelectionField)).toBeNull();
  });

  it('a selected column is cleared once its whole table is deleted', () => {
    const view = mountView(`${TABLE}\n\nAfter.`);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 0 }) });

    const table = findAllTables(view.state)[0]!;
    view.dispatch({ changes: { from: table.from, to: table.to, insert: '' } });

    expect(view.state.field(tableSelectionField)).toBeNull();
  });

  it('a selected row shifts to the correct new index when a row is inserted above it', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    // Select the second data row (Alex/Engineer/Tokyo) — rowIndex 2:
    // header=0, "Vik" row=1, "Alex" row=2.
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: from, rowIndex: 2 }) });

    // Insert a new row between the header/delimiter and the "Vik" row —
    // i.e. immediately above the "Vik" row, which is itself above the
    // selected "Alex" row.
    const vikLine = view.state.doc.line(3); // "| Vik | Designer | Delhi |"
    const insertAt = view.state.doc.line(vikLine.number - 1).to; // end of the delimiter row
    view.dispatch({ changes: { from: insertAt, to: insertAt, insert: '\n| | | |' } });

    const newTable = findAllTables(view.state)[0]!;
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: newTable.from, rowIndex: 3 });
  });

  it('a selected row is cleared once that exact row is deleted', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: from, rowIndex: 1 }) }); // "Vik" row

    const vikLine = view.state.doc.line(3);
    // Delete the whole line, including its own leading newline, so the
    // table's remaining rows re-join cleanly.
    view.dispatch({ changes: { from: view.state.doc.line(2).to, to: vikLine.to, insert: '' } });

    expect(view.state.field(tableSelectionField)).toBeNull();
  });

  it('a selected row is cleared once its whole table is deleted', () => {
    const view = mountView(`${TABLE}\n\nAfter.`);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: from, rowIndex: 1 }) });

    const table = findAllTables(view.state)[0]!;
    view.dispatch({ changes: { from: table.from, to: table.to, insert: '' } });

    expect(view.state.field(tableSelectionField)).toBeNull();
  });

  it('an edit entirely before the table shifts tableFrom but preserves the same column selection', () => {
    const view = mountView(`Above.\n\n${TABLE}`);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 1 }) });

    view.dispatch({ changes: { from: 0, to: 0, insert: 'Even more text.\n' } });

    const newTable = findAllTables(view.state)[0]!;
    expect(newTable.from).not.toBe(from);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: newTable.from, columnIndex: 1 });
  });

  it('a non-doc-changing transaction (e.g. an unrelated selection move) leaves the selection untouched', () => {
    const view = mountView(TABLE);
    const from = tableFrom(view);
    view.dispatch({ effects: tableSelectionChanged.of({ kind: 'column', tableFrom: from, columnIndex: 0 }) });

    view.dispatch({ selection: { anchor: 0 } });

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: from, columnIndex: 0 });
  });
});

describe('tableSelectionField — type-level: range must exist but is never produced here', () => {
  it('a hypothetical range value is not something any code path in this milestone constructs', () => {
    // Compile-time check only — asserts the discriminated union accepts a
    // `range` member (this milestone's own "must exist in the type design"
    // requirement) without this milestone needing to implement it.
    const range: TableSelection = { kind: 'range', tableFrom: 0, anchor: { row: 0, col: 0 }, head: { row: 1, col: 1 } };
    expect(range.kind).toBe('range');
  });
});
