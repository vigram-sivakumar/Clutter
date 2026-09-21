// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { history, undo, undoDepth } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { findAllTables } from './tableGeometry';
import { CLUTTER_TABLE_RANGE_MIME, tableRangeClipboard } from './tableRangeClipboard';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { tableSelectionDeletionHistory } from './tableSelectionDeletion';

/** jsdom doesn't implement the real `DataTransfer`/Clipboard API at all — a minimal stand-in with the same `setData`/`getData`/`clearData` surface this module actually calls. */
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

function dispatchClipboardEvent(view: EditorView, type: 'copy' | 'cut'): MockClipboardEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as MockClipboardEvent;
  event.clipboardData = new MockDataTransfer();
  view.contentDOM.dispatchEvent(event);
  return event;
}

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

function mountRootView(doc: string): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [markdownLanguageExtension(), tableSelectionField, tableSelectionDeletionHistory(), tableRangeClipboard(), history()],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
  mountedViews.push(view);
  return view;
}

function selectRange(view: EditorView, anchor: { row: number; col: number }, head: { row: number; col: number }): void {
  const table = findAllTables(view.state)[0]!;
  const range: TableSelection = { kind: 'range', tableFrom: table.from, anchor, head };
  view.dispatch({ effects: [tableSelectionChanged.of(range)] });
}

function selection(view: EditorView): TableSelection | null {
  return view.state.field(tableSelectionField);
}

const TABLE = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | Delhi |\n| Alex | Engineer | Tokyo |\n| Sam | PM | Oslo |';

describe('tableRangeClipboard — Copy', () => {
  it('copies a single (1x1) cell as plain text', () => {
    const view = mountRootView(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 0 }); // "Vik"

    const event = dispatchClipboardEvent(view, 'copy');

    expect(event.clipboardData.getData('text/plain')).toBe('Vik');
  });

  it('copies a multi-row/multi-column range as TSV (rows \\n-separated, cells \\t-separated)', () => {
    const view = mountRootView(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 2, col: 2 }); // Vik..Tokyo block

    const event = dispatchClipboardEvent(view, 'copy');

    expect(event.clipboardData.getData('text/plain')).toBe('Vik\tDesigner\tDelhi\nAlex\tEngineer\tTokyo');
  });

  it('copies empty cells as empty TSV fields', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| Vik |  |\n| Alex | Engineer |';
    const view = mountRootView(doc);
    selectRange(view, { row: 1, col: 0 }, { row: 2, col: 1 });

    const event = dispatchClipboardEvent(view, 'copy');

    expect(event.clipboardData.getData('text/plain')).toBe('Vik\t\nAlex\tEngineer');
  });

  it('preserves raw Markdown formatting inside cells for plain-text/internal copy (not flattened)', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| **Vik** | *Designer* |';
    const view = mountRootView(doc);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 });

    const event = dispatchClipboardEvent(view, 'copy');

    expect(event.clipboardData.getData('text/plain')).toBe('**Vik**\t*Designer*');
  });

  it('can copy a range that includes header cells', () => {
    const view = mountRootView(TABLE);
    selectRange(view, { row: 0, col: 0 }, { row: 1, col: 1 }); // header + first data row

    const event = dispatchClipboardEvent(view, 'copy');

    expect(event.clipboardData.getData('text/plain')).toBe('Name\tRole\nVik\tDesigner');
  });

  it('copies a range from a ragged source row — the missing cell copies as an empty field', () => {
    const doc = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | Delhi |\n| Alex | Engineer |';
    const view = mountRootView(doc);
    selectRange(view, { row: 2, col: 0 }, { row: 2, col: 2 }); // the ragged "Alex" row

    const event = dispatchClipboardEvent(view, 'copy');

    expect(event.clipboardData.getData('text/plain')).toBe('Alex\tEngineer\t');
  });

  it('does not alter the document', () => {
    const view = mountRootView(TABLE);
    const before = view.state.doc.toString();
    selectRange(view, { row: 1, col: 0 }, { row: 2, col: 2 });

    dispatchClipboardEvent(view, 'copy');

    expect(view.state.doc.toString()).toBe(before);
  });

  it('does not alter the TableSelection', () => {
    const view = mountRootView(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 2, col: 2 });
    const before = selection(view);

    dispatchClipboardEvent(view, 'copy');

    expect(selection(view)).toEqual(before);
  });

  it('does not activate a nested editor / cell', () => {
    const view = mountRootView(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 2, col: 2 });

    dispatchClipboardEvent(view, 'copy');

    // No controller is even wired in this test harness (Copy has no
    // business touching cell activation at all) — the strongest available
    // assertion here is that the selection kind is still 'range', which a
    // stray activation would have cleared (`tableSelectionField`'s own
    // mutual-exclusion with `tableActiveCellChanged`).
    expect(selection(view)?.kind).toBe('range');
  });
});

describe('tableRangeClipboard — HTML and internal MIME representations', () => {
  it('provides an HTML <table> representation, not the surrounding Markdown table', () => {
    const view = mountRootView(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 });

    const event = dispatchClipboardEvent(view, 'copy');
    const html = event.clipboardData.getData('text/html');

    expect(html).toContain('<table>');
    expect(html).toContain('<td>Vik</td>');
    expect(html).toContain('<td>Designer</td>');
    expect(html).not.toContain('| Name |');
    expect(html).not.toContain('---');
  });

  it('renders Markdown formatting to real HTML in the html representation', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| **Vik** | Role |';
    const view = mountRootView(doc);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 0 });

    const event = dispatchClipboardEvent(view, 'copy');

    expect(event.clipboardData.getData('text/html')).toContain('<strong>Vik</strong>');
  });

  it('provides a private internal MIME payload preserving raw Markdown, consistent with TSV', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| **Vik** | Designer |';
    const view = mountRootView(doc);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 });

    const event = dispatchClipboardEvent(view, 'copy');
    const internal = JSON.parse(event.clipboardData.getData(CLUTTER_TABLE_RANGE_MIME));
    const tsv = event.clipboardData.getData('text/plain');

    expect(internal.rows).toEqual([['**Vik**', 'Designer']]);
    expect(tsv).toBe('**Vik**\tDesigner');
  });
});

describe('tableRangeClipboard — Cut', () => {
  it('clears exactly the selected rectangle', () => {
    const view = mountRootView(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 }); // Vik, Designer

    dispatchClipboardEvent(view, 'cut');

    expect(view.state.doc.toString()).not.toContain('Vik');
    expect(view.state.doc.toString()).not.toContain('Designer');
    expect(view.state.doc.toString()).toContain('Delhi'); // untouched, outside the selection
  });

  it('copies using exactly the same clipboard representation as Copy', () => {
    const view = mountRootView(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 2, col: 2 });

    const event = dispatchClipboardEvent(view, 'cut');

    expect(event.clipboardData.getData('text/plain')).toBe('Vik\tDesigner\tDelhi\nAlex\tEngineer\tTokyo');
  });

  it('preserves the exact same range selection', () => {
    const view = mountRootView(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 });
    const before = selection(view);

    dispatchClipboardEvent(view, 'cut');

    expect(selection(view)).toEqual(before);
  });

  it('preserves table structure (row/column count, header, alignment)', () => {
    const view = mountRootView(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 2, col: 2 });

    dispatchClipboardEvent(view, 'cut');

    const table = findAllTables(view.state)[0]!;
    const text = view.state.sliceDoc(table.from, table.to);
    expect(text).toContain('| Name | Role | City |');
    expect(text).toContain('| --- | --- | --- |');
    expect(text.split('\n')).toHaveLength(5); // header + delim + 3 body rows, all still present
  });

  it('preserves already-empty cells (clearing an empty cell is a no-op, not an error)', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| Vik |  |';
    const view = mountRootView(doc);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 });

    expect(() => dispatchClipboardEvent(view, 'cut')).not.toThrow();

    const table = findAllTables(view.state)[0]!;
    const lastLine = view.state.sliceDoc(table.from, table.to).split('\n').at(-1)!;
    // Both cells now read as empty content — "Vik" genuinely cleared,
    // "Role" already blank and left as a true no-op (exact padding width
    // is `blankCellChange`'s own concern, not asserted here).
    expect(lastLine.split('|').slice(1, -1).map((s) => s.trim())).toEqual(['', '']);
  });

  it('is exactly one undoable operation', () => {
    const view = mountRootView(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 2, col: 2 });

    dispatchClipboardEvent(view, 'cut');

    expect(undoDepth(view.state)).toBe(1);
  });

  it('undo restores the cut contents', () => {
    const view = mountRootView(TABLE);
    const before = view.state.doc.toString();
    selectRange(view, { row: 1, col: 0 }, { row: 2, col: 2 });

    dispatchClipboardEvent(view, 'cut');
    expect(view.state.doc.toString()).not.toBe(before);

    undo(view);

    expect(view.state.doc.toString()).toBe(before);
  });

  it('repeated Cut on an already-cleared (empty) range is safe and keeps the selection', () => {
    const view = mountRootView(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 });
    dispatchClipboardEvent(view, 'cut');
    const afterFirst = selection(view);

    expect(() => dispatchClipboardEvent(view, 'cut')).not.toThrow();

    expect(selection(view)).toEqual(afterFirst);
  });
});

describe('tableRangeClipboard — scoped strictly to an active range selection', () => {
  it('normal text-selection copy is completely unaffected outside a table', () => {
    const view = mountRootView('Some plain text here.');
    view.dispatch({ selection: { anchor: 0, head: 4 } }); // "Some"

    // No TableSelection exists at all — this module declines immediately,
    // leaving CM6's own default copy handling (which this jsdom
    // environment can't fully exercise, since it also relies on real
    // browser DOM-selection/clipboard behavior) untouched.
    const event = new Event('copy', { bubbles: true, cancelable: true }) as Event & { clipboardData?: MockDataTransfer };
    event.clipboardData = new MockDataTransfer();
    const defaultPrevented = !view.contentDOM.dispatchEvent(event);
    expect(defaultPrevented).toBe(false);
    expect(event.clipboardData.getData('text/plain')).toBe('');
  });

  it('normal text-selection cut is completely unaffected outside a table — no document change from this module', () => {
    const view = mountRootView('Some plain text here.');
    view.dispatch({ selection: { anchor: 0, head: 4 } });
    const before = view.state.doc.toString();

    const event = new Event('cut', { bubbles: true, cancelable: true }) as Event & { clipboardData?: MockDataTransfer };
    event.clipboardData = new MockDataTransfer();
    const defaultPrevented = !view.contentDOM.dispatchEvent(event);

    expect(defaultPrevented).toBe(false);
    expect(view.state.doc.toString()).toBe(before);
  });

  it('does not intercept copy for a row-kind TableSelection', () => {
    const view = mountRootView(TABLE);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ effects: [tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 1 })] });

    const event = dispatchClipboardEvent(view, 'copy');

    expect(event.clipboardData.getData('text/plain')).toBe('');
  });

  it('does not intercept cut for a column-kind TableSelection (no document change)', () => {
    const view = mountRootView(TABLE);
    const table = findAllTables(view.state)[0]!;
    const before = view.state.doc.toString();
    view.dispatch({ effects: [tableSelectionChanged.of({ kind: 'column', tableFrom: table.from, columnIndex: 0 })] });

    dispatchClipboardEvent(view, 'cut');

    expect(view.state.doc.toString()).toBe(before);
  });

  it('copy/cut outside any TableSelection at all declines (no clipboard data written)', () => {
    const view = mountRootView(TABLE);

    const event = dispatchClipboardEvent(view, 'copy');

    expect(event.clipboardData.getData('text/plain')).toBe('');
  });
});
