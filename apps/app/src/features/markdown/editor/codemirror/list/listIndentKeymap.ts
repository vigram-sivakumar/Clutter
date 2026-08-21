import { indentUnit, syntaxTree } from '@codemirror/language';
import type { EditorState, Extension, StateCommand } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

/**
 * Tab/Shift-Tab list indent/dedent — the one piece of "smart list
 * continuation" not already delivered by `@codemirror/lang-markdown`'s own
 * `markdownKeymap` (Enter-continues, empty-item-exits — confirmed already
 * active via `markdown()`'s default `addKeymap: true`, see
 * `docs/editor-feature-matrix.md`). Deliberately scoped to list context
 * only: both commands return `false` (no-op, keeps focus in the editor —
 * confirmed by direct testing that CM6 already does this for an unbound
 * Tab) whenever any touched line isn't inside a `ListItem`, so Tab/Shift-Tab
 * outside a list are untouched by this module.
 */

function isInsideListItem(state: EditorState, linePos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(linePos, 1);
  for (; node; node = node.parent) {
    if (node.name === 'ListItem') {
      return true;
    }
  }
  return false;
}

/**
 * Every distinct document line touched by the current selection, deduped
 * by start position — a multi-line selection indents/dedents every line it
 * spans, matching `@codemirror/commands`' own `indentMore`/`indentLess`
 * multi-line behavior.
 */
function selectedLines(state: EditorState) {
  const lines = new Map<number, { from: number; text: string }>();
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
      const line = state.doc.line(lineNumber);
      lines.set(line.from, { from: line.from, text: line.text });
    }
  }
  return [...lines.values()];
}

export const indentListItem: StateCommand = ({ state, dispatch }) => {
  const lines = selectedLines(state);
  if (lines.length === 0 || !lines.every((line) => isInsideListItem(state, line.from))) {
    return false;
  }

  const unit = state.facet(indentUnit);
  dispatch(
    state.update({
      changes: lines.map((line) => ({ from: line.from, insert: unit })),
      userEvent: 'input.indent.list',
    })
  );
  return true;
};

export const dedentListItem: StateCommand = ({ state, dispatch }) => {
  const lines = selectedLines(state);
  if (lines.length === 0 || !lines.every((line) => isInsideListItem(state, line.from))) {
    return false;
  }

  const unit = state.facet(indentUnit);
  const changes = lines
    .map((line) => {
      let removable = 0;
      while (removable < unit.length && line.text[removable] === ' ') {
        removable++;
      }
      return removable > 0 ? { from: line.from, to: line.from + removable } : null;
    })
    .filter((change): change is { from: number; to: number } => change !== null);

  if (changes.length === 0) {
    return false;
  }

  dispatch(state.update({ changes, userEvent: 'delete.dedent.list' }));
  return true;
};

export function listIndentKeymap(): Extension {
  return keymap.of([
    { key: 'Tab', run: indentListItem },
    { key: 'Shift-Tab', run: dedentListItem },
  ]);
}
