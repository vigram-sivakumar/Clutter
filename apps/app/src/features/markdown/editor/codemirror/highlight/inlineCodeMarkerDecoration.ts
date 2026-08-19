import type { Extension } from '@codemirror/state';

import { liveMarkDecoration, type MarkRangeSelector } from './liveMarkDecoration';

/**
 * Live Preview marker hiding for inline code spans (`` `code` ``), built
 * on the shared `liveMarkDecoration` mechanism (see its own doc comment
 * for the full rationale).
 *
 * `InlineCode` is base CommonMark, always parsed regardless of Clutter's
 * `extensions` configuration. Confirmed directly against the installed
 * `@lezer/markdown@1.7.2` source: its inline parser builds the node as a
 * single `elt(Type.InlineCode, start, end, [CodeMark, CodeMark])` call —
 * exactly two `CodeMark` children (the opening and closing backtick run)
 * and nothing else of its own, the same two-endpoints-only shape
 * `emphasisMarkerDecoration.ts` leans on. Unlike emphasis, CommonMark
 * never parses further inline markup inside a code span's content, so
 * there is no nested-construct case to consider here — only the backtick
 * run's length varies (`` ` ``, `` `` ``, ... — CommonMark's own rule for
 * letting literal backticks appear inside the span), which `firstChild`/
 * `lastChild` already handle correctly since they resolve positionally,
 * not by a fixed offset.
 */
const isInlineCodeNode = (nodeName: string): boolean => nodeName === 'InlineCode';

const getInlineCodeMarkRanges: MarkRangeSelector = (node) => {
  const openMark = node.node.firstChild;
  const closeMark = node.node.lastChild;
  if (!openMark || openMark.name !== 'CodeMark') {
    return [];
  }
  if (!closeMark || closeMark.name !== 'CodeMark') {
    return [];
  }

  return [
    { from: openMark.from, to: openMark.to },
    { from: closeMark.from, to: closeMark.to },
  ];
};

export function inlineCodeMarkerDecoration(): Extension {
  return liveMarkDecoration(isInlineCodeNode, getInlineCodeMarkRanges);
}
