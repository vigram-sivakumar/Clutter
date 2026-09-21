// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { history, redo, undo, undoDepth } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { insertColumnLeftSelection } from './tableColumnInsertion';
import { insertRowBelowSelection } from './tableRowInsertion';
import { findAllTables, getNavigableRows, getRowCellBounds } from './tableGeometry';
import { computeRectangularizingChanges, ensureRectangularCellBounds, tableRectangularNormalization } from './tableRectangularNormalization';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { deleteColumnSelection } from './tableSelectionDeletion';
import { tableSelectionDeletionHistory } from './tableSelectionDeletion';
import { clearTableSelection } from './tableSelectionClear';

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
      selection: EditorSelection.cursor(0),
      extensions: [markdownLanguageExtension(), tableSelectionField, tableSelectionDeletionHistory(), tableRectangularNormalization(), history()],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
  mountedViews.push(view);
  return view;
}

function selectTable(view: EditorView, selection: TableSelection | null): void {
  view.dispatch({ effects: tableSelectionChanged.of(selection) });
}

/** Every navigable row's own real cell count, for asserting rectangularity directly against a table's current document text. */
function rowCellCounts(view: EditorView): number[] {
  const table = findAllTables(view.state)[0]!;
  return getNavigableRows(table.node).map((row) => getRowCellBounds(row).length);
}

const THREE_COL = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | Delhi |\n| Alex | Engineer | Tokyo |';
const RAGGED_LAST_ROW = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | Delhi |\n| Alex | Engineer |';

describe('computeRectangularizingChanges', () => {
  it('is empty for an already-rectangular table', () => {
    const view = mountRootView(THREE_COL);
    const table = findAllTables(view.state)[0]!;
    expect(computeRectangularizingChanges(table)).toEqual([]);
  });

  it('pads a ragged row to the header\'s own column count', () => {
    const view = mountRootView(RAGGED_LAST_ROW);
    const table = findAllTables(view.state)[0]!;
    const changes = computeRectangularizingChanges(table);
    expect(changes).toHaveLength(1);
    view.dispatch({ changes });
    expect(rowCellCounts(view)).toEqual([3, 3, 3]);
    expect(view.state.doc.toString()).toContain('| Alex | Engineer | |');
  });

  it('pads multiple differently-ragged rows independently, each to the same header count', () => {
    const doc = '| A | B | C |\n| --- | --- | --- |\n| 1 |\n| 2 | 3 |\n| 4 | 5 | 6 |';
    const view = mountRootView(doc);
    const table = findAllTables(view.state)[0]!;
    view.dispatch({ changes: computeRectangularizingChanges(table) });
    expect(rowCellCounts(view)).toEqual([3, 3, 3, 3]);
  });
});

describe('tableRectangularNormalization — transaction filter', () => {
  it('deleting a pipe mid-row (making it ragged) is corrected by the same transaction that removed it', () => {
    const view = mountRootView(THREE_COL);
    const doc = view.state.doc.toString();
    // Remove exactly one pipe character from the last data row (turning a
    // 3-cell row into a 2-cell one from the interior, not just the end).
    const pipePos = doc.lastIndexOf('|', doc.lastIndexOf('Tokyo'));
    view.dispatch({ changes: { from: pipePos, to: pipePos + 1, insert: '' } });

    expect(rowCellCounts(view)).toEqual([3, 3, 3]);
  });

  it('pasting an already-complete-but-ragged table (header+delimiter+short data row, one transaction) is normalized', () => {
    const view = mountRootView('');
    const pasted = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | UI |\n| Sam | UX | Pune |';
    view.dispatch({ changes: { from: 0, to: 0, insert: pasted } });

    expect(rowCellCounts(view)).toEqual([3, 3, 3]);
    expect(view.state.doc.toString()).toContain('| Vik | UI | |');
  });

  it('column insertion leaves a pre-existing ragged row rectangular relative to the new (larger) header', () => {
    const view = mountRootView(RAGGED_LAST_ROW);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });
    insertColumnLeftSelection(view, view.state.field(tableSelectionField)!);

    // `tableColumnInsertion.ts`'s own `columnInsertionChangeForRow`
    // deliberately leaves a row untouched when it has no real column at
    // the target index — this filter is what actually keeps the *result*
    // rectangular, without any change to that file.
    expect(rowCellCounts(view)).toEqual([4, 4, 4]);
  });

  it('column deletion leaves every row rectangular relative to the new (smaller) header', () => {
    const doc = '| A | B | C |\n| --- | --- | --- |\n| 1 | 2 |\n| 4 | 5 | 6 |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });
    deleteColumnSelection(view, view.state.field(tableSelectionField)!);

    expect(rowCellCounts(view)).toEqual([2, 2, 2]);
  });

  it('row insertion (already rectangular by construction) is left as-is by this filter', () => {
    const view = mountRootView(THREE_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });
    insertRowBelowSelection(view, view.state.field(tableSelectionField)!);

    expect(rowCellCounts(view)).toEqual([3, 3, 3, 3]);
  });

  it('clearing content never introduces raggedness (a cleared cell stays a real, empty cell — filter is a no-op)', () => {
    const view = mountRootView(THREE_COL);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });
    clearTableSelection(view, view.state.field(tableSelectionField)!);

    expect(rowCellCounts(view)).toEqual([3, 3, 3]);
  });

  it('undo restores the exact pre-normalization (ragged) document, redo restores the padded one', () => {
    const view = mountRootView('');
    // The ragged row must not be the very *last* thing in the pasted text
    // — see the dedicated test below for why (a row ending exactly where
    // the edit itself ends is indistinguishable, to this filter, from a
    // row still being actively typed, so it's deliberately not padded
    // immediately in that one specific position).
    const pasted = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | UI |\n| Sam | UX | Pune |';
    view.dispatch({ changes: { from: 0, to: 0, insert: pasted } });
    expect(rowCellCounts(view)).toEqual([3, 3, 3]);

    undo(view);
    expect(view.state.doc.toString()).toBe('');

    redo(view);
    expect(rowCellCounts(view)).toEqual([3, 3, 3]);
  });

  it('a ragged row that happens to be the very last thing in a pasted/typed range is not eagerly padded — the same "don\'t corrupt a row still in progress" rule applies uniformly, deliberately not special-cased for paste', () => {
    const view = mountRootView('');
    const pasted = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | UI |';
    view.dispatch({ changes: { from: 0, to: 0, insert: pasted } });

    // Deliberately still ragged in the *source* — indistinguishable, to
    // this filter, from the user still being mid-keystroke on this exact
    // row (this module's own top doc comment: "never pads the row the
    // transaction's own edit is actively extending"). Never a violation
    // of the user-facing invariant: rendering already shows it as a
    // complete, empty cell (`tableWidgetField.ts`'s own padding), and
    // activating that cell (`ensureRectangularCellBounds`) materializes it
    // for real the moment anything actually tries to.
    expect(rowCellCounts(view)).toEqual([3, 2]);

    // A later, unrelated edit to the *same table* is enough to catch it —
    // this row is no longer "being edited right now" once some other part
    // of the table changes.
    const pos = view.state.doc.length;
    view.dispatch({ changes: { from: pos, to: pos, insert: '\n| Sam | UX | Pune |' } });
    expect(rowCellCounts(view)).toEqual([3, 3, 3]);
  });

  it('an already-rectangular table is completely unaffected by an unrelated edit elsewhere in the same table', () => {
    const view = mountRootView(THREE_COL);
    const before = view.state.doc.toString();
    // An edit that doesn't change any row's own cell count — appending a
    // character inside an existing cell.
    const pos = view.state.doc.toString().indexOf('Vik') + 3;
    view.dispatch({ changes: { from: pos, to: pos, insert: '!' } });

    expect(view.state.doc.toString()).toBe(before.replace('Vik', 'Vik!'));
    expect(rowCellCounts(view)).toEqual([3, 3, 3]);
  });

  it('typing a brand-new row character by character never pads it prematurely, mid-word, before it has a trailing newline', () => {
    // A live-browser check surfaced this as a real, worth-verifying
    // question: this filter runs on *every* doc-changing transaction, and
    // a row genuinely is "ragged" (fewer cells than the header) for every
    // single keystroke while it's still being typed — the concern is
    // whether that would insert padding text *into the row the user is
    // still actively typing*, corrupting it, rather than only once the
    // row is a real, complete line. Each character is dispatched as its
    // own separate transaction (not one bulk insert), matching real
    // keystroke-by-keystroke typing exactly, unlike this file's other
    // tests (which mostly dispatch one bulk change).
    const view = mountRootView(THREE_COL + '\n');
    const prefixBeforeNewRow = view.state.doc.toString();
    const newRowText = '| Alex | Engineer';
    let pos = view.state.doc.length;
    let typedSoFar = '';
    for (const ch of newRowText) {
      view.dispatch({ changes: { from: pos, to: pos, insert: ch } });
      pos += 1;
      typedSoFar += ch;
      // At no point while still typing (no trailing newline yet, and the
      // row is genuinely incomplete) may the document contain injected
      // padding text — the row's own in-progress text must appear
      // verbatim, uninterrupted, with nothing else appended.
      expect(view.state.doc.toString()).toBe(prefixBeforeNewRow + typedSoFar);
    }
    expect(view.state.doc.toString()).toBe(THREE_COL + '\n' + newRowText);
  });

  it('does not touch a second, unrelated (already-ragged) table elsewhere in the same document when editing the first', () => {
    const doc = `${THREE_COL}\n\n| X | Y |\n| --- | --- |\n| 1 |`;
    const view = mountRootView(doc);
    const secondTableRaggedBefore = view.state.doc.toString().includes('| 1 |\n') || view.state.doc.toString().endsWith('| 1 |');
    expect(secondTableRaggedBefore).toBe(true);

    // Edit only the *first* table.
    const pos = view.state.doc.toString().indexOf('Vik') + 3;
    view.dispatch({ changes: { from: pos, to: pos, insert: '!' } });

    // The second table's own ragged row is untouched — this filter only
    // normalizes tables actually overlapping the edited range, never a
    // full-document scan/rewrite (the contract's own explicit performance
    // requirement).
    expect(view.state.doc.toString()).toContain('| 1 |');
    expect(view.state.doc.toString()).not.toContain('| 1 | |');
  });
});

describe('ensureRectangularCellBounds', () => {
  it('materializes a missing column for real and returns its resolved bounds', () => {
    const view = mountRootView(RAGGED_LAST_ROW);
    const table = findAllTables(view.state)[0]!;

    const result = ensureRectangularCellBounds(view, table, 2, 2); // "Alex | Engineer" row, missing column 2
    expect(result).not.toBeNull();
    expect(result!.bounds.synthetic).toBeUndefined();
    expect(rowCellCounts(view)).toEqual([3, 3, 3]);
  });

  it('is a no-op (no dispatch) when the target column is already real', () => {
    const view = mountRootView(THREE_COL);
    const table = findAllTables(view.state)[0]!;
    const docBefore = view.state.doc.toString();

    const result = ensureRectangularCellBounds(view, table, 1, 1);

    expect(result).not.toBeNull();
    expect(view.state.doc.toString()).toBe(docBefore);
  });

  it('returns null for a genuinely out-of-range column (beyond the header)', () => {
    const view = mountRootView(THREE_COL);
    const table = findAllTables(view.state)[0]!;
    expect(ensureRectangularCellBounds(view, table, 1, 5)).toBeNull();
  });

  it('materializing is its own real, single undo step', () => {
    const view = mountRootView(RAGGED_LAST_ROW);
    const table = findAllTables(view.state)[0]!;
    ensureRectangularCellBounds(view, table, 2, 2);

    expect(undoDepth(view.state)).toBe(1);
    undo(view);
    expect(view.state.doc.toString()).toBe(RAGGED_LAST_ROW);
  });
});
