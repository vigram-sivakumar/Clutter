import type { Extension } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { isTokenEngaged } from '../semanticToken/tokenEngagement';
import {
  isPhysicalLineEngaged,
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
 * "Cursor entered the Task line" and "TaskMarker is engaged" are two
 * different facts, and only the second should ever reveal this
 * `ListMark`. A Task-owned `ListMark`'s own engagement is therefore keyed
 * to its sibling `TaskMarker`'s own engagement (the exact same
 * `isTokenEngaged` containment query `semanticTokenDecorations` already
 * uses to decide the checkbox's own reveal) — not to physical-line
 * engagement, which would fire for a cursor anywhere on the task's text,
 * reveal the raw `-`, and leave the checkbox widget rendered next to it
 * (the reported mixed `- ☑ Task` state). Keying both the `ListMark` and
 * the `TaskMarker` to the identical condition is what guarantees they can
 * never disagree — not a UI patch after the fact.
 *
 * Every other `ListItem` (plain bullet or ordered) has no `Task` child,
 * so this falls through to the same `isPhysicalLineEngaged` rule the
 * generic `'physical-line'` mode already applies — unchanged.
 *
 * Exported so `listIndentWhitespaceDecoration.ts` can reuse the identical
 * predicate for whitespace immediately adjacent to a marker (leading
 * indentation before it, the separator after it): that whitespace's own
 * visibility must track *this specific marker's* current rendering mode,
 * not a second, independently-computed notion of "engaged" — generic
 * physical-line engagement disagrees with this predicate for Task items
 * specifically (confirmed: a cursor anywhere in a task's text keeps the
 * checkbox widget rendered per the TaskMarker-range check above, while
 * physical-line engagement alone would already report "engaged"), which
 * previously left task-adjacent whitespace decorations toggled
 * independently of the checkbox they sit next to.
 */
export const listItemEngagement: MarkEngagementPredicate = (state, node, getMarkRanges) => {
  const taskMarker = findTaskMarker(node.node);
  if (taskMarker) {
    return isTokenEngaged(state, { from: taskMarker.from, to: taskMarker.to });
  }

  return isPhysicalLineEngaged(state, getMarkRanges(node, state));
};

export function listMarkerDecoration(): Extension {
  return liveMarkDecoration(isListItemNode, getListMarkRanges, listItemEngagement);
}
