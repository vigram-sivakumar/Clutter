import type { Extension } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import {
  liveMarkDecoration,
  type MarkEngagementPredicate,
  type MarkRange,
  type MarkRangeSelector,
} from './liveMarkDecoration';
import { ListBulletWidget } from './ListBulletWidget';
import { OrderedListMarkerWidget } from './OrderedListMarkerWidget';

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
 */
const isListItemNode = (nodeName: string): boolean => nodeName === 'ListItem';

/**
 * `-`/`*`/`+` are the only three GFM bullet markers (confirmed against the
 * installed `@lezer/markdown`'s `BulletList` parser) — anything else
 * `ListMark` matches is an ordered marker (`1.`, `2)`, …). Both kinds get a
 * resting widget below; this set only decides *which* widget class
 * (`ListBulletWidget` vs. `OrderedListMarkerWidget`) a given `ListMark`
 * renders as, so bullet and numbered markers can be styled independently
 * (`.cm-bullet-list-marker` vs. `.cm-list-number`) per product ask.
 */
const BULLET_MARKERS: ReadonlySet<string> = new Set(['-', '*', '+']);

/**
 * A `ListItem` wrapping a task (`ListItem → ListMark, Task → TaskMarker`,
 * confirmed against the installed `@lezer/markdown`'s `TaskList`
 * extension) is structurally distinguished from a plain `ListItem →
 * ListMark, Paragraph` by its second child's node *name* — `Task` vs.
 * `Paragraph` — never by re-inspecting source characters (`[ ]`/`[x]`)
 * this module has no business parsing; `taskEngagement.ts` already owns
 * that. Returns the `TaskMarker` node itself (not just a boolean) since
 * both call sites below need its exact range, not merely its presence.
 */
export function findTaskMarker(listItem: SyntaxNode): SyntaxNode | null {
  for (let child = listItem.firstChild; child; child = child.nextSibling) {
    if (child.name === 'Task') {
      const taskMarker = child.firstChild;
      return taskMarker && taskMarker.name === 'TaskMarker' ? taskMarker : null;
    }
  }
  return null;
}

const getListMarkRanges: MarkRangeSelector = (node, state) => {
  const listMark = node.node.firstChild;
  if (!listMark || listMark.name !== 'ListMark') {
    return [];
  }

  const raw = state.sliceDoc(listMark.from, listMark.to);
  const isBullet = BULLET_MARKERS.has(raw);
  const isTaskOwned = findTaskMarker(node.node) !== null;

  // A Task-owned ListMark never gets a resting widget — the checkbox is
  // the construct's sole rendered representation (see the module doc
  // comment above and taskCheckboxDecorations.ts). It hides entirely:
  // both itself and its separator space collapse to nothing, no widget
  // standing in for either. Every other ListMark — bullet or ordered —
  // gets its own widget, matching the numbered marker to the bullet's
  // already-established at-rest treatment.
  const getsWidget = !isTaskOwned;

  const ranges: MarkRange[] = [
    getsWidget
      ? {
          from: listMark.from,
          to: listMark.to,
          widget: isBullet ? new ListBulletWidget() : new OrderedListMarkerWidget(raw),
        }
      : { from: listMark.from, to: listMark.to },
  ];

  // A marker's separator space is left uncollapsed only when it actually
  // got a widget — real, visible whitespace between the rendered glyph
  // (`•` or `1.`) and the item's text, the same gap the raw marker already
  // had. The only remaining hide-both case is a Task-owned marker: no
  // widget stands in for it, so there's nothing to create a gap against.
  if (!getsWidget) {
    const separatorFrom = listMark.to;
    const separatorTo = separatorFrom + 1;
    if (separatorTo <= state.doc.length && state.sliceDoc(separatorFrom, separatorTo) === ' ') {
      ranges.push({ from: separatorFrom, to: separatorTo });
    }
  }

  return ranges;
};

/**
 * List markers (bullet, ordered, task) never reveal their raw Markdown on
 * cursor/line engagement — per product decision, they stay rendered as
 * their widget regardless of selection, falling back to plain text only
 * once the syntax tree itself stops recognizing the construct (deleting
 * the `.` from `1.`, or the required separator space, so it no longer
 * parses as a `ListMark`/`ListItem` at all — at which point there is no
 * node left for this predicate to even be asked about). `emojiListMarkDecoration.ts`
 * already behaves this way by construction (it never hides the glyph in
 * the first place); this predicate brings bullet/ordered/task in line
 * with it, rather than the previous engagement-revealing behavior.
 *
 * Exported so `listIndentWhitespaceDecoration.ts` can reuse the identical
 * "never" answer for whitespace immediately adjacent to a marker (leading
 * indentation before it, the separator after it): that whitespace has no
 * reason to reveal independently of a marker that itself never reveals.
 */
export const listItemEngagement: MarkEngagementPredicate = () => false;

export function listMarkerDecoration(): Extension {
  return liveMarkDecoration(isListItemNode, getListMarkRanges, listItemEngagement);
}
