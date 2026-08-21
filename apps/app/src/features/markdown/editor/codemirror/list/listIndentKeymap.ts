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
 * The Lezer node names that can open a `ListItem` — `ListMark` for
 * bullet/ordered/task items (confirmed against the installed
 * `@lezer/markdown`'s `BulletList`/`OrderedList`/`TaskList` — a Task-owned
 * `ListItem` still has `ListMark` as its own first child, with `Task`
 * arriving as the second), `EmojiListMark` for Clutter's own emoji-list
 * extension (`emojiListSyntax.ts`). One nesting-column formula covers every
 * kind without branching on which one it is.
 */
const LIST_MARKER_NODE_NAMES: ReadonlySet<string> = new Set(['ListMark', 'EmojiListMark']);

/**
 * Finds the `ListItem` that *starts* on the given line — i.e. whose own
 * marker sits on this physical line, not merely an ancestor `ListItem`
 * whose marker is on an earlier line (a multi-line item's own
 * lazy-continuation line). Returns `null` for the latter case, so callers
 * can fall back to simpler handling for continuation lines, which have no
 * "previous sibling" of their own to nest under.
 *
 * Resolves at the line's first non-whitespace character, never at the raw
 * line start — a nested item's own `ListItem`/`ListMark` node always
 * begins at the marker itself (confirmed by direct inspection of parsed
 * trees), never at column 0; the leading indentation in front of it is a
 * gap covered by no node at all (`@lezer/markdown`'s continuation-skip
 * machinery consumes it procedurally while parsing, but it never becomes
 * part of any node's own range). Resolving at column 0 for an indented
 * line therefore can only ever land on an *ancestor* whose range happens
 * to span that gap — never this line's own item — which silently broke
 * indentation for every already-nested item, not merely ones with no
 * sibling: `contentColumn`'s callers below only ever saw the fallback
 * path, capable of blindly widening a line's indentation on every Tab
 * press with no bound, eventually reinterpreting the line as ordinary
 * paragraph text and destroying the list structure.
 */
function listItemStartingAt(state: EditorState, linePos: number): SyntaxNode | null {
  const line = state.doc.lineAt(linePos);
  const probePos = line.from + leadingSpaceCount(line.text);
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(probePos, 1);
  for (; node; node = node.parent) {
    if (node.name === 'ListItem' && state.doc.lineAt(node.from).from === line.from) {
      return node;
    }
  }
  return null;
}

/**
 * The column (from the start of `listItem`'s own line) where that item's
 * *content* begins — the exact target column a child needs to reach to be
 * recognized as nested inside it, per `@lezer/markdown`'s own
 * `getListIndent`/`DefaultSkipMarkup[ListItem]` rules (confirmed by direct
 * inspection of the installed package): a line only continues inside a
 * `ListItem` once its indent reaches that `ListItem`'s own content column.
 * Derived from where `listItem`'s actual marker node ends in the real
 * document — never a hardcoded "2 for bullets, 3 for ordered" table, so a
 * `10.`/`100.` marker (or a marker with unusual extra spacing) is handled
 * correctly by construction, not by enumerating cases.
 */
function contentColumn(state: EditorState, listItem: SyntaxNode): number {
  const markerLine = state.doc.lineAt(listItem.from);
  const marker = listItem.firstChild;
  if (!marker || !LIST_MARKER_NODE_NAMES.has(marker.name)) {
    // Defensive only — every real ListItem's firstChild is one of these
    // (confirmed above); falling back to "right after the item's own
    // start" keeps this from silently no-oping if that invariant ever
    // changes upstream.
    return listItem.from - markerLine.from + 1;
  }
  // The node right after the marker (Paragraph/Task/a nested list/…) is
  // where content actually starts. With no such node (an empty item, e.g.
  // "- " with nothing typed yet), fall back to one column past the marker
  // — the same single-separating-space convention `getListIndent` itself
  // falls back to.
  const contentFrom = marker.nextSibling ? marker.nextSibling.from : marker.to + 1;
  return contentFrom - markerLine.from;
}

function leadingSpaceCount(lineText: string): number {
  return lineText.length - lineText.trimStart().length;
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

/**
 * Tab nests the current item under its immediately preceding sibling
 * `ListItem`, inserting exactly enough leading spaces to reach that
 * sibling's own content column (`contentColumn`) — never a fixed amount.
 * This is what makes one Tab always move an item exactly one nesting
 * level deeper regardless of marker kind/width (`-` vs `1.` vs `10.` vs a
 * task/emoji marker), matching real CommonMark nesting rules instead of
 * the global `indentUnit` (which only ever coincidentally matched
 * bullets' own 2-column threshold).
 *
 * A line with no preceding sibling at its own level (the first item of a
 * list) is left untouched — there is nothing valid to nest it under; a
 * `ListItem` cannot become its own sibling's child without that sibling
 * existing, and inserting arbitrary indentation with no matching
 * structure would just be absorbed by the parser as slack whitespace on
 * the same item (confirmed by direct inspection: CommonMark's own
 * `ListItem` continuation rule accepts any indent past the threshold as
 * "still this item," it does not manufacture a deeper level from
 * whitespace alone) — not a real second nesting level, and not something
 * another CommonMark-compliant Markdown reader would agree is nested.
 *
 * A line that is itself a list item's *continuation* (its own governing
 * `ListItem` starts on an earlier line — `listItemStartingAt` returns
 * `null`) has no marker/sibling of its own to compute a column from, so it
 * keeps the previous flat `indentUnit` insertion as a simple fallback;
 * none of this module's test coverage or the reported bug concerns that
 * case.
 */
export const indentListItem: StateCommand = ({ state, dispatch }) => {
  const lines = selectedLines(state);
  if (lines.length === 0 || !lines.every((line) => isInsideListItem(state, line.from))) {
    return false;
  }

  const unit = state.facet(indentUnit);
  const changes = lines
    .map((line) => {
      const ownItem = listItemStartingAt(state, line.from);
      if (!ownItem) {
        return { from: line.from, insert: unit };
      }

      const prevSibling = ownItem.prevSibling;
      if (!prevSibling || prevSibling.name !== 'ListItem') {
        return null;
      }

      const targetColumn = contentColumn(state, prevSibling);
      const needed = targetColumn - leadingSpaceCount(line.text);
      if (needed <= 0) {
        return null;
      }

      return { from: line.from, insert: ' '.repeat(needed) };
    })
    .filter((change): change is { from: number; insert: string } => change !== null);

  if (changes.length === 0) {
    return false;
  }

  dispatch(state.update({ changes, userEvent: 'input.indent.list' }));
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
