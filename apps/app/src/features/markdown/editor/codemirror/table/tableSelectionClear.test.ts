// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { history, redo, undo, undoDepth } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableActiveCellChanged, TableActiveCellController } from './tableActiveCellController';
import { tableCellNavigation } from './tableCellNavigation';
import { endOfCellContent, findEnclosingTable, resolveLogicalCell, startOfCellContent } from './tableGeometry';
import { tableRootSelectionSnap } from './tableRootSelectionSnap';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { tableSelectionDeletionHistory } from './tableSelectionDeletion';
import { tableSelectionClearKeymap } from './tableSelectionClear';
import { tableWidgetDecoration } from './tableWidgetField';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

function mountRootView(doc: string): { view: EditorView; controller: TableActiveCellController } {
  const controller = new TableActiveCellController();
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(0),
      extensions: [
        markdownLanguageExtension(),
        tableWidgetDecoration(controller),
        tableSelectionField,
        tableRootSelectionSnap(),
        tableSelectionClearKeymap(),
        tableSelectionDeletionHistory(),
        history(),
      ],
    }),
    parent,
  });
  mountedViews.push(view);
  return { view, controller };
}

function selectTable(view: EditorView, selection: TableSelection | null): void {
  view.dispatch({ effects: tableSelectionChanged.of(selection) });
}

function dispatchKey(view: EditorView, key: string): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

const NAR = '| Name | Age | Role |\n| --- | --- | --- |\n| Bob | 30 | UX |\n| Ann | 28 | Dev |';
const THREE_COL = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | NYC |\n| Sam | Engineer | SF |\n| Ann | PM | LA |';

describe('tableSelectionClearKeymap — row clearing', () => {
  it('clears the first body row and leaves it in place, same width, table structure unchanged', () => {
    const { view } = mountRootView(NAR);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 }); // Bob row

    dispatchKey(view, 'Delete');

    expect(view.state.doc.toString()).toBe('| Name | Age | Role |\n| --- | --- | --- |\n|     |    |    |\n| Ann | 28 | Dev |');
  });

  it('clears a middle/other body row (Ann) and leaves it in place', () => {
    const doc = '| Name | Age |\n| --- | --- |\n| Bob | 30 |\n| Ann | 28 |\n| Sam | 40 |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 2 }); // Ann row

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('| Name | Age |\n| --- | --- |\n| Bob | 30 |\n|     |    |\n| Sam | 40 |');
  });

  it('clears the last body row and leaves it in place', () => {
    const { view } = mountRootView(NAR);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 2 }); // Ann row (last)

    dispatchKey(view, 'Delete');

    expect(view.state.doc.toString()).toBe('| Name | Age | Role |\n| --- | --- | --- |\n| Bob | 30 | UX |\n|     |    |     |');
  });

  it('clears every cell in the selected row, and only that row', () => {
    const { view } = mountRootView(NAR);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    dispatchKey(view, 'Backspace');

    const lines = view.state.doc.toString().split('\n');
    expect(lines[2]!.replace(/[| ]/g, '')).toBe(''); // Bob's row is entirely blank content
    expect(lines[0]).toBe('| Name | Age | Role |'); // header untouched
    expect(lines[3]).toBe('| Ann | 28 | Dev |'); // other row untouched
  });

  it('the row itself is never removed — row count and doc structure are preserved', () => {
    const { view } = mountRootView(NAR);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    dispatchKey(view, 'Delete');

    expect(view.state.doc.toString().split('\n')).toHaveLength(4);
    const table = findEnclosingTable(view.state, 0);
    expect(table?.name).toBe('Table');
  });

  it('the selected row stays selected after clearing', () => {
    const { view } = mountRootView(NAR);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    dispatchKey(view, 'Delete');

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 1 });
  });

  it('clearing an already-blank row is a genuine no-op — no document change, no undo entry', () => {
    const doc = '| Name | Age |\n| --- | --- |\n|  |  |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });
    const depthBefore = undoDepth(view.state);

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe(doc);
    expect(undoDepth(view.state)).toBe(depthBefore);
  });

  it('a ragged row (fewer cells than the header) only clears the cells it actually has', () => {
    const doc = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer |\n| Sam | Engineer | SF |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 }); // ragged Vik row

    dispatchKey(view, 'Delete');

    const lines = view.state.doc.toString().split('\n');
    expect(lines[2]!.replace(/[| ]/g, '')).toBe('');
    expect(lines[2]!.split('|')).toHaveLength(4); // still only 2 cells (3 pipes), never padded to 3 cells
    expect(lines[3]).toBe('| Sam | Engineer | SF |');
  });
});

describe('tableSelectionClearKeymap — column clearing', () => {
  it('clears the first column, including its header cell, leaving the column in place', () => {
    const { view } = mountRootView(NAR);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 }); // Name

    dispatchKey(view, 'Delete');

    expect(view.state.doc.toString()).toBe('|      | Age | Role |\n| --- | --- | --- |\n|     | 30 | UX |\n|     | 28 | Dev |');
  });

  it('clears a middle column, including its header cell', () => {
    const { view } = mountRootView(NAR);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 }); // Age

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('| Name |     | Role |\n| --- | --- | --- |\n| Bob |    | UX |\n| Ann |    | Dev |');
  });

  it('clears the last column, including its header cell', () => {
    const { view } = mountRootView(NAR);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 2 }); // Role

    dispatchKey(view, 'Delete');

    expect(view.state.doc.toString()).toBe('| Name | Age |      |\n| --- | --- | --- |\n| Bob | 30 |    |\n| Ann | 28 |     |');
  });

  it('clears every cell in the selected column (header and every body row), and only that column', () => {
    const { view } = mountRootView(THREE_COL);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 }); // Role

    dispatchKey(view, 'Backspace');

    for (const line of view.state.doc.toString().split('\n').slice(2)) {
      const cells = line.split('|').slice(1, -1);
      expect(cells[1]!.trim()).toBe(''); // Role column blank
      expect(cells[0]!.trim().length).toBeGreaterThan(0); // Name column untouched
      expect(cells[2]!.trim().length).toBeGreaterThan(0); // City column untouched
    }
  });

  it('the column itself is never removed — column count and alignment row are preserved', () => {
    const doc = '| Name | Role | City |\n| :-- | :-: | --: |\n| Vik | Designer | NYC |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    dispatchKey(view, 'Delete');

    const lines = view.state.doc.toString().split('\n');
    expect(lines[1]).toBe('| :-- | :-: | --: |'); // alignment untouched
    expect(lines[0]!.split('|')).toHaveLength(5); // still 3 columns (4 pipes -> 5 segments)
  });

  it('the selected column stays selected after clearing', () => {
    const { view } = mountRootView(NAR);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    dispatchKey(view, 'Delete');

    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });
  });

  it('preserves a ragged row with no cell in the selected column', () => {
    const doc = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer |\n| Sam | Engineer | SF |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 2 }); // City

    dispatchKey(view, 'Delete');

    const lines = view.state.doc.toString().split('\n');
    expect(lines[2]).toBe('| Vik | Designer |'); // untouched — no City cell to clear
    expect(lines[3]!.split('|')).toHaveLength(5); // still 3 cells (4 pipes), City just blanked
  });

  it('preserves escaped pipes in other (unselected) cells', () => {
    const doc = '| A | B |\n| --- | --- |\n| x | a \\| b |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('|   | B |\n| --- | --- |\n|   | a \\| b |');
  });
});

describe('tableSelectionClearKeymap — range clearing', () => {
  it('clears a single selected cell', () => {
    const { view } = mountRootView(NAR);
    selectTable(view, { kind: 'range', tableFrom: 0, anchor: { row: 1, col: 0 }, head: { row: 1, col: 0 } }); // Bob

    dispatchKey(view, 'Delete');

    expect(view.state.doc.toString()).toBe('| Name | Age | Role |\n| --- | --- | --- |\n|     | 30 | UX |\n| Ann | 28 | Dev |');
  });

  it('clears multiple cells in one row (Bob + 30)', () => {
    const { view } = mountRootView(NAR);
    selectTable(view, { kind: 'range', tableFrom: 0, anchor: { row: 1, col: 0 }, head: { row: 1, col: 1 } });

    dispatchKey(view, 'Delete');

    expect(view.state.doc.toString()).toBe('| Name | Age | Role |\n| --- | --- | --- |\n|     |    | UX |\n| Ann | 28 | Dev |');
  });

  it('clears a multi-row, multi-column rectangle', () => {
    const { view } = mountRootView(NAR);
    // Age+Role for both body rows.
    selectTable(view, { kind: 'range', tableFrom: 0, anchor: { row: 1, col: 1 }, head: { row: 2, col: 2 } });

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('| Name | Age | Role |\n| --- | --- | --- |\n| Bob |    |    |\n| Ann |    |     |');
  });

  it('a reversed anchor/head (head before anchor) clears the identical rectangle', () => {
    const forward = mountRootView(NAR);
    selectTable(forward.view, { kind: 'range', tableFrom: 0, anchor: { row: 1, col: 1 }, head: { row: 2, col: 2 } });
    dispatchKey(forward.view, 'Delete');

    const reversed = mountRootView(NAR);
    selectTable(reversed.view, { kind: 'range', tableFrom: 0, anchor: { row: 2, col: 2 }, head: { row: 1, col: 1 } });
    dispatchKey(reversed.view, 'Delete');

    expect(reversed.view.state.doc.toString()).toBe(forward.view.state.doc.toString());
  });

  it('a range touching a ragged row only clears the cells that row actually has', () => {
    const doc = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer |\n| Sam | Engineer | SF |';
    const { view } = mountRootView(doc);
    // Full-width range covering both body rows and all 3 columns.
    selectTable(view, { kind: 'range', tableFrom: 0, anchor: { row: 1, col: 0 }, head: { row: 2, col: 2 } });

    dispatchKey(view, 'Delete');

    const lines = view.state.doc.toString().split('\n');
    expect(lines[2]!.split('|')).toHaveLength(4); // ragged row still only 2 cells
    expect(lines[2]!.replace(/[| ]/g, '')).toBe('');
    expect(lines[3]!.replace(/[| ]/g, '')).toBe('');
  });

  it('a range including already-empty cells changes only the non-empty ones', () => {
    const doc = '| Name | Note |\n| --- | --- |\n| Vik |  |';
    const { view } = mountRootView(doc);
    selectTable(view, { kind: 'range', tableFrom: 0, anchor: { row: 1, col: 0 }, head: { row: 1, col: 1 } });

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('| Name | Note |\n| --- | --- |\n|     |  |');
  });

  it('the range stays selected (same anchor/head) after clearing', () => {
    const { view } = mountRootView(NAR);
    const selection: TableSelection = { kind: 'range', tableFrom: 0, anchor: { row: 1, col: 0 }, head: { row: 1, col: 1 } };
    selectTable(view, selection);

    dispatchKey(view, 'Delete');

    expect(view.state.field(tableSelectionField)).toEqual(selection);
  });

  it('range clearing never removes the header row even when included (row 0)', () => {
    const { view } = mountRootView(NAR);
    selectTable(view, { kind: 'range', tableFrom: 0, anchor: { row: 0, col: 0 }, head: { row: 0, col: 1 } });

    dispatchKey(view, 'Delete');

    const lines = view.state.doc.toString().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('| --- | --- | --- |');
  });
});

describe('tableSelectionClearKeymap — keyboard', () => {
  it('Backspace clears a selection', () => {
    const { view } = mountRootView(NAR);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });
    dispatchKey(view, 'Backspace');
    expect(view.state.doc.toString()).not.toBe(NAR);
  });

  it('Delete clears a selection', () => {
    const { view } = mountRootView(NAR);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });
    dispatchKey(view, 'Delete');
    expect(view.state.doc.toString()).not.toBe(NAR);
  });

  it('does nothing when no TableSelection is active — ordinary Backspace/Delete falls through unaffected', () => {
    const { view } = mountRootView(THREE_COL);
    dispatchKey(view, 'Backspace');
    expect(view.state.doc.toString()).toBe(THREE_COL);
  });

  it('ordinary document editing outside a table is unaffected by this keymap', () => {
    const { view } = mountRootView(`Some text.\n\n${NAR}`);
    view.dispatch({ selection: { anchor: 'Some text.'.length } });

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString().startsWith('Some text')).toBe(true);
    expect(view.state.doc.toString()).not.toContain(NAR.slice(0, 5) + 'XXXX'); // sanity: table body untouched (see length check below)
    expect(view.state.doc.toString().endsWith(NAR)).toBe(true);
  });
});

describe('tableSelectionClearKeymap — root selection and active-cell coherence', () => {
  it('the root cursor never lands inside the table after clearing', () => {
    const { view } = mountRootView(NAR);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    dispatchKey(view, 'Delete');

    expect(findEnclosingTable(view.state, view.state.selection.main.head)).toBeNull();
  });

  it('no cell is active while a TableSelection drives clearing, and none becomes active afterward', () => {
    const { view, controller } = mountRootView(NAR);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    dispatchKey(view, 'Backspace');

    expect(controller.activeAnchor).toBeNull();
    expect(view.state.field(tableSelectionField)).not.toBeNull();
  });
});

describe('tableSelectionClearKeymap — undo/redo', () => {
  it('undo restores cleared content; redo clears it again, as one ordinary transaction', () => {
    const { view } = mountRootView(NAR);
    selectTable(view, { kind: 'row', tableFrom: 0, rowIndex: 1 });
    const depthBefore = undoDepth(view.state);

    dispatchKey(view, 'Delete');
    expect(view.state.doc.toString()).not.toBe(NAR);
    expect(undoDepth(view.state)).toBe(depthBefore + 1);

    undo(view);
    expect(view.state.doc.toString()).toBe(NAR);

    redo(view);
    expect(view.state.doc.toString()).not.toBe(NAR);
  });

  it('undo restores the pre-clear selection; redo restores the post-clear (identical) selection', () => {
    const { view } = mountRootView(NAR);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    dispatchKey(view, 'Backspace');
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });

    undo(view);
    expect(view.state.doc.toString()).toBe(NAR);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });

    redo(view);
    expect(view.state.doc.toString()).not.toBe(NAR);
    expect(view.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });
  });

  it('a range selection survives undo/redo unchanged', () => {
    const { view } = mountRootView(NAR);
    const selection: TableSelection = { kind: 'range', tableFrom: 0, anchor: { row: 1, col: 0 }, head: { row: 2, col: 1 } };
    selectTable(view, selection);

    dispatchKey(view, 'Delete');
    undo(view);
    expect(view.state.doc.toString()).toBe(NAR);
    expect(view.state.field(tableSelectionField)).toEqual(selection);

    redo(view);
    expect(view.state.field(tableSelectionField)).toEqual(selection);
  });
});

describe('tableCellNavigation — clearing while the nested cell editor still owns DOM focus', () => {
  /**
   * Regression coverage for the focus-routing bug: a row/column handle
   * click sets root `TableSelection` and logically deactivates the active
   * cell, but never itself moves real keyboard focus off the nested
   * editor — see `tableCellNavigation.ts`'s own doc comment on its
   * Backspace/Delete bindings for the full investigation. `dispatchKey`
   * below fires the keydown on the *nested* view's own `contentDOM` —
   * exactly where the bug report confirms focus actually still sits —
   * never on root's, which is the whole point: a root-only keymap could
   * never see this.
   */
  function activateCellContaining(root: EditorView, needle: string): { controller: TableActiveCellController; nested: EditorView } {
    const controller = new TableActiveCellController();
    controller.setNestedExtensions([tableCellNavigation(() => root, controller)]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const pos = root.state.doc.toString().indexOf(needle);
    const cell = resolveLogicalCell(root.state, pos);
    if (!cell) {
      throw new Error(`"${needle}" did not resolve to a table cell`);
    }
    const from = startOfCellContent(root.state, cell.bounds);
    const to = endOfCellContent(root.state, cell.bounds);
    controller.activate(root, container, from, to, pos + needle.length); // caret at the cell's own content end
    return { controller, nested: controller.nestedView! };
  }

  /** Mirrors `tableHandleOverlay.ts`'s own click-handler dispatch exactly — including its own real bug of never calling `rootView.focus()` — so `nested` is left holding focus precisely as the live app does. */
  function selectViaHandleClick(root: EditorView, controller: TableActiveCellController, selection: TableSelection): void {
    controller.deactivate();
    root.dispatch({ effects: [tableActiveCellChanged.of(null), tableSelectionChanged.of(selection)] });
  }

  it('row selection: Delete on the still-focused nested editor clears the row, not the cell text', () => {
    const { view: root } = mountRootView(NAR);
    const { controller, nested } = activateCellContaining(root, 'Bob');
    selectViaHandleClick(root, controller, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    dispatchKey(nested, 'Delete');

    expect(root.state.doc.toString()).not.toBe(NAR);
    expect(root.state.doc.toString()).not.toContain('Bob');
    expect(root.state.field(tableSelectionField)).toEqual({ kind: 'row', tableFrom: 0, rowIndex: 1 });
  });

  it('column selection: Backspace on the still-focused nested editor clears the column', () => {
    const { view: root } = mountRootView(NAR);
    const { controller, nested } = activateCellContaining(root, 'Bob');
    selectViaHandleClick(root, controller, { kind: 'column', tableFrom: 0, columnIndex: 0 }); // Name

    dispatchKey(nested, 'Backspace');

    expect(root.state.doc.toString()).not.toBe(NAR);
    expect(root.state.doc.toString()).not.toContain('Bob');
    expect(root.state.doc.toString()).not.toContain('Ann');
    expect(root.state.field(tableSelectionField)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 0 });
  });

  it('range selection: Delete on the still-focused nested editor clears the range', () => {
    const { view: root } = mountRootView(NAR);
    const { controller, nested } = activateCellContaining(root, 'Bob');
    const selection: TableSelection = { kind: 'range', tableFrom: 0, anchor: { row: 1, col: 0 }, head: { row: 1, col: 1 } };
    selectViaHandleClick(root, controller, selection);

    dispatchKey(nested, 'Delete');

    expect(root.state.doc.toString()).not.toContain('Bob');
    expect(root.state.doc.toString()).toContain('UX'); // unselected cell untouched
    expect(root.state.field(tableSelectionField)).toEqual(selection);
  });

  it('after clearing via the nested editor, focus is handed back to root — no cell is reactivated', () => {
    const { view: root } = mountRootView(NAR);
    const { controller, nested } = activateCellContaining(root, 'Bob');
    selectViaHandleClick(root, controller, { kind: 'row', tableFrom: 0, rowIndex: 1 });

    dispatchKey(nested, 'Delete');

    expect(controller.activeAnchor).toBeNull();
    expect(root.hasFocus).toBe(true);
  });

  it('no TableSelection: Backspace inside an active cell still does ordinary in-cell text editing, unaffected by this fix', () => {
    const { view: root } = mountRootView(NAR);
    const { nested } = activateCellContaining(root, 'Bob');

    dispatchKey(nested, 'Backspace');

    expect(nested.state.doc.toString()).toBe('Bo');
    expect(root.state.doc.toString()).toContain('| Bo '); // forwarded to root, ordinary edit (padding preserved)
  });
});
