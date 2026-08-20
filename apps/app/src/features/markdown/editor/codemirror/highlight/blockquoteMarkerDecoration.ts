import type { EditorState, Extension } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import type { TokenNodeRange } from '../semanticToken/tokenEngagement';
import { liveMarkDecoration, type MarkRangeSelector } from './liveMarkDecoration';

/**
 * Live Preview marker hiding for `>` blockquote markers, built on the
 * shared `liveMarkDecoration` mechanism — see `headingMarkerDecoration.ts`'s
 * doc comment for the full rationale.
 *
 * Unlike heading/emphasis/list (a single fixed-position marker per node),
 * `Blockquote` is a genuinely multi-line shape, confirmed directly against
 * the installed `@lezer/markdown@1.7.2`:
 * - Only the *first* line's `QuoteMark` is a direct child of `Blockquote`.
 * - A continuation line's `QuoteMark` (CommonMark's lazy-continuation rule)
 *   is nested one level deeper, as a child of the `Paragraph` that line's
 *   text belongs to — not a sibling of the first `QuoteMark`.
 * - A nested `>>` quote is a genuinely separate, nested `Blockquote` node
 *   with its own `QuoteMark` child. It is visited independently by
 *   `liveMarkDecoration`'s own tree walk (since it matches `isConstructNode`
 *   too), so this function must stop at a nested `Blockquote` rather than
 *   descend into it — descending would collect the same marks twice, once
 *   from the outer call and once from the inner node's own.
 *
 * So `getMarkRanges` here only walks `node`'s *direct* children, plus one
 * level into a direct `Paragraph` child (the only place CommonMark's lazy
 * continuation can put a same-level `QuoteMark`) — not a general recursive
 * descendant search. A blockquote containing other block types (a nested
 * list, a code fence) is not handled by this pass; scoped out as a known
 * gap rather than expanded silently.
 */
const isBlockquoteNode = (nodeName: string): boolean => nodeName === 'Blockquote';

function withSeparator(mark: SyntaxNode, state: EditorState, ranges: TokenNodeRange[]): void {
  ranges.push({ from: mark.from, to: mark.to });

  const separatorFrom = mark.to;
  const separatorTo = separatorFrom + 1;
  if (separatorTo <= state.doc.length && state.sliceDoc(separatorFrom, separatorTo) === ' ') {
    ranges.push({ from: separatorFrom, to: separatorTo });
  }
}

const getBlockquoteMarkRanges: MarkRangeSelector = (node, state) => {
  const ranges: TokenNodeRange[] = [];

  for (let child = node.node.firstChild; child; child = child.nextSibling) {
    if (child.name === 'QuoteMark') {
      withSeparator(child, state, ranges);
      continue;
    }

    if (child.name === 'Blockquote') {
      // A nested quote is a separate construct, handled by its own pass.
      continue;
    }

    // Lazy continuation: a later line's `QuoteMark` lands inside the
    // Paragraph its text belongs to, one level deeper than the first
    // line's own `QuoteMark`.
    for (let grandchild = child.firstChild; grandchild; grandchild = grandchild.nextSibling) {
      if (grandchild.name === 'QuoteMark') {
        withSeparator(grandchild, state, ranges);
      }
    }
  }

  return ranges;
};

export function blockquoteMarkerDecoration(): Extension {
  return liveMarkDecoration(isBlockquoteNode, getBlockquoteMarkRanges);
}
