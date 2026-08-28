import type { EditorState, Extension } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import {
  liveMarkDecoration,
  type MarkEngagementPredicate,
  type MarkRangeSelector,
} from '../highlight/liveMarkDecoration';
import { ListBulletWidget } from './ListBulletWidget';

/**
 * Live Preview rendering for **unordered/bullet** list markers (`-`, `*`,
 * `+`) — the first, deliberately narrow slice of list rendering. Ordered
 * lists, task checklists, and any editing-behavior work (Tab/Shift-Tab
 * beyond what `markdownIndentContext.ts` already resolves, structural
 * Backspace/Enter) are out of scope for this slice; see
 * docs/editor-architecture-decisions.md for that boundary.
 *
 * Built on the shared `liveMarkDecoration` mechanism — the same one
 * heading (`headingMarkerDecoration.ts`) uses — rather than a bespoke
 * `ViewPlugin`, per that file's own doc comment, which already names this
 * exact pairing ("a resting bullet glyph standing in for a hidden
 * `-`/`*`/`+` (see `listMarkerDecoration.ts`/`ListBulletWidget.ts`)") as
 * its anticipated caller. Reusing it means the tree walk, sorting of
 * possibly-nested collapsed ranges, and the click-boundary fix
 * (`liveMarkSelectionSnap`) are inherited for free, unchanged.
 *
 * `ListItem`'s `firstChild` is always `ListMark` (confirmed against the
 * installed `@lezer/markdown@1.7.2`, for bullet, ordered, and task markers
 * alike). This module only claims the ones whose marker text is `-`, `*`,
 * or `+` and whose item is not a task (`TaskList` is enabled at the
 * grammar level — v1-scoped — but checklist *rendering* is explicitly out
 * of scope this slice, so a `- [ ] …`/`- [x] …` item is left completely
 * unrendered here, exactly as an ordered item is).
 *
 * Nesting requires no special handling: a nested `ListItem` is visited by
 * the same tree walk as any other, entirely independently of its parent's
 * own marker decoration. Leading indentation before a nested marker is
 * already rendered by the construct-agnostic `leadingIndentDecoration.ts`
 * (per-character, any line, no syntax-tree awareness) — this module must
 * not, and does not, re-decorate that range a second time.
 */
function isBulletListItemNode(nodeName: string): boolean {
  return nodeName === 'ListItem';
}

const BULLET_MARKER_CHARACTERS: ReadonlySet<string> = new Set(['-', '*', '+']);

function hasTaskChild(listItem: SyntaxNode): boolean {
  for (let child = listItem.firstChild; child; child = child.nextSibling) {
    if (child.name === 'Task') {
      return true;
    }
  }
  return false;
}

/**
 * The delimiter whitespace between a marker and its content is never its
 * own syntax node (confirmed directly against the installed
 * `@lezer/markdown@1.7.2`: `ListMark`'s sibling is whichever real content
 * node follows — `Paragraph`, a nested `BulletList`, etc. — with an
 * unclaimed gap of raw whitespace between them). CommonMark allows 1-4
 * spaces there before the marker "gives up" and the line stops being that
 * item's own first line at all, so this walks the actual gap up to
 * whatever node comes next, rather than assuming exactly one space —
 * `-  Text`/`-   Text` (2/3-space separators) are valid, non-canonical
 * Markdown this must still conceal correctly, not leave a stray visible
 * space between the bullet and the text.
 *
 * Bounded to the marker's own physical line (`Math.min(to, line.to)`):
 * confirmed by direct inspection of a real parsed tree (`"-\n  - nested"`)
 * that `ListMark`'s next sibling can be a nested list starting on a
 * *later* line, with only whitespace (including the intervening `\n`)
 * physically between them — an ungated "whitespace-only gap" check would
 * misidentify that real line break as separator whitespace and try to
 * collapse it into this same-line widget. A separator span, by
 * definition, is CommonMark's own same-line marker-to-content gap only.
 */
function separatorRangeAfter(
  state: EditorState,
  marker: SyntaxNode
): { from: number; to: number } | null {
  const from = marker.to;
  const lineEnd = state.doc.lineAt(from).to;
  const to = Math.min(marker.nextSibling ? marker.nextSibling.from : from + 1, lineEnd, state.doc.length);

  if (to <= from) {
    return null;
  }

  const gapText = state.sliceDoc(from, to);
  return gapText.trim() === '' ? { from, to } : null;
}

const getBulletMarkRanges: MarkRangeSelector = (node, state) => {
  const marker = node.node.firstChild;
  if (!marker || marker.name !== 'ListMark') {
    return [];
  }

  const raw = state.sliceDoc(marker.from, marker.to);
  if (!BULLET_MARKER_CHARACTERS.has(raw) || hasTaskChild(node.node)) {
    return [];
  }

  /**
   * A bare marker with nothing after it on its own physical line (`-`,
   * cursor still mid-keystroke before the separator space is typed) is a
   * syntactically valid, complete, empty `ListItem` per CommonMark — the
   * parser is right to produce a `ListMark` for it (confirmed directly
   * against the installed `@lezer/markdown`: `ListMark[0,1)` for `"-"` is
   * byte-identical to `ListMark[0,1)` for `"- "`). But Clutter's Live
   * Preview should not visually replace it until the marker actually
   * *has* something after it — otherwise the very first keystroke of
   * typing a list item flashes a bullet before the user has finished
   * writing the marker. `separatorRangeAfter` already computes exactly
   * this signal (a real, same-line whitespace gap, or — via its own
   * `Math.min(..., lineEnd, ...)` clamp — correctly `null` when the only
   * thing "after" the marker is a sibling on a *later* line, e.g. a
   * same-line-bare parent immediately followed by a nested child list).
   * `separator === null` alone is sufficient here, with no separate
   * `!marker.nextSibling` check needed: CommonMark itself requires at
   * least one whitespace character between a marker and any real content
   * sibling on the same line (a marker with content directly adjacent —
   * zero gap — doesn't parse as a `ListMark` at all, per the same
   * grammar), so whenever a content sibling truly follows on this line,
   * `separatorRangeAfter` is guaranteed to find that whitespace and
   * return non-null; `null` therefore already means, completely, "there
   * is genuinely nothing — no separator, no content — after this marker
   * on its own line."
   */
  const separator = separatorRangeAfter(state, marker);
  if (!separator) {
    return [];
  }

  return [
    {
      from: marker.from,
      to: separator.to,
      widget: new ListBulletWidget(),
    },
  ];
};

/**
 * Engagement is deliberately its own predicate, not either of
 * `liveMarkDecoration.ts`'s two built-in modes:
 *
 * - `'physical-line'` (heading/blockquote's choice) would reveal the raw
 *   marker whenever the selection is *anywhere on the item's own line* —
 *   including deep inside the item's own text, which is exactly the
 *   behavior this predicate exists to avoid. Heading/blockquote need
 *   line-scoped engagement because their enclosing node's range isn't a
 *   reliable boundary (lazy continuation, nested children) — but a list
 *   marker's *own* range is fully sufficient once checked directly.
 * - `'node-range'` checks containment against the *enclosing* `ListItem`
 *   node's `[from, to)` — for a single-line item that's still the whole
 *   line (no improvement), and for an item with nested children it's
 *   worse (would reveal the parent's marker while editing a grandchild
 *   several lines down).
 *
 * So: a genuinely new predicate, using the existing escape hatch
 * (`MarkEngagementMode`'s function form), checked against the *marker's
 * own* mark range (`getMarkRanges`) — not a change to `liveMarkDecoration.ts`
 * itself, and not a change to `isTokenEngaged`'s shared boundary semantics
 * used by every other semantic-token construct.
 *
 * The overlap test is `selection.from < range.to && selection.to > range.from`
 * — deliberately NOT `isTokenEngaged`'s boundary-inclusive
 * `>=`/`<=` — because the one boundary position that matters here,
 * `- |Text` (a collapsed caret exactly at the marker range's own `to`,
 * immediately before the content), must NOT reveal: that position is
 * reached by ordinary cursor movement while editing the item's text (e.g.
 * Home, or arriving from the left), not an attempt to edit the marker.
 * `isTokenEngaged`'s inclusive convention exists for other constructs
 * where "touching the boundary" genuinely means "about to edit this
 * thing" (WikiLink, Tag, Date) — a list marker's trailing boundary is
 * different: it's also the leading edge of the sentence a user is
 * actively typing, which is the overwhelmingly common case, not a rare
 * one. A true interval-overlap check instead only engages when the
 * selection has at least one character of genuine overlap with the marker
 * range — a collapsed cursor strictly inside it (`- |-Text`-style,
 * between the dash and the separator, i.e. `from < pos < to`), or any
 * selection that spans into it (e.g. Home then Shift+Right, selecting the
 * marker's own first character) — while a cursor sitting at either exact
 * edge (`from` or `to`) alone does not.
 */
const isMarkerRangeEngaged: MarkEngagementPredicate = (state, node, getMarkRanges) => {
  const selection = state.selection.main;
  return getMarkRanges(node, state).some(
    (range) => selection.from < range.to && selection.to > range.from
  );
};

export function listMarkerDecoration(): Extension {
  return liveMarkDecoration(isBulletListItemNode, getBulletMarkRanges, isMarkerRangeEngaged);
}
