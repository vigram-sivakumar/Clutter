import type { Extension } from '@codemirror/state';

import { liveMarkDecoration, type MarkRangeSelector } from './liveMarkDecoration';

/**
 * Live Preview marker hiding for ATX headings (`# `/`## `/etc.) and Setext
 * headings (`Heading\n===`/`Heading\n---`), built on the shared
 * `liveMarkDecoration` mechanism — see its own doc comment for the full
 * rationale. Supersedes the previous `headingSeparatorDecoration.ts` (CSS
 * `display: none` gated on `.cm-activeLine`), which had two problems fixed
 * here: (1) CSS-hiding a live DOM text node corrupts native click
 * hit-testing and word-selection right at the hidden/visible boundary,
 * confirmed by direct browser reproduction on the equivalent emphasis
 * case; (2) line granularity is coarser than every other construct in
 * this codebase (WikiLink, emphasis) — a heading only ever has one marker
 * run so the distinction rarely mattered in practice, but there's no
 * reason for headings to be the one construct on a different mechanism
 * from everything else.
 *
 * Setext headings were originally scoped out here under the belief they
 * had "no comparable prefix marker to hide" — that was inaccurate.
 * `@lezer/markdown`'s `SetextHeadingParser` (`node_modules/@lezer/markdown/
 * dist/index.js`) produces a `SetextHeading1`/`SetextHeading2` node whose
 * children are `[...inline content of the text line, HeaderMark]` — the
 * *entire underline line* is a `HeaderMark`, just the last child instead
 * of ATX's first. Leaving it unhidden meant the underline row was both
 * (a) permanently visible as raw `===`/`---` text, at rest or not, and
 * (b) styled at full heading font-size, since `tags.heading1`/`heading2`
 * apply to the whole node span with no marker exemption — the mechanism
 * behind the "line briefly balloons to heading size while typing `==`/`-`
 * at the start of a line" symptom. Hiding the underline `HeaderMark` the
 * same way ATX's prefix is hidden brings Setext to parity and removes
 * that visible artifact, without touching parsing, engagement semantics,
 * or the (intentional, matches ATX) transient heading-size preview of the
 * text line above while the underline is still being typed.
 *
 * Covers the one gap `markdownHighlightStyle.ts`'s `HighlightStyle` alone
 * cannot reach for ATX: `HeaderMark` (`#`/`##`/etc.) covers only the hash
 * run itself; the single CommonMark-required separator space after it
 * belongs to no node at all — confirmed directly against
 * `@lezer/markdown`'s own `ATXHeading` block parser: inline content
 * parsing explicitly starts one character past the hash run, with that
 * character written into neither `HeaderMark` nor the inline content. A
 * bare `#` at end of line (valid CommonMark, no title) has nothing after
 * the hash run — `getMarkRanges` only claims the separator when a real
 * space character is actually there, never assumed from node structure
 * alone. Setext's `HeaderMark` needs no equivalent separator handling: it
 * already spans the entire underline line, trailing spaces included.
 */
const ATX_HEADING_NODE_NAMES: ReadonlySet<string> = new Set([
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
]);

const SETEXT_HEADING_NODE_NAMES: ReadonlySet<string> = new Set([
  'SetextHeading1',
  'SetextHeading2',
]);

const isHeadingNode = (nodeName: string): boolean =>
  ATX_HEADING_NODE_NAMES.has(nodeName) || SETEXT_HEADING_NODE_NAMES.has(nodeName);

const getHeadingMarkRanges: MarkRangeSelector = (node, state) => {
  if (SETEXT_HEADING_NODE_NAMES.has(node.name)) {
    const underlineMark = node.node.lastChild;
    if (!underlineMark || underlineMark.name !== 'HeaderMark') {
      return [];
    }
    return [{ from: underlineMark.from, to: underlineMark.to }];
  }

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
