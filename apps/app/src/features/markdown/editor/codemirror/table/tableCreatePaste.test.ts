// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { history, redo, undo, undoDepth } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableActivationNormalization } from './tableActivationNormalization';
import { tableCreatePaste } from './tableCreatePaste';
import { findAllTables, getNavigableRows, getRowCellBounds, endOfCellContent, startOfCellContent } from './tableGeometry';
import { CLUTTER_TABLE_RANGE_MIME } from './tableRangeClipboard';
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

function dispatchPaste(view: EditorView, populate: (data: MockDataTransfer) => void): MockClipboardEvent {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as MockClipboardEvent;
  event.clipboardData = new MockDataTransfer();
  populate(event.clipboardData);
  view.contentDOM.dispatchEvent(event);
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

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

/** Full production filter stack this feature depends on — `tableActivationNormalization()`'s terminal-table trailing-newline guarantee and `tableRootSelectionSnap()`'s caret-safety invariant, both relied on rather than reimplemented (see `tableCreatePaste.ts`'s own doc comment). */
function mountRootView(doc: string, cursor: number): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        markdownLanguageExtension(),
        tableSelectionField,
        tableSelectionDeletionHistory(),
        tableCreatePaste(),
        history(),
        tableRootSelectionSnap(),
        tableActivationNormalization(),
        tableRectangularNormalization(),
      ],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
  mountedViews.push(view);
  return view;
}

function cellText(view: EditorView, tableIndex: number, rowIndex: number, colIndex: number): string {
  const table = findAllTables(view.state)[tableIndex]!;
  const row = getNavigableRows(table.node)[rowIndex]!;
  const bounds = getRowCellBounds(row)[colIndex];
  if (!bounds) {
    return '';
  }
  return view.state.sliceDoc(startOfCellContent(view.state, bounds), endOfCellContent(view.state, bounds));
}

describe('tableCreatePaste — TSV/plain text', () => {
  /**
   * Single-row paste — i.e. header/separator content with no data row at
   * all — deliberately gets a seeded blank body row, same as any other
   * freshly-activated table with no data yet: this module builds only the
   * header + delimiter text and dispatches an ordinary transaction, and
   * the already-installed `tableActivationNormalization()` reacts to it
   * exactly as it would to the same shape typed by hand (its own
   * `hasExistingDataRow` check finds no data row, since this transaction's
   * own insert doesn't contain one either). A paste that includes at least
   * one real data row (the next test) is a different shape to that same
   * check — `hasExistingDataRow` is already `true` there — and gets no
   * seeded row, matching the corrected product decision here.
   */
  it('a single pasted row with no data row gets one seeded blank body row', () => {
    const view = mountRootView('', 0);

    dispatchPaste(view, (d) => d.setData('text/plain', tsv([['Sam', 'UX', 'Pune']])));

    expect(findAllTables(view.state)).toHaveLength(1);
    expect(cellText(view, 0, 0, 0)).toBe('Sam');
    expect(cellText(view, 0, 0, 1)).toBe('UX');
    expect(cellText(view, 0, 0, 2)).toBe('Pune');
    const table = findAllTables(view.state)[0]!;
    const navigableRows = getNavigableRows(table.node);
    expect(navigableRows).toHaveLength(2); // header + one seeded blank row
    expect(cellText(view, 0, 1, 0)).toBe('');
  });

  it('a pasted header plus exactly one data row produces exactly those two rows, no extra blank row', () => {
    const view = mountRootView('', 0);

    dispatchPaste(view, (d) => d.setData('text/plain', tsv([['Name', 'Role', 'City'], ['Sam', 'UX', 'Pune']])));

    const table = findAllTables(view.state)[0]!;
    expect(getNavigableRows(table.node)).toHaveLength(2);
    expect(cellText(view, 0, 0, 0)).toBe('Name');
    expect(cellText(view, 0, 1, 0)).toBe('Sam');
    expect(cellText(view, 0, 1, 1)).toBe('UX');
    expect(cellText(view, 0, 1, 2)).toBe('Pune');
  });

  it('multi-row TSV becomes a multi-row table, no extra blank row', () => {
    const view = mountRootView('', 0);

    dispatchPaste(view, (d) => d.setData('text/plain', tsv([['Sam', 'UX', 'Pune'], ['Alex', 'Engineer', 'Delhi']])));

    expect(cellText(view, 0, 0, 0)).toBe('Sam');
    expect(cellText(view, 0, 1, 0)).toBe('Alex');
    expect(cellText(view, 0, 1, 1)).toBe('Engineer');
    expect(cellText(view, 0, 1, 2)).toBe('Delhi');
    const table = findAllTables(view.state)[0]!;
    expect(getNavigableRows(table.node)).toHaveLength(2);
  });

  it('preserves empty cells', () => {
    const view = mountRootView('', 0);

    dispatchPaste(view, (d) => d.setData('text/plain', 'Sam\tUX\t\tPune'));

    expect(cellText(view, 0, 0, 0)).toBe('Sam');
    expect(cellText(view, 0, 0, 1)).toBe('UX');
    expect(cellText(view, 0, 0, 2)).toBe('');
    expect(cellText(view, 0, 0, 3)).toBe('Pune');
  });

  it('uneven rows are normalized into a rectangular table', () => {
    const view = mountRootView('', 0);

    dispatchPaste(view, (d) => d.setData('text/plain', tsv([['Sam', 'UX', 'Pune'], ['Alex', 'Engineer']])));

    const table = findAllTables(view.state)[0]!;
    const header = getNavigableRows(table.node)[0]!;
    const headerCount = getRowCellBounds(header).length;
    expect(headerCount).toBe(3);
    for (const row of getNavigableRows(table.node)) {
      expect(getRowCellBounds(row)).toHaveLength(headerCount);
    }
    expect(cellText(view, 0, 1, 2)).toBe('');
  });

  it('creates a table with multiple columns', () => {
    const view = mountRootView('', 0);

    dispatchPaste(view, (d) => d.setData('text/plain', tsv([['Sam', 'UX', 'UX', 'UX', 'Pune']])));

    const table = findAllTables(view.state)[0]!;
    expect(getRowCellBounds(getNavigableRows(table.node)[0]!)).toHaveLength(5);
  });

  it('escapes a literal pipe so it never becomes a structural delimiter', () => {
    const view = mountRootView('', 0);

    dispatchPaste(view, (d) => d.setData('text/plain', tsv([['Sam', 'UX | Product', 'Pune']])));

    // The generated source must be valid GFM: exactly 3 logical columns.
    const table = findAllTables(view.state)[0]!;
    expect(getRowCellBounds(getNavigableRows(table.node)[0]!)).toHaveLength(3);
    expect(cellText(view, 0, 0, 1)).toBe('UX \\| Product');
  });

  it('a single plain-text cell (no tabs, one line) is not turned into a table', () => {
    const view = mountRootView('', 0);

    dispatchPaste(view, (d) => d.setData('text/plain', 'Sam'));

    expect(findAllTables(view.state)).toHaveLength(0);
    expect(view.state.doc.toString()).toBe('Sam');
  });

  it('does not create a table when clipboard data is not tabular', () => {
    const view = mountRootView('Hello there', 5);

    dispatchPaste(view, (d) => d.setData('text/plain', 'world'));

    // This module declined; CM6's own default paste handling inserted the
    // plain text normally (it always claims/prevents the event itself —
    // not something this module's own tests need to assert on).
    expect(findAllTables(view.state)).toHaveLength(0);
    expect(view.state.doc.toString()).toBe('Helloworld there');
  });
});

describe('tableCreatePaste — clipboard formats', () => {
  it('uses the internal Clutter clipboard when present, unescaped', () => {
    const view = mountRootView('', 0);

    dispatchPaste(view, (d) => {
      d.setData('text/plain', 'plain-fallback');
      d.setData(CLUTTER_TABLE_RANGE_MIME, internalPayload([['**Bold**', 'A \\| B']]));
    });

    expect(cellText(view, 0, 0, 0)).toBe('**Bold**');
    expect(cellText(view, 0, 0, 1)).toBe('A \\| B'); // already-escaped, not double-escaped
  });

  it('parses a real HTML <table>', () => {
    const view = mountRootView('', 0);

    dispatchPaste(view, (d) => {
      d.setData('text/plain', 'Sam\tUX');
      d.setData('text/html', htmlTable([['FromHtml', 'Y']]));
    });

    expect(cellText(view, 0, 0, 0)).toBe('FromHtml');
    expect(cellText(view, 0, 0, 1)).toBe('Y');
  });

  it('falls back to plain-text behavior when HTML has no <table>', () => {
    const view = mountRootView('', 0);

    dispatchPaste(view, (d) => {
      d.setData('text/html', '<div>not a table</div>');
      d.setData('text/plain', tsv([['Sam', 'UX']]));
    });

    expect(cellText(view, 0, 0, 0)).toBe('Sam');
    expect(cellText(view, 0, 0, 1)).toBe('UX');
  });
});

describe('tableCreatePaste — placement and structure', () => {
  it('inserts the table at the exact root caret position, leaving surrounding text intact', () => {
    const doc = 'Before text\n\n\nAfter text';
    const view = mountRootView(doc, 13); // the blank line between the two paragraphs

    dispatchPaste(view, (d) => d.setData('text/plain', tsv([['Sam', 'UX', 'Pune'], ['Alex', 'Engineer', 'Delhi']])));

    const text = view.state.doc.toString();
    expect(text).toContain('Before text');
    expect(text).toContain('After text');
    expect(text.indexOf('Before text')).toBeLessThan(text.indexOf('| Sam'));
    expect(text.indexOf('| Sam')).toBeLessThan(text.indexOf('After text'));
  });

  it('root selection never ends inside the table widget (document-terminal table)', () => {
    const view = mountRootView('', 0);

    dispatchPaste(view, (d) => d.setData('text/plain', tsv([['Sam', 'UX']])));

    const table = findAllTables(view.state)[0]!;
    const main = view.state.selection.main;
    expect(main.from < table.from || main.from >= table.to).toBe(true);
  });

  it('root selection never ends inside the table widget (table followed by real content)', () => {
    const view = mountRootView('\n\nAfter text', 0);

    dispatchPaste(view, (d) => d.setData('text/plain', tsv([['Sam', 'UX']])));

    const table = findAllTables(view.state)[0]!;
    const main = view.state.selection.main;
    expect(main.from < table.from || main.from >= table.to).toBe(true);
  });

  it('is exactly one undoable operation', () => {
    const view = mountRootView('', 0);

    dispatchPaste(view, (d) => d.setData('text/plain', tsv([['Sam', 'UX'], ['Alex', 'Engineer']])));

    expect(undoDepth(view.state)).toBe(1);
  });

  it('undo removes the entire generated table in one step', () => {
    const view = mountRootView('Before\n\nAfter', 8);
    const before = view.state.doc.toString();

    dispatchPaste(view, (d) => d.setData('text/plain', tsv([['Sam', 'UX']])));
    expect(view.state.doc.toString()).not.toBe(before);

    undo(view);

    expect(view.state.doc.toString()).toBe(before);
  });

  it('does not merge into an existing table immediately adjacent (no blank line) before the insertion point', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';
    const view = mountRootView(doc, doc.length); // caret right at the existing table's own end

    dispatchPaste(view, (d) => d.setData('text/plain', tsv([['Sam', 'UX']])));

    const tables = findAllTables(view.state);
    expect(tables).toHaveLength(2);
    expect(getRowCellBounds(getNavigableRows(tables[0]!.node)[0]!)).toHaveLength(2); // original table untouched
    expect(cellText(view, 1, 0, 0)).toBe('Sam');
  });

  it('does not merge into a preceding table when the caret sits one line past its own auto-appended trailing newline (the exact live-reproduced regression)', () => {
    // Mirrors `tableActivationNormalization()`'s own terminal-table
    // guarantee: a document-terminal table always gets exactly one
    // trailing `\n` appended, landing the next real line's own start at
    // `table.to + 1`, not `table.to` — the case an exact-boundary check
    // missed (see `tableAdjacencySeparators`'s own doc comment).
    const table = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';
    const doc = table + '\n'; // the terminal-table trailing newline, already present
    const view = mountRootView(doc, doc.length); // the real line immediately after it

    dispatchPaste(view, (d) => d.setData('text/plain', tsv([['Sam', 'UX']])));

    const tables = findAllTables(view.state);
    expect(tables).toHaveLength(2);
    expect(getRowCellBounds(getNavigableRows(tables[0]!.node)[0]!)).toHaveLength(2); // original table untouched
    expect(cellText(view, 1, 0, 0)).toBe('Sam');
  });

  it('does not merge into an existing table immediately adjacent (no blank line) after the insertion point', () => {
    const existing = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';
    const view = mountRootView(existing, 0); // caret right before the existing table's own start

    dispatchPaste(view, (d) => d.setData('text/plain', tsv([['Sam', 'UX']])));

    const tables = findAllTables(view.state);
    expect(tables).toHaveLength(2);
    expect(cellText(view, 0, 0, 0)).toBe('Sam');
    expect(getRowCellBounds(getNavigableRows(tables[1]!.node)[0]!)).toHaveLength(2); // original table untouched
  });

  it('redo restores the generated table', () => {
    const view = mountRootView('', 0);

    dispatchPaste(view, (d) => d.setData('text/plain', tsv([['Sam', 'UX']])));
    const afterPaste = view.state.doc.toString();
    undo(view);
    redo(view);

    expect(view.state.doc.toString()).toBe(afterPaste);
  });
});

describe('tableCreatePaste — coexistence with existing behavior', () => {
  it('a range TableSelection defers to Milestone 5 (declines table creation)', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';
    const view = mountRootView(doc, 0);
    const table = findAllTables(view.state)[0]!;
    // Realistic root-selection state: while a range `TableSelection` is
    // active, root's own selection is never left resting inside/at the
    // table (`tableRootSelectionSnap`'s own invariant) — parked here at
    // the document's end, immediately after the table.
    view.dispatch({
      selection: { anchor: view.state.doc.length },
      effects: [tableSelectionChanged.of({ kind: 'range', tableFrom: table.from, anchor: { row: 0, col: 0 }, head: { row: 0, col: 0 } } as TableSelection)],
    });

    dispatchPaste(view, (d) => d.setData('text/plain', tsv([['X', 'Y']])));

    expect(findAllTables(view.state)).toHaveLength(1); // no second table created
  });

  it('normal single-value paste remains ordinary text paste', () => {
    const view = mountRootView('Hello ', 6);

    dispatchPaste(view, (d) => d.setData('text/plain', 'world'));

    expect(findAllTables(view.state)).toHaveLength(0);
  });
});
