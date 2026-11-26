// @vitest-environment jsdom
import { history, insertNewlineAndIndent, undo, undoDepth } from '@codemirror/commands';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import {
  findAllTables,
  getNavigableRows,
  getRowCellBounds,
  resolveLogicalCell,
} from '../table/tableGeometry';
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
      extensions: [markdownLanguageExtension(), tableRootSelectionSnap()],
    });
    const next = pressSpace(state);
    expect(findAllTables(next)).toHaveLength(1);
  });
});

