import type { Extension } from '@codemirror/state';

import { liveMarkDecoration, type MarkRangeSelector } from './liveMarkDecoration';

/**
 * Live Preview marker hiding for GFM strikethrough (`~~text~~`), built on
 * the shared `liveMarkDecoration` mechanism (see its own doc comment for
 * the full rationale).
 *
 * `Strikethrough` is resolved through the same delimiter mechanism as
 * `Emphasis`/`StrongEmphasis` (confirmed directly against the installed
 * `@lezer/markdown@1.7.2` source: `Strikethrough`'s inline parser calls
 * `cx.addDelimiter(StrikethroughDelim, ...)`, the identical primitive
 * `Emphasis` itself is built on), so it always parses with exactly two
 * `StrikethroughMark` children — the opening and closing `~~` run — and
 * nothing else of its own, the same two-endpoints-only shape
 * `emphasisMarkerDecoration.ts`/`headingMarkerDecoration.ts` both lean on.
 * `firstChild`/`lastChild` resolve to those two marks regardless of what
 * (if anything) nests between them.
 *
 * `~~**bold**~~`/`**~~strike~~**` each nest one construct's node inside
 * the other's — every construct routed through `liveMarkDecoration` is
 * engaged/collapsed independently by its own `isConstructNode` predicate,
 * so this composes with emphasis exactly the way `***bold italic***`
 * already does for nested emphasis alone, and the way WikiLink-inside-
 * StrongEmphasis is already confirmed to compose
 * (`markdownLanguage.regression.test.ts`).
 */
const isStrikethroughNode = (nodeName: string): boolean => nodeName === 'Strikethrough';

const getStrikethroughMarkRanges: MarkRangeSelector = (node) => {
  const openMark = node.node.firstChild;
  const closeMark = node.node.lastChild;
  if (!openMark || openMark.name !== 'StrikethroughMark') {
    return [];
  }
  if (!closeMark || closeMark.name !== 'StrikethroughMark') {
    return [];
  }

  return [
    { from: openMark.from, to: openMark.to },
    { from: closeMark.from, to: closeMark.to },
  ];
};

export function strikethroughMarkerDecoration(): Extension {
  return liveMarkDecoration(isStrikethroughNode, getStrikethroughMarkRanges);
}
