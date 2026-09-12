import { syntaxTree } from '@codemirror/language';
import type { EditorState, Line } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { firstNonWhitespaceOffset, resolveLineIndentContext } from '../indent/markdownIndentContext';

/**
 * Node names that group their own content tightly (6px) rather than at
 * normal document-level spacing (12px).
 */
const GROUPING_NODE_NAMES = new Set(['BulletList', 'OrderedList', 'Blockquote']);

/**
 * Node names whose own interior gets zero spacing from this system —
 * the construct's own rendering owns its internals completely. Both
 * `Table` and `FencedCode` are safe to include uniformly here: unlike an
 * earlier padding-class-based version of this system, block *widgets*
 * never touch a `.cm-line`'s own CSS properties, so there is no
 * collision with `FencedCode`'s existing `--first`/`--last` card-inset
 * padding (`fencedCodeBlockLineDecoration.ts`) — confirmed directly by
 * live-rendering comparison before this system was built this way. That
 * collision was the reason an earlier version had to special-case
 * `FencedCode`'s entry boundary; no such special-casing is needed here.
 */
const ATOMIC_NODE_NAMES = new Set(['Table', 'FencedCode']);

export type SeparatorHeight = 12 | 6 | 0;

/** The document position used to resolve a physical line's own owning syntax nodes — its first non-whitespace character, so leading indentation never resolves into the wrong nesting level. */
export function lineProbePos(state: EditorState, lineNumber: number): number {
  const line = state.doc.line(lineNumber);
  return line.from + firstNonWhitespaceOffset(line.text);
}

/**
 * `pos`'s own chain of grouping/atomic ancestors, innermost first. Only
 * `GROUPING_NODE_NAMES`/`ATOMIC_NODE_NAMES` nodes are collected — every
 * other node (`Paragraph`, `ListItem`, headings, etc.) is transparent to
 * this system today. This is also the extension point for future
 * hierarchy-aware rules (e.g. a heading wanting a different separator
 * above/below it): a future version can walk `pos`'s *full* ancestor
 * chain (not just grouping/atomic nodes) and let {@link resolveBoundaryHeight}
 * inspect node names/levels directly, without changing how boundaries
 * are found or how many separators are emitted — only the height each
 * boundary resolves to.
 */
function scopeChain(state: EditorState, pos: number): SyntaxNode[] {
  const chain: SyntaxNode[] = [];
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  for (; node; node = node.parent) {
    if (GROUPING_NODE_NAMES.has(node.name) || ATOMIC_NODE_NAMES.has(node.name)) {
      chain.push(node);
    }
  }
  return chain;
}

function sameNode(a: SyntaxNode, b: SyntaxNode): boolean {
  return a.name === b.name && a.from === b.from && a.to === b.to;
}

/**
 * The spacing for a boundary between two document positions, `prevPos`
 * (the earlier side) and `pos` (the later side). Used identically for
 * two kinds of boundaries — between two physical lines, and between a
 * same-line `Image`/`Embed` and the text flanking it — because the rule
 * only depends on syntax-tree scope, never on whether the two positions
 * happen to be on the same physical line or different ones.
 *
 * Finds the *nearest common* grouping/atomic ancestor of the two
 * positions by walking `pos`'s own chain (innermost first) and returning
 * the first entry that also appears anywhere in `prevPos`'s chain:
 *
 * - Both positions inside the *same* List/Blockquote/Table/FencedCode (at
 *   any nesting depth — a parent item and its own nested list share the
 *   *outer* list as their nearest common ancestor, which is what keeps a
 *   nested list visually grouped with its parent rather than jumping to
 *   12px) → 6 (List/Blockquote) or 0 (Table/FencedCode).
 * - One position inside a construct the other isn't in at all (crossing
 *   the construct's own boundary in either direction) → no common
 *   ancestor found → 12, which is exactly "spacing before/after the
 *   whole construct" — the same rule that produces normal spacing
 *   between two ordinary paragraphs, with nothing extra required for the
 *   entering/exiting case specifically.
 * - Neither position is inside any grouping/atomic construct at all
 *   (ordinary paragraph text, including multiple physical lines of one
 *   `Paragraph` node, and blank lines) → 12, unconditionally — this is
 *   what keeps spacing based on physical lines rather than Markdown's
 *   own `Paragraph` grouping, and is why filling a blank line never
 *   changes anything: the line count doesn't change, so the comparison
 *   never has a different answer just because the parser now sees one
 *   `Paragraph` instead of two.
 */
export function resolveBoundaryHeight(state: EditorState, prevPos: number, pos: number): SeparatorHeight {
  const prevChain = scopeChain(state, prevPos);
  const chain = scopeChain(state, pos);

  for (const node of chain) {
    if (prevChain.some((candidate) => sameNode(candidate, node))) {
      return ATOMIC_NODE_NAMES.has(node.name) ? 0 : 6;
    }
  }
  return 12;
}
