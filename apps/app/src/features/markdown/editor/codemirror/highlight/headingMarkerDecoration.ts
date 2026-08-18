import type { Extension } from '@codemirror/state';

import { liveMarkDecoration, type MarkRangeSelector } from './liveMarkDecoration';

/**
 * Live Preview marker hiding for ATX headings (`# `/`## `/etc.), built on
 * the shared `liveMarkDecoration` mechanism — see its own doc comment for
 * the full rationale. Supersedes the previous `headingSeparatorDecoration.ts`
 * (CSS `display: none` gated on `.cm-activeLine`), which had two problems
 * fixed here: (1) CSS-hiding a live DOM text node corrupts native click
 * hit-testing and word-selection right at the hidden/visible boundary,
 * confirmed by direct browser reproduction on the equivalent emphasis
 * case; (2) line granularity is coarser than every other construct in
 * this codebase (WikiLink, emphasis) — a heading only ever has one marker
 * run so the distinction rarely mattered in practice, but there's no
 * reason for headings to be the one construct on a different mechanism
 * from everything else.
 *
 * Only ATX headings (`ATXHeading1`-`6`) are covered, matching the
 * previous implementation's scope — Setext headings (`Heading\n===`)
 * have no comparable prefix marker to hide.
 *
 * Covers the one gap `markdownHighlightStyle.ts`'s `HighlightStyle` alone
 * cannot reach: `HeaderMark` (`#`/`##`/etc.) covers only the hash run
 * itself; the single CommonMark-required separator space after it
 * belongs to no node at all — confirmed directly against
 * `@lezer/markdown`'s own `ATXHeading` block parser: inline content
 * parsing explicitly starts one character past the hash run, with that
 * character written into neither `HeaderMark` nor the inline content. A
 * bare `#` at end of line (valid CommonMark, no title) has nothing after
 * the hash run — `getMarkRanges` only claims the separator when a real
 * space character is actually there, never assumed from node structure
 * alone.
 */
const HEADING_NODE_NAMES: ReadonlySet<string> = new Set([
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
]);

const isHeadingNode = (nodeName: string): boolean => HEADING_NODE_NAMES.has(nodeName);

const getHeadingMarkRanges: MarkRangeSelector = (node, state) => {
  const headerMark = node.node.firstChild;
  if (!headerMark || headerMark.name !== 'HeaderMark') {
    return [];
  }

  const ranges = [{ from: headerMark.from, to: headerMark.to }];

  const separatorFrom = headerMark.to;
  const separatorTo = separatorFrom + 1;
  if (separatorTo <= state.doc.length && state.sliceDoc(separatorFrom, separatorTo) === ' ') {
    ranges.push({ from: separatorFrom, to: separatorTo });
  }

  return ranges;
};

export function headingMarkerDecoration(): Extension {
  return liveMarkDecoration(isHeadingNode, getHeadingMarkRanges);
}
