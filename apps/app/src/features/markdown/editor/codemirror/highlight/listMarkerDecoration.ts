import type { Extension } from '@codemirror/state';

import { liveMarkDecoration, type MarkRangeSelector } from './liveMarkDecoration';

/**
 * Live Preview marker hiding for list item prefixes (`- `/`* `/`+ `/`1. `),
 * built on the shared `liveMarkDecoration` mechanism — see
 * `headingMarkerDecoration.ts`'s doc comment for the full rationale.
 *
 * `ListItem`'s `firstChild` is always `ListMark` (confirmed directly
 * against the installed `@lezer/markdown@1.7.2`: bullet and ordered
 * markers alike), the same single-fixed-position shape heading/emphasis/
 * strikethrough already rely on — so this reuses `headingMarkerDecoration`'s
 * separator-space check verbatim rather than inventing a new one.
 *
 * Nested lists need no special handling here: the indentation before a
 * nested `ListItem`'s own `ListMark` is plain document text belonging to
 * no node at all, so it's never touched by `getMarkRanges` and is
 * preserved automatically, not by any logic specific to nesting.
 *
 * Deliberately excludes `TaskMarker` (`[ ]`/`[x]`) — task checkbox
 * interaction is out of scope for this milestone; only the list bullet/
 * number prefix is hidden, the checkbox markup is left untouched.
 */
const isListItemNode = (nodeName: string): boolean => nodeName === 'ListItem';

const getListMarkRanges: MarkRangeSelector = (node, state) => {
  const listMark = node.node.firstChild;
  if (!listMark || listMark.name !== 'ListMark') {
    return [];
  }

  const ranges = [{ from: listMark.from, to: listMark.to }];

  const separatorFrom = listMark.to;
  const separatorTo = separatorFrom + 1;
  if (separatorTo <= state.doc.length && state.sliceDoc(separatorFrom, separatorTo) === ' ') {
    ranges.push({ from: separatorFrom, to: separatorTo });
  }

  return ranges;
};

export function listMarkerDecoration(): Extension {
  return liveMarkDecoration(isListItemNode, getListMarkRanges);
}
