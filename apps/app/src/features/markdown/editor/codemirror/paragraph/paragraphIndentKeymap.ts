import { indentLess, indentMore } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import type { EditorState, StateCommand } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { selectedLines } from '../list/listIndentKeymap';

/**
 * Tab/Shift-Tab for plain paragraphs — editor/text indentation, not a
 * Markdown tree-nesting operation. Unlike `listIndentKeymap.ts`, this
 * intentionally does *not* invent its own indentation mechanism: once a
 * line is confirmed to be plain-paragraph context (below), the actual
 * indent/outdent is CodeMirror's own `indentMore`/`indentLess`
 * (`@codemirror/commands`) — the same per-selected-line, one-`indentUnit`
 * primitive CM6's own `indentWithTab` binding is built on. Both already
 * always return `true` (confirmed by reading the installed
 * `@codemirror/commands` source), so once this module decides a selection
 * is its context to own, Tab/Shift-Tab are always consumed — including
 * the "Shift-Tab at zero indentation" case, which is simply a dispatch
 * with an empty changeset, not a special case to detect separately.
 *
 * Deliberately a fully independent command from `indentListItem`/
 * `dedentListItem` — no shared "indentation engine," per the milestone's
 * architecture: the only thing the two commands share is the tiny
 * `selectedLines` primitive (which lines does the selection touch), not
 * any notion of what indenting *means*.
 */

/**
 * Block-level node names whose lines this module must never treat as
 * "plain paragraph," even though they may contain (or be adjacent to) a
 * `Paragraph` node of their own: a `ListItem`'s own paragraph content is
 * owned by the list (structural indent, handled entirely by
 * `listIndentKeymap.ts` — tried first by `markdownTabKeymap.ts`, so this
 * module is only ever reached once list ownership has already been ruled
 * out); `Blockquote`/`Table*`/`FencedCode`/`CodeBlock` are explicitly out
 * of scope for this milestone and must fall through unhandled rather than
 * accidentally receiving generic paragraph indentation.
 */
const DISQUALIFYING_ANCESTORS: ReadonlySet<string> = new Set([
  'ListItem',
  'Blockquote',
  'Table',
  'TableHeader',
  'TableRow',
  'TableCell',
  'FencedCode',
  'CodeBlock',
]);

function leadingSpaceCount(lineText: string): number {
  return lineText.length - lineText.trimStart().length;
}

/**
 * The enclosing `Paragraph` node for the position, or `null` if the
 * position isn't plain-paragraph context at all — either because no
 * `Paragraph` node contains it (a heading, a horizontal rule, blank
 * space between blocks) or because a disqualifying ancestor sits between
 * the position and the document root (see `DISQUALIFYING_ANCESTORS`).
 * Inline constructs (WikiLink, Tag, Date, emphasis, inline code, …) are
 * never checked directly — they all live *inside* a `Paragraph`'s own
 * range, so resolving up from any position inside one reaches the same
 * enclosing `Paragraph` a plain-text position would, with no special
 * casing needed for any particular inline kind.
 */
function paragraphContextAt(state: EditorState, pos: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  let paragraph: SyntaxNode | null = null;
  for (; node; node = node.parent) {
    if (DISQUALIFYING_ANCESTORS.has(node.name)) {
      return null;
    }
    if (node.name === 'Paragraph' && !paragraph) {
      paragraph = node;
    }
  }
  return paragraph;
}

function probePos(line: { from: number; text: string }): number {
  const indent = leadingSpaceCount(line.text);
  return indent < line.text.length ? line.from + indent : line.from;
}

/**
 * Every selected line must independently resolve to plain-paragraph
 * context — the same all-or-nothing gate `listIndentKeymap.ts` uses, for
 * the identical reason: a selection that mixes paragraph lines with
 * list/quote/table/code lines isn't cleanly this command's context, so it
 * defers rather than indenting only part of what's selected.
 */
function selectionIsPlainParagraph(state: EditorState): boolean {
  const lines = selectedLines(state);
  return lines.length > 0 && lines.every((line) => paragraphContextAt(state, probePos(line)) !== null);
}

export const indentParagraph: StateCommand = (target) => {
  if (!selectionIsPlainParagraph(target.state)) {
    return false;
  }
  return indentMore(target);
};

export const dedentParagraph: StateCommand = (target) => {
  if (!selectionIsPlainParagraph(target.state)) {
    return false;
  }
  return indentLess(target);
};
