import type { Extension } from '@codemirror/state';

import { liveMarkDecoration, type MarkRange, type MarkRangeSelector } from './liveMarkDecoration';
import { ListBulletWidget } from './ListBulletWidget';

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

/**
 * `-`/`*`/`+` are the only three GFM bullet markers (confirmed against the
 * installed `@lezer/markdown`'s `BulletList` parser) — anything else
 * `ListMark` matches is an ordered marker (`1.`, `2)`, …), which this
 * deliberately leaves alone: ordered-list rendering is unchanged for now.
 */
const BULLET_MARKERS: ReadonlySet<string> = new Set(['-', '*', '+']);

const getListMarkRanges: MarkRangeSelector = (node, state) => {
  const listMark = node.node.firstChild;
  if (!listMark || listMark.name !== 'ListMark') {
    return [];
  }

  const raw = state.sliceDoc(listMark.from, listMark.to);
  const isBullet = BULLET_MARKERS.has(raw);

  const ranges: MarkRange[] = [
    isBullet
      ? { from: listMark.from, to: listMark.to, widget: new ListBulletWidget() }
      : { from: listMark.from, to: listMark.to },
  ];

  // A bullet's separator space is left uncollapsed — real, visible
  // whitespace between the rendered `•` widget and the item's text, the
  // same gap `- ` already had. An ordered marker keeps the previous
  // hide-both behavior unchanged (no widget stands in for `1.`, so
  // nothing is left to create a gap against).
  if (!isBullet) {
    const separatorFrom = listMark.to;
    const separatorTo = separatorFrom + 1;
    if (separatorTo <= state.doc.length && state.sliceDoc(separatorFrom, separatorTo) === ' ') {
      ranges.push({ from: separatorFrom, to: separatorTo });
    }
  }

  return ranges;
};

export function listMarkerDecoration(): Extension {
  return liveMarkDecoration(isListItemNode, getListMarkRanges, 'physical-line');
}
