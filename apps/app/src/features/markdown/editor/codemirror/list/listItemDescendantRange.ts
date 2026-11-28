import { syntaxTree } from '@codemirror/language';
import type { EditorState, Line } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { firstNonWhitespaceOffset, isIndentedPastColumn, resolveLineIndentContext } from '../indent/markdownIndentContext';

/**
 * Shared structural boundary for list editing. CommonMark lazy continuation
 * may extend a ListItem past its genuine descendants. Use the parsed node
 * as an upper bound, scan physical indentation and bridge blank lines.
 * Extracted unchanged from the retired list fold service; never creates a
 * fold or registers a folding extension.
 */
function enclosingListItem(state: EditorState, linePos: number): SyntaxNode | null {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(linePos, 1); node; node = node.parent) {
    if (node.name === 'ListItem') {
      return node;
    }
  }
  return null;
}

/** Genuine descendant range beyond the marker line, or null for a single-line item. */
export function computeListItemDescendantRange(state: EditorState, line: Line): { from: number; to: number } | null {
  const context = resolveLineIndentContext(state, line);
  if (context.kind !== 'list') {
    return null;
  }

  // The raw tree boundary — used only as an upper bound (never scanned
  // past it) so this correction can never claim more than the parser
  // itself considers part of this ListItem/Task node (e.g. two
  // consecutive blank lines genuinely end a list item's content per
  // CommonMark; the tree's own boundary already reflects that correctly,
  // this scan just never needs to know the rule itself, only respect it).
  // `null` here means the tree itself has nothing past the marker line —
  // no descendant range, same as this function's own final answer then.
  const node = enclosingListItem(state, line.from);
  if (!node || node.to <= line.to) {
    return null;
  }

  const ownIndent = firstNonWhitespaceOffset(line.text);
  const nativeToLine = state.doc.lineAt(Math.min(node.to, state.doc.length)).number;

  let lastDescendantLineNumber: number | null = null;
  for (let n = line.number + 1; n <= nativeToLine; n++) {
    const candidate = state.doc.line(n);
    if (candidate.text.trim() === '') {
      // Blank — bridges to a possible later genuine continuation, never
      // itself disqualifying and never itself counted as the boundary.
      continue;
    }
    if (isIndentedPastColumn(candidate, ownIndent)) {
      lastDescendantLineNumber = n;
      continue;
    }
    // A non-blank line at or below the marker's own indentation — either
    // a sibling item in the same list, or an unrelated top-level block
    // lazy-continuation glued onto this node. Never a genuine descendant.
    break;
  }

  if (lastDescendantLineNumber === null) {
    return null;
  }

  return { from: line.to, to: state.doc.line(lastDescendantLineNumber).to };
}

