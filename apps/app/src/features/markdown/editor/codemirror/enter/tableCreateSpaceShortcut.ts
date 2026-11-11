import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorSelection, type EditorState, type StateCommand } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import {
  findAllTables,
  getNavigableRows,
  getRowCellBounds,
  startOfCellContent,
} from '../table/tableGeometry';

/** `|-|` with no spaces inside the cell — Space on a line containing only this (± outer whitespace) creates a table. */
const TRIGGER_TIGHT = /^\s*\|-\|\s*$/;

/** `| - |` — spaces required around the dash so a tight `|-|` does not match this pattern. */
const TRIGGER_SPACED = /^\s*\|\s+-\s+\|\s*$/;

const LITERAL_BLOCKS: ReadonlySet<string> = new Set([
  'FencedCode',
  'CodeBlock',
  'HTMLBlock',
  'CommentBlock',
  'InlineCode',
]);

/** Exact 3-column shortcut table (header, delimiter, one body row). */
export const TABLE_SHORTCUT_HEADER_ROW = '|   |   |   |';
export const TABLE_SHORTCUT_SEPARATOR_ROW = '|---|---|---|';
export const TABLE_SHORTCUT_BODY_ROW = '|   |   |   |';

export function buildTableShortcutMarkdown(): string {
  return [TABLE_SHORTCUT_HEADER_ROW, TABLE_SHORTCUT_SEPARATOR_ROW, TABLE_SHORTCUT_BODY_ROW].join('\n');
}

function isShortcutTriggerLine(text: string): boolean {
  return TRIGGER_TIGHT.test(text) || TRIGGER_SPACED.test(text);
}

function insideLiteralBlock(state: EditorState, pos: number): boolean {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (LITERAL_BLOCKS.has(node.name)) {
      return true;
    }
  }
  return false;
}

/** A non-blank line above that already looks like a table row — do not treat `| - |` as the one-shot shortcut. */
function hasPlausibleTableHeaderAbove(state: EditorState, lineNumber: number): boolean {
  if (lineNumber <= 1) {
    return false;
  }
  const prev = state.doc.line(lineNumber - 1).text;
  return prev.trim().length > 0 && prev.includes('|') && !isShortcutTriggerLine(prev);
}

/** Root selection at the first body cell's content start after `buildTableShortcutMarkdown()` at `tableFrom`. */
export function tableShortcutFirstBodyCellCursor(state: EditorState, tableFrom: number): number | null {
  const table = findAllTables(state).find((t) => t.from === tableFrom);
  if (!table) {
    return null;
  }
  const bodyRow = getNavigableRows(table.node)[1];
  if (!bodyRow) {
    return null;
  }
  const bounds = getRowCellBounds(bodyRow)[0];
  if (!bounds) {
    return null;
  }
  return startOfCellContent(state, bounds);
}

/**
 * `|-|` or `| - |` at the end of a line + Space → fixed 3-column GFM table.
 * Wired on the shared `Space` keymap after ordered-list and task-marker
 * creation (`markdownEnterKeymap()`).
 */
export const insertTableOnShortcutSpace: StateCommand = ({ state, dispatch }) => {
  const { selection } = state;
  if (selection.ranges.length !== 1 || !selection.main.empty) {
    return false;
  }

  const pos = selection.main.head;
  const line = state.doc.lineAt(pos);
  const lineText = line.text;
  if (!isShortcutTriggerLine(lineText)) {
    return false;
  }
  if (pos < line.from || state.sliceDoc(pos, line.to).trim() !== '') {
    return false;
  }
  if (insideLiteralBlock(state, pos)) {
    return false;
  }
  if (hasPlausibleTableHeaderAbove(state, line.number)) {
    return false;
  }

  const tableMarkdown = buildTableShortcutMarkdown();
  const tableFrom = line.from;
  const provisional = state.update({
    changes: { from: line.from, to: line.to, insert: tableMarkdown },
    selection: EditorSelection.cursor(tableFrom),
  }).state;
  ensureSyntaxTree(provisional, provisional.doc.length, 5000);
  const cursorPos = tableShortcutFirstBodyCellCursor(provisional, tableFrom) ?? tableFrom;

  dispatch(
    state.update({
      changes: { from: line.from, to: line.to, insert: tableMarkdown },
      selection: EditorSelection.cursor(cursorPos),
      scrollIntoView: true,
      userEvent: 'input.type',
    })
  );
  return true;
};
