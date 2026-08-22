import type { EditorState, Extension } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import {
  findTaskMarker,
  listItemEngagement,
} from '../highlight/listMarkerDecoration';
import {
  liveMarkDecoration,
  type MarkRange,
  type MarkRangeSelector,
} from '../highlight/liveMarkDecoration';

/**
 * Visually collapses two kinds of raw Markdown whitespace around a list
 * marker at rest, without touching the document — both stay exactly as
 * typed in `state.doc`; this is rendering-only:
 *
 *  - the raw leading indentation *before* a nested marker
 *    (`ListMark`/`EmojiListMark`), additive on top of `.cm-list-line`'s own
 *    `padding-left` (`listLineDecoration.ts`/`MarkdownEditor.css`);
 *  - the raw separator space *after* a marker — the CommonMark-required
 *    delimiter between `-`/`1.`/`[ ]`/`🔥` and the item's content — which
 *    otherwise renders as ordinary text between the marker widget and the
 *    text, adding its own width on top of the marker-widget-only hanging
 *    indent (`MarkdownEditor.css`'s `text-indent: calc(-1 * --marker-size)`
 *    accounts for the marker's box alone, never for this extra character).
 *
 * Neither belongs to any syntax node of its own (confirmed by direct
 * inspection of the parsed tree for both), so both render as ordinary
 * proportional-font text unless something collapses them.
 *
 * Deliberately a separate module from `listMarkerDecoration.ts` rather
 * than folded into it: that module owns *marker* rendering (the glyph a
 * `ListMark`/`EmojiListMark`/`TaskMarker` becomes at rest), a different,
 * unrelated concern from neutralizing the raw text immediately around it —
 * the same granularity already established by `emojiListMarkDecoration.ts`
 * existing as its own independent module rather than a branch inside
 * `listMarkerDecoration.ts`.
 *
 * Built on the same shared `liveMarkDecoration` collapse mechanism every
 * other Live-Preview marker in this codebase already uses —
 * `Decoration.replace({})`, no widget, the same mechanism (and the same
 * `.cm-widgetBuffer` cursor-placement handling that comes with it) already
 * proven safe in production for `listMarkerDecoration.ts`'s own
 * Task-owned-`ListMark` collapse-to-nothing case.
 *
 * Engagement is `listItemEngagement` — imported from
 * `listMarkerDecoration.ts`, never a second, independently-defined notion
 * of "engaged" — so this whitespace always tracks whatever that module
 * decides for the marker it sits next to. Per product decision, list
 * markers never reveal raw Markdown on cursor/line engagement
 * (`listItemEngagement` always reports "not engaged" now), so both the
 * leading and separator ranges here stay collapsed unconditionally too —
 * there is no marker-revealed state left for them to need to match. The
 * only way either becomes visible again is the same way the marker itself
 * does: the syntax tree stops recognizing the construct at all (a broken
 * `.`, a missing separator space, …), at which point `getMarkerWhitespaceRanges`
 * below is never even called for that position.
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
 * The whitespace strictly between `node`'s own end and wherever its
 * content actually starts — `node.nextSibling`'s own start position, the
 * same tree-derived "content column" `listIndentKeymap.ts`'s
 * `contentColumn()` already relies on, rather than a fixed one-character
 * offset: a separator isn't always exactly one space (CommonMark tolerates
 * more, up to the marker's own indent threshold), and anchoring to the
 * real next sibling handles any width by construction. Falls back to one
 * column past `node`'s own end (bounded by the document's length) only
 * when there's no next sibling at all — an empty item with nothing typed
 * after its marker yet.
 */
function separatorRangeAfter(state: EditorState, node: SyntaxNode): MarkRange | null {
  const from = node.to;
  const to = node.nextSibling ? node.nextSibling.from : Math.min(from + 1, state.doc.length);

  if (to <= from) {
    return null;
  }

  const gapText = state.sliceDoc(from, to);
  if (gapText.trim() !== '') {
    return null;
  }

  return { from, to };
}

/**
 * The candidate leading-indentation range is `[line.from, marker.from)` —
 * everything on the marker's own physical line before the marker itself.
 * That range is only ever actually collapsed once it's proven to contain
 * nothing but whitespace: a marker nested inside another construct that
 * itself occupies the start of the line (a list inside a blockquote,
 * `> - item`, where `line.from` lands on the blockquote's own `>`) would
 * otherwise have that unrelated construct's own marker swallowed along
 * with the intended indentation — confirmed as a real, not hypothetical,
 * collision by direct inspection of the parsed tree for exactly that
 * input. An empty range (a marker with no leading whitespace at all, e.g.
 * a top-level item) is likewise never collapsed — there is nothing to
 * hide.
 *
 * The separator range is anchored to whichever node the reader actually
 * sees as "the marker" at rest: a Task-owned `ListItem`'s own `ListMark`
 * (and that `ListMark`'s own separator) already collapse unconditionally
 * via `listMarkerDecoration.ts` — the checkbox (`TaskMarker`) is that
 * construct's sole rendered representation, so the separator this module
 * cares about for a task is the one *after* the checkbox, not after the
 * already-hidden `-`.
 */
const getMarkerWhitespaceRanges: MarkRangeSelector = (node, state) => {
  const marker = node.node.firstChild;
  if (!marker || !LIST_MARKER_NODE_NAMES.has(marker.name)) {
    return [];
  }

  const ranges: MarkRange[] = [];

  const line = state.doc.lineAt(marker.from);
  const leadingFrom = line.from;
  const leadingTo = marker.from;
  if (leadingTo > leadingFrom) {
    const leadingText = state.sliceDoc(leadingFrom, leadingTo);
    if (leadingText.trim() === '') {
      ranges.push({ from: leadingFrom, to: leadingTo });
    }
  }

  const taskMarker = findTaskMarker(node.node);
  const separator = separatorRangeAfter(state, taskMarker ?? marker);
  if (separator) {
    ranges.push(separator);
  }

  return ranges;
};

export function listIndentWhitespaceDecoration(): Extension {
  return liveMarkDecoration(isListItemNode, getMarkerWhitespaceRanges, listItemEngagement);
}
