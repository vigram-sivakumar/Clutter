import type { Extension } from '@codemirror/state';

import { liveMarkDecoration, type MarkRangeSelector } from './liveMarkDecoration';

/**
 * Live Preview marker hiding for `==highlight==`, built on the shared
 * `liveMarkDecoration` mechanism — see `strikethroughMarkerDecoration.ts`'s
 * doc comment for the full rationale, which applies unchanged here:
 * `Highlight` resolves through the same delimiter mechanism as
 * `Strikethrough`/`Emphasis` (`highlightSyntax.ts`'s own `cx.addDelimiter`
 * call), so it always parses with exactly two `HighlightMark` children and
 * nothing else of its own, and composes with emphasis/strikethrough the
 * same way those already compose with each other.
 */
const isHighlightNode = (nodeName: string): boolean => nodeName === 'Highlight';

const getHighlightMarkRanges: MarkRangeSelector = (node) => {
  const openMark = node.node.firstChild;
  const closeMark = node.node.lastChild;
  if (!openMark || openMark.name !== 'HighlightMark') {
    return [];
  }
  if (!closeMark || closeMark.name !== 'HighlightMark') {
    return [];
  }

  return [
    { from: openMark.from, to: openMark.to },
    { from: closeMark.from, to: closeMark.to },
  ];
};

export function highlightMarkerDecoration(): Extension {
  return liveMarkDecoration(isHighlightNode, getHighlightMarkRanges);
}
