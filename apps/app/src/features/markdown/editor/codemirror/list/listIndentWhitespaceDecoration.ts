import type { Extension } from '@codemirror/state';

import {
  liveMarkDecoration,
  type MarkRange,
  type MarkRangeSelector,
} from '../highlight/liveMarkDecoration';

/**
 * Visually collapses the raw leading whitespace that sits before a nested
 * list marker (`ListMark`/`EmojiListMark`) at rest, without touching the
 * document — the CommonMark-required source indentation stays exactly as
 * typed. That whitespace belongs to no syntax node of its own (confirmed
 * by direct inspection of the parsed tree: a nested `ListItem`'s range
 * starts at or after its own marker, never at the physical line's true
 * start), so it renders as ordinary proportional-font text unless
 * something collapses it — additive on top of `.cm-list-line`'s own
 * `padding-left` (`listLineDecoration.ts`/`MarkdownEditor.css`), which is
 * exactly the unwanted gap this module removes.
 *
 * Deliberately a separate module from `listMarkerDecoration.ts` rather
 * than folded into it: that module owns *marker* rendering (the glyph a
 * `ListMark`/`EmojiListMark` becomes at rest), a different, unrelated
 * concern from neutralizing the raw text that happens to precede it —
 * the same granularity already established by `emojiListMarkDecoration.ts`
 * existing as its own independent module rather than a branch inside
 * `listMarkerDecoration.ts`.
 *
 * Built on the same shared `liveMarkDecoration` collapse/engagement
 * mechanism every other Live-Preview marker in this codebase already uses
 * — `Decoration.replace({})`, no widget, the same mechanism (and the same
 * `.cm-widgetBuffer` cursor-placement handling that comes with it) already
 * proven safe in production for `listMarkerDecoration.ts`'s own
 * Task-owned-`ListMark` collapse-to-nothing case.
 */
const isListItemNode = (nodeName: string): boolean => nodeName === 'ListItem';

/**
 * The Lezer node names that open a `ListItem` — see
 * `listIndentKeymap.ts`'s identical set for the same confirmed-by-
 * inspection rationale: `ListMark` for bullet/ordered/task items,
 * `EmojiListMark` for Clutter's own emoji-list extension.
 */
const LIST_MARKER_NODE_NAMES: ReadonlySet<string> = new Set(['ListMark', 'EmojiListMark']);

/**
 * The candidate collapse range is `[line.from, marker.from)` — everything
 * on the marker's own physical line before the marker itself. That range
 * is only ever actually collapsed once it's proven to contain nothing but
 * whitespace: a marker nested inside another construct that itself
 * occupies the start of the line (a list inside a blockquote, `> - item`,
 * where `line.from` lands on the blockquote's own `>`) would otherwise
 * have that unrelated construct's own marker swallowed along with the
 * intended indentation — confirmed as a real, not hypothetical, collision
 * by direct inspection of the parsed tree for exactly that input. An empty
 * range (a marker with no leading whitespace at all, e.g. a top-level
 * item) is likewise never collapsed — there is nothing to hide.
 */
const getLeadingWhitespaceRanges: MarkRangeSelector = (node, state) => {
  const marker = node.node.firstChild;
  if (!marker || !LIST_MARKER_NODE_NAMES.has(marker.name)) {
    return [];
  }

  const line = state.doc.lineAt(marker.from);
  const gapFrom = line.from;
  const gapTo = marker.from;

  if (gapTo <= gapFrom) {
    return [];
  }

  const gapText = state.sliceDoc(gapFrom, gapTo);
  if (gapText.trim() !== '') {
    return [];
  }

  const range: MarkRange = { from: gapFrom, to: gapTo };
  return [range];
};

export function listIndentWhitespaceDecoration(): Extension {
  // `'physical-line'` — the same underlying `isPhysicalLineEngaged` check
  // `listMarkerDecoration.ts`'s own `listItemEngagement` falls through to
  // for every non-Task `ListItem` — so the leading whitespace reveals
  // exactly when its own marker's line is engaged, never a second,
  // independently-defined notion of "engaged". The Task-specific
  // TaskMarker-engagement override that predicate also carries doesn't
  // apply here: raw indentation exists identically whether or not the
  // item is a task, so there is nothing task-specific for this module to
  // special-case.
  return liveMarkDecoration(isListItemNode, getLeadingWhitespaceRanges, 'physical-line');
}
