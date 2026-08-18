import type { Extension } from '@codemirror/state';

import { liveMarkDecoration, type MarkRangeSelector } from './liveMarkDecoration';

/**
 * Live Preview marker hiding for emphasis, built on the shared
 * `liveMarkDecoration` mechanism (see its own doc comment for the full
 * rationale: collapsing markers via `Decoration.replace` rather than CSS
 * `display: none`, which was confirmed by direct browser reproduction to
 * corrupt native click hit-testing and word-selection right at the
 * hidden/visible boundary).
 *
 * `Emphasis`/`StrongEmphasis` always parse with exactly two `EmphasisMark`
 * children — the opening and closing delimiter run — and nothing else of
 * their own (confirmed empirically against the installed
 * `@lezer/markdown`: inline text between them isn't itself a node), so
 * `firstChild`/`lastChild` reliably identify them, the same
 * two-endpoints-only shape `headingMarkerDecoration.ts` and
 * `wikiLinkMarkerDecorations.ts` both lean on. `***bold italic***` nests a
 * `StrongEmphasis` inside an `Emphasis` (or vice versa for underscores) —
 * each has its own range and is engaged/collapsed independently, so a
 * cursor inside the inner text engages both and reveals both delimiter
 * pairs together; a cursor beyond one boundary but still within the other
 * reveals only the relevant pair.
 */
const isEmphasisNode = (nodeName: string): boolean =>
  nodeName === 'Emphasis' || nodeName === 'StrongEmphasis';

const getEmphasisMarkRanges: MarkRangeSelector = (node) => {
  const openMark = node.node.firstChild;
  const closeMark = node.node.lastChild;
  if (!openMark || openMark.name !== 'EmphasisMark') {
    return [];
  }
  if (!closeMark || closeMark.name !== 'EmphasisMark') {
    return [];
  }

  return [
    { from: openMark.from, to: openMark.to },
    { from: closeMark.from, to: closeMark.to },
  ];
};

export function emphasisMarkerDecoration(): Extension {
  return liveMarkDecoration(isEmphasisNode, getEmphasisMarkRanges);
}
