// @vitest-environment jsdom
import { history, insertNewlineAndIndent, undo, undoDepth } from '@codemirror/commands';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import { TableActiveCellController } from '../table/tableActiveCellController';
import { tableCellNavigation } from '../table/tableCellNavigation';
import {
  type CellBounds,
  endOfCellContent,
  findAllTables,
  getNavigableRows,
  getRowCellBounds,
  resolveLogicalCell,
  startOfCellContent,
} from '../table/tableGeometry';
import { tableActivationNormalization } from '../table/tableActivationNormalization';
import { tableRootSelectionSnap } from '../table/tableRootSelectionSnap';
import { markdownEnterCommand } from './markdownEnterKeymap';
import {
  buildTableShortcutMarkdown,
  insertTableOnShortcutSpace,
  TABLE_SHORTCUT_BODY_ROW,
  TABLE_SHORTCUT_HEADER_ROW,
  TABLE_SHORTCUT_SEPARATOR_ROW,
  tableShortcutFirstBodyCellCursor,
} from './tableCreateSpaceShortcut';

function pressSpace(state: EditorState): EditorState {
  let dispatched: Transaction | null = null;
  const target = {
    state,
    dispatch: (tr: Transaction) => {
      dispatched = tr;
    },
  };
  if (!insertTableOnShortcutSpace(target)) {
    target.dispatch(
      state.update({
        changes: { from: state.selection.main.head, to: state.selection.main.head, insert: ' ' },
        selection: { anchor: state.selection.main.head + 1 },
        userEvent: 'input.type',
      })
    );
  }
  const next = dispatched ? (dispatched as Transaction).state : state;
  ensureSyntaxTree(next, next.doc.length, 5000);
  return next;
}

const mounted: EditorView[] = [];
afterEach(() => {
  for (const view of mounted.splice(0)) {
    view.destroy();
  }
});

describe('|-\\| / | - | + Space table shortcut', () => {
  it('|-\\| + Space creates the expected 3-column table markdown', () => {
    const state = EditorState.create({
      doc: '|-|\n',
      selection: EditorSelection.cursor(3),
      extensions: [markdownLanguageExtension()],
    });
    const next = pressSpace(state);
    expect(next.doc.toString()).toBe(`${buildTableShortcutMarkdown()}\n`);
  });

  it('| - | + Space creates the same table', () => {
    const state = EditorState.create({
      doc: '| - |\n',
      selection: EditorSelection.cursor(5),
      extensions: [markdownLanguageExtension()],
    });
    const next = pressSpace(state);
    expect(next.doc.toString()).toBe(`${buildTableShortcutMarkdown()}\n`);
  });

  it('generates exactly three columns', () => {
    const state = EditorState.create({
      doc: '  |-|  ',
      selection: EditorSelection.cursor(7),
      extensions: [markdownLanguageExtension()],
    });
    const next = pressSpace(state);
    const table = findAllTables(next)[0]!;
    const header = getNavigableRows(table.node)[0]!;
    expect(getRowCellBounds(header)).toHaveLength(3);
  });

  it('generates header plus one body row (two pipe rows besides the delimiter)', () => {
    const state = EditorState.create({
      doc: '|-|\n',
      selection: EditorSelection.cursor(3),
      extensions: [markdownLanguageExtension()],
    });
    const next = pressSpace(state);
    const rows = getNavigableRows(findAllTables(next)[0]!.node);
    expect(rows).toHaveLength(2);
    expect(next.doc.toString()).toContain(TABLE_SHORTCUT_HEADER_ROW);
    expect(next.doc.toString()).toContain(TABLE_SHORTCUT_SEPARATOR_ROW);
    expect(next.doc.toString()).toContain(TABLE_SHORTCUT_BODY_ROW);
  });

  it('places the cursor in the first body cell', () => {
    const state = EditorState.create({
      doc: '|-|\n',
      selection: EditorSelection.cursor(3),
      extensions: [markdownLanguageExtension()],
    });
    const next = pressSpace(state);
    const tableFrom = findAllTables(next)[0]!.from;
    const expected = tableShortcutFirstBodyCellCursor(next, tableFrom);
    expect(expected).not.toBeNull();
    expect(next.selection.main.head).toBe(expected);
    const cell = resolveLogicalCell(next, next.selection.main.head);
    expect(cell?.row.name).toBe('TableRow');
    expect(cell?.columnIndex).toBe(0);
  });

  it('does not trigger inside fenced code', () => {
    const doc = '```\n|-|\n```';
    const pos = doc.indexOf('|-') + 3;
    const state = EditorState.create({
      doc,
      selection: EditorSelection.cursor(pos),
      extensions: [markdownLanguageExtension()],
    });
    const handled = insertTableOnShortcutSpace({
      state,
      dispatch: () => {
        throw new Error('should not dispatch');
      },
    });
    expect(handled).toBe(false);
    const next = pressSpace(state);
    expect(findAllTables(next)).toHaveLength(0);
    expect(next.doc.toString()).toMatch(/```[\s\S]*\|-\|/);
  });

  it('| - | below an existing header line does not use the one-shot shortcut', () => {
    const doc = '| Name | Age |\n| - |\n';
    const pos = doc.indexOf('| - |') + 5;
    const state = EditorState.create({
      doc,
      selection: EditorSelection.cursor(pos),
      extensions: [markdownLanguageExtension()],
    });
    expect(insertTableOnShortcutSpace({ state, dispatch: () => undefined })).toBe(false);
  });

  it('Enter on |-| does not create a table', () => {
    const state = EditorState.create({
      doc: '|-|\n',
      selection: EditorSelection.cursor(3),
      extensions: [markdownLanguageExtension()],
    });
    let dispatched: Transaction | null = null;
    const target = {
      state,
      dispatch: (tr: Transaction) => {
        dispatched = tr;
      },
    };
    if (!markdownEnterCommand(target)) {
      insertNewlineAndIndent(target);
    }
    const next = dispatched ? (dispatched as Transaction).state : state;
    expect(next.doc.toString()).toBe('|-|\n\n');
    expect(findAllTables(next)).toHaveLength(0);
  });

  it('undo restores the original |-| trigger', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({
        doc: '|-|\n',
        selection: EditorSelection.cursor(3),
        extensions: [markdownLanguageExtension(), history()],
      }),
      parent,
    });
    mounted.push(view);
    expect(insertTableOnShortcutSpace(view)).toBe(true);
    expect(view.state.doc.toString()).not.toBe('|-|\n');
    expect(undoDepth(view.state)).toBeGreaterThan(0);
    undo(view);
    expect(view.state.doc.toString()).toBe('|-|\n');
  });

  it('parses as a valid GFM table after creation', () => {
    const state = EditorState.create({
      doc: '|-|\n',
      selection: EditorSelection.cursor(3),
      extensions: [markdownLanguageExtension(), tableActivationNormalization(), tableRootSelectionSnap()],
    });
    const next = pressSpace(state);
    expect(findAllTables(next)).toHaveLength(1);
  });
});

describe('|-\\| table shortcut — Tab navigation via nested editor', () => {
  function mountTableAtShortcut(doc: string): { root: EditorView; controller: TableActiveCellController } {
    const controller = new TableActiveCellController();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const root = new EditorView({
      state: EditorState.create({
        doc,
        selection: EditorSelection.cursor(doc.length - 1),
        extensions: [markdownLanguageExtension(), history()],
      }),
      parent,
    });
    controller.setNestedExtensions([tableCellNavigation(() => root, controller)]);
    mounted.push(root);
    return { root, controller };
  }

  function trimmedRange(state: EditorState, bounds: CellBounds): { from: number; to: number } {
    return {
      from: startOfCellContent(state, bounds),
      to: endOfCellContent(state, bounds),
    };
  }

  function activateFirstBodyCell(root: EditorView, controller: TableActiveCellController): void {
    const table = findAllTables(root.state)[0]!;
    const bodyRow = getNavigableRows(table.node)[1]!;
    const bounds = getRowCellBounds(bodyRow)[0]!;
    const range = trimmedRange(root.state, bounds);
    const container = document.createElement('div');
    document.body.appendChild(container);
    controller.activate(root, container, range.from, range.to, range.from);
  }

  function key(view: EditorView, key: string, shift = false): void {
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true })
    );
  }

  it('Tab moves to the next cell from the first body cell', () => {
    const { root, controller } = mountTableAtShortcut(`${buildTableShortcutMarkdown()}\n`);
    activateFirstBodyCell(root, controller);
    expect(controller.nestedView!.state.doc.toString()).toBe('');

    key(controller.nestedView!, 'Tab');

    const cell = resolveLogicalCell(root.state, controller.activeAnchor!.from);
    expect(cell?.columnIndex).toBe(1);
  });

  it('Tab at the final cell follows frozen table navigation (no new row — row creation is Enter)', () => {
    const { root, controller } = mountTableAtShortcut(`${buildTableShortcutMarkdown()}\n`);
    const table = findAllTables(root.state)[0]!;
    const bodyRow = getNavigableRows(table.node)[1]!;
    const lastCol = getRowCellBounds(bodyRow).length - 1;
    const bounds = getRowCellBounds(bodyRow)[lastCol]!;
    const range = trimmedRange(root.state, bounds);
    const container = document.createElement('div');
    document.body.appendChild(container);
    controller.activate(root, container, range.from, range.to, range.from);
    const rowsBefore = getNavigableRows(table.node).length;
    const anchorBefore = controller.activeAnchor;

    key(controller.nestedView!, 'Tab');

    expect(getNavigableRows(findAllTables(root.state)[0]!.node).length).toBe(rowsBefore);
    expect(controller.activeAnchor).toEqual(anchorBefore);
  });

  it('Enter in the last body cell leaves the table and active column unchanged', () => {
    const { root, controller } = mountTableAtShortcut(`${buildTableShortcutMarkdown()}\n`);
    const table = findAllTables(root.state)[0]!;
    const bodyRow = getNavigableRows(table.node)[1]!;
    const lastCol = getRowCellBounds(bodyRow).length - 1;
    const bounds = getRowCellBounds(bodyRow)[lastCol]!;
    const range = trimmedRange(root.state, bounds);
    const container = document.createElement('div');
    document.body.appendChild(container);
    controller.activate(root, container, range.from, range.to, range.from);

    const rowsBefore = getNavigableRows(table.node).length;
    key(controller.nestedView!, 'Enter');

    const tableAfter = findAllTables(root.state)[0]!;
    expect(getNavigableRows(tableAfter.node).length).toBe(rowsBefore);
    const active = resolveLogicalCell(root.state, controller.activeAnchor!.from);
    expect(active?.row.name).toBe('TableRow');
    expect(active?.columnIndex).toBe(lastCol);
  });
});
