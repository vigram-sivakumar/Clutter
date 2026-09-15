import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { firstNonWhitespaceOffset, isIndentedPastColumn, resolveLineIndentContext } from '../indent/markdownIndentContext';

/**
 * Node names that group their own content tightly (6px) rather than at
 * normal document-level spacing (12px).
 */
const GROUPING_NODE_NAMES = new Set(['BulletList', 'OrderedList', 'Blockquote']);

/**
 * Node names whose own interior gets zero spacing from this system —
 * the construct's own rendering owns its internals completely. Both
 * `Table` and `FencedCode` are safe to include uniformly here: unlike an
 * earlier padding-class-based version of this system, block *widgets*
 * never touch a `.cm-line`'s own CSS properties, so there is no
 * collision with `FencedCode`'s existing `--first`/`--last` card-inset
 * padding (`fencedCodeBlockLineDecoration.ts`) — confirmed directly by
 * live-rendering comparison before this system was built this way. That
 * collision was the reason an earlier version had to special-case
 * `FencedCode`'s entry boundary; no such special-casing is needed here.
 */
const ATOMIC_NODE_NAMES = new Set(['Table', 'FencedCode']);

/**
 * The separator height owed *above* a heading's own first physical line,
 * keyed by the exact Lezer node name — verified directly against
 * `@lezer/markdown` (not guessed) via this codebase's own existing
 * consumers of these same node names: `headingMarkerDecoration.ts` (ATX's
 * `HeaderMark` marker-hiding) and `markdownIndentContext.ts` (Tab/Shift-Tab's
 * `heading` line kind) both already enumerate exactly these eight names —
 * `ATXHeading1`–`ATXHeading6` for `#`–`######`, and `SetextHeading1`/
 * `SetextHeading2` for the `===`/`---`-underlined form. Setext headings
 * are genuine heading participants here for the same reason
 * `headingMarkerDecoration.ts` already treats them as first-class
 * headings (see that file's own doc comment): the editor already renders
 * and engages them identically to ATX, so excluding them from this rule
 * would be an inconsistency, not a simplification. Levels 4–6 share one
 * height (18) per the product requirement — there is no level 7+ in
 * CommonMark, so this map is exhaustive.
 */
const HEADING_ENTRY_HEIGHT_BY_NODE_NAME: ReadonlyMap<string, SeparatorHeight> = new Map([
  ['ATXHeading1', 36],
  ['SetextHeading1', 36],
  ['ATXHeading2', 30],
  ['SetextHeading2', 30],
  ['ATXHeading3', 24],
  ['ATXHeading4', 18],
  ['ATXHeading5', 18],
  ['ATXHeading6', 18],
]);

export type SeparatorHeight = 36 | 30 | 24 | 18 | 12 | 6 | 0;

/** The document position used to resolve a physical line's own owning syntax nodes — its first non-whitespace character, so leading indentation never resolves into the wrong nesting level. */
export function lineProbePos(state: EditorState, lineNumber: number): number {
  const line = state.doc.line(lineNumber);
  return line.from + firstNonWhitespaceOffset(line.text);
}

/**
 * `pos`'s own chain of grouping/atomic ancestors, innermost first. Only
 * `GROUPING_NODE_NAMES`/`ATOMIC_NODE_NAMES` nodes are collected — every
 * other node (`Paragraph`, `ListItem`, headings, etc.) is transparent to
 * *this particular* chain-comparison mechanism; heading hierarchy is a
 * separate, later check ({@link headingEntryHeight}, consulted directly
 * by {@link resolveBoundaryHeight} on its *own* ancestor walk of `pos`
 * alone — headings never need the two-sided "nearest common ancestor"
 * comparison this chain exists for, since a heading's own height never
 * depends on what `prevPos` was, only on whether `pos` is entering one).
 */
function scopeChain(state: EditorState, pos: number): SyntaxNode[] {
  const chain: SyntaxNode[] = [];
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  for (; node; node = node.parent) {
    if (GROUPING_NODE_NAMES.has(node.name) || ATOMIC_NODE_NAMES.has(node.name)) {
      chain.push(node);
    }
  }
  return chain;
}

function sameNode(a: SyntaxNode, b: SyntaxNode): boolean {
  return a.name === b.name && a.from === b.from && a.to === b.to;
}

/**
 * Whether `pos`'s own physical line carries `ancestorNode`'s *own* marker
 * syntax directly — a `>` for a `Blockquote`, or this exact line's own
 * `ListMark` for a `BulletList`/`OrderedList` (reusing
 * `resolveLineIndentContext`'s existing `'list'` line-kind, which is
 * already scoped to precisely the marker's own physical line — see that
 * function's own Phase 3 fold-service usage for the same distinction).
 * Deliberately imprecise about *which* list/quote in a chain of nested
 * ones a marker line belongs to (any list ancestor in `pos`'s chain
 * passed here is accepted) — harmless, since a marker line is by
 * definition genuinely part of whichever grouping construct actually
 * contains it structurally.
 */
function isOwnMarkerLine(state: EditorState, pos: number, ancestorNode: SyntaxNode): boolean {
  const line = state.doc.lineAt(pos);
  if (ancestorNode.name === 'Blockquote') {
    return line.text.trimStart().startsWith('>');
  }
  return resolveLineIndentContext(state, line).kind === 'list';
}

/**
 * Whether `pos`'s line is *genuinely* part of `ancestorNode`'s own visual
 * grouping, as opposed to merely sharing that node in the raw parse tree
 * because of CommonMark's lazy-continuation rule — a plain, non-indented,
 * non-blank-line-separated line immediately following a list item
 * structurally nests inside that item's own paragraph even though it
 * reads as unrelated top-level content (see this file's own module-level
 * rationale, and `indentedParagraphFoldService.ts`'s doc comments, for the
 * same CommonMark quirk encountered independently there).
 *
 * Three ways a line counts as genuinely grouped:
 * 1. It's blank — required so a *loose* list's own internal blank lines
 *    (zero indentation, no marker) stay grouped at 6px, exactly as the
 *    existing loose-list test already asserts; a blank line can never be
 *    the lazy-continuation case this function exists to reject, since
 *    lazy continuation requires actual text.
 * 2. It's the ancestor's own marker line ({@link isOwnMarkerLine}).
 * 3. It's indented strictly deeper than the ancestor node's own starting
 *    column — genuine nested/continuation content, not a lazy
 *    continuation sitting at (or above) the ancestor's own column.
 */
function isGenuinelyGrouped(state: EditorState, pos: number, ancestorNode: SyntaxNode): boolean {
  const line = state.doc.lineAt(pos);
  if (line.text.trim() === '') {
    return true;
  }
  if (isOwnMarkerLine(state, pos, ancestorNode)) {
    return true;
  }
  const ancestorColumn = ancestorNode.from - state.doc.lineAt(ancestorNode.from).from;
  return isIndentedPastColumn(line, ancestorColumn);
}

/**
 * The `Paragraph` a physical *line* (not an arbitrary document position)
 * belongs to, or `null` if it isn't inside one at all. Probes at the
 * line's own end with a backward-leaning `resolveInner` bias (`-1`),
 * never at its start — confirmed directly against the real parsed tree
 * that a continuation line's own leading `QuoteMark` is a *sibling* of
 * the `Blockquote`'s `Paragraph` for that line's own content, but the
 * quote's very *first* content line has its `QuoteMark` positioned
 * *before* the `Paragraph` node even starts (`Blockquote`'s own direct
 * child, not the `Paragraph`'s), so probing at the line's first
 * non-whitespace character (i.e. the marker itself) inconsistently
 * misses that first line's own paragraph membership while correctly
 * finding it for every later line. Probing at the line's end lands
 * inside the actual paragraph text for every line uniformly, first line
 * included, and stops the walk at the first `Blockquote` ancestor
 * (rather than climbing past it) so a blank quoted line, or a line
 * belonging to some other nested construct (a list/heading inside the
 * quote), correctly resolves to `null` instead of reaching an *outer*
 * paragraph the quote itself isn't part of.
 *
 * Also disqualifies (returns `null` for) a paragraph that turns out to
 * live inside a `BulletList`/`OrderedList` nested in the quote — found by
 * continuing the walk *past* the first `Paragraph` match and bailing if a
 * list node shows up before the enclosing `Blockquote` does. This is what
 * keeps a list's own last item lazily continuing into unindented
 * top-level-looking text right after it (the same CommonMark quirk
 * {@link isGenuinelyGrouped} exists to reject for the list-spacing fix)
 * from being treated as "plain quote paragraph continuity": that
 * transition is a real structural boundary — exiting the nested list back
 * to the blockquote's own flow — even though the raw parse tree happens
 * to fold the trailing text into the same `Paragraph` node as the list
 * item's own text.
 */
function lineEnclosingParagraph(state: EditorState, line: { from: number; to: number }): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(line.to, -1);
  let paragraph: SyntaxNode | null = null;
  for (; node; node = node.parent) {
    if (!paragraph && node.name === 'Paragraph') {
      paragraph = node;
      continue;
    }
    if (paragraph && (node.name === 'BulletList' || node.name === 'OrderedList')) {
      return null;
    }
    if (node.name === 'Blockquote') {
      return paragraph;
    }
  }
  return null;
}

/**
 * Whether `prevPos` and `pos` are two *different* physical lines of the
 * same `Paragraph` node inside a blockquote — i.e. genuinely contiguous
 * quoted text with no block-level break between them at all, as opposed
 * to two separate paragraphs inside the same quote (split by a blank
 * quoted line, or by some other nested construct). Used to keep the
 * quote's own vertical bar (`blockquoteLineDecoration.ts`'s
 * `.cm-quote-line` border) visually unbroken: any separator widget —
 * even a small one — sits between the two `.cm-line` elements as its own
 * DOM node with no border of its own, which reads as a gap in the bar. A
 * *real* break inside the quote (a blank quoted line marking a new
 * paragraph, or a nested list/heading) still needs its own visible
 * separation, so this only ever suppresses the separator for the
 * genuinely-contiguous, cross-line case, never for an actual paragraph
 * break within the quote.
 *
 * Requires `prevPos`/`pos` to resolve to different physical lines —
 * `resolveBoundaryHeight` is also used for a same-line boundary (an
 * inline `Image`/`Embed` flanked by text on one physical line, from
 * `blockSeparatorDecoration.ts`'s own same-line caller), which has
 * nothing to do with the *vertical bar between lines* this rule exists
 * to protect, so that case is deliberately left to fall through to the
 * normal 6px grouping height instead.
 */
function isContiguousBlockquoteParagraph(state: EditorState, prevPos: number, pos: number): boolean {
  const prevLine = state.doc.lineAt(prevPos);
  const line = state.doc.lineAt(pos);
  if (prevLine.from === line.from) {
    return false;
  }
  const prevParagraph = lineEnclosingParagraph(state, prevLine);
  const paragraph = lineEnclosingParagraph(state, line);
  return prevParagraph !== null && paragraph !== null && sameNode(prevParagraph, paragraph);
}

/**
 * Node names that make up the "unordered list" visual family — every
 * marker variant (`-`/`+`/`*`) parses as a plain `BulletList` node (the
 * Lezer grammar carries no marker-specific node name), so this is
 * intentionally a single-entry set today. `OrderedList` is deliberately
 * excluded — extending this rule to ordered-list delimiter changes
 * (`.` vs `)`) is a separate, not-yet-made product decision; nothing in
 * this file should pre-empt it.
 */
const UNORDERED_LIST_FAMILY_NODE_NAMES = new Set(['BulletList']);

/**
 * The unordered-list-family membership of `pos`, or `null` if `pos`
 * doesn't belong to that family at all. Two distinct ways to belong:
 *
 * 1. `pos` resolves inside an actual `BulletList` ancestor — the
 *    ordinary case, covering every non-blank line of any bullet list
 *    regardless of which marker it uses.
 * 2. `pos` sits on a **genuinely blank** physical line (`line.text.trim()
 *    === ''`, the same gate `markdownIndentContext.ts` already uses for
 *    "is this line blank at all") that is directly flanked, in its
 *    immediately enclosing node's own child list, by a `BulletList`
 *    immediately before *and* a `BulletList` immediately after. Lezer
 *    never emits a node for a blank line, so `childBefore`/`childAfter`
 *    of the enclosing node (typically `Document`, but also correctly a
 *    `Blockquote`/`ListItem` for a nested case) skip straight past any
 *    number of consecutive blank lines to the real siblings on each
 *    side — which is exactly what lets one blank line or ten resolve
 *    identically here, with no separate multi-blank-line handling.
 *
 * The blank-line branch is deliberately gated on the physical line being
 * blank, not merely on "no `BulletList` ancestor found" — that
 * distinction is what keeps `- A\n# Heading\n+ B` and `- A\nParagraph\n+ B`
 * from bridging: the `Heading`/`Paragraph` line is real, non-blank
 * content, so `pos` never reaches the blank-line branch for it at all —
 * it resolves to `null` outright, exactly like any other non-list
 * content, and the boundary falls through to the heading-entry/default
 * rules instead of the family rule.
 */
function unorderedListFamilyMembership(state: EditorState, pos: number): SyntaxNode | null {
  const node = syntaxTree(state).resolveInner(pos, 1);
  for (let ancestor: SyntaxNode | null = node; ancestor; ancestor = ancestor.parent) {
    if (UNORDERED_LIST_FAMILY_NODE_NAMES.has(ancestor.name)) {
      // A lazy-continuation line (see isGenuinelyGrouped's own doc
      // comment) structurally resolves inside the ancestor's own last
      // item without being a real member of it visually — excluded here
      // the same way resolveBoundaryHeight's own rule 1 excludes it, so
      // this family rule can't grant 6px for a boundary rule 1 already
      // correctly declined.
      return isGenuinelyGrouped(state, pos, ancestor) ? ancestor : null;
    }
  }

  if (state.doc.lineAt(pos).text.trim() !== '') {
    return null;
  }

  const before = node.childBefore(pos);
  const after = node.childAfter(pos);
  if (before && after && UNORDERED_LIST_FAMILY_NODE_NAMES.has(before.name) && UNORDERED_LIST_FAMILY_NODE_NAMES.has(after.name)) {
    return before;
  }
  return null;
}

/**
 * The 6px "adjacent unordered-list family" height for a boundary between
 * two *separate* `BulletList` instances (different marker, so the parser
 * correctly keeps them as distinct nodes — see this module's own doc
 * comment on why that's the right parse) — or across a run of genuinely
 * blank physical lines bridging two such instances. Returns `null` when
 * either side isn't part of the family at all, so the caller can fall
 * through to its own next rule undisturbed.
 *
 * This is a visual-grouping rule *layered on top of*, not a replacement
 * for, {@link resolveBoundaryHeight}'s existing shared-instance check:
 * that check already returns 6 for two positions inside the *same*
 * `BulletList` (including same-marker lists spanning a loose blank
 * line, which stay one node and never reach this function at all); this
 * function only ever matters for the cross-instance case that check
 * cannot see, because `sameNode` compares node identity, not name.
 */
function unorderedListFamilyHeight(state: EditorState, prevPos: number, pos: number): SeparatorHeight | null {
  const prevFamily = unorderedListFamilyMembership(state, prevPos);
  const family = unorderedListFamilyMembership(state, pos);
  return prevFamily && family ? 6 : null;
}

/**
 * The heading-specific height owed for a boundary whose *later* side
 * (`pos`) lands on a heading's own first physical line — i.e. the
 * boundary is genuinely the "entering a heading" transition the product
 * requirement describes ("the separator above a heading"), not merely
 * some other position that happens to resolve inside a heading node.
 *
 * That first-line check is what keeps a Setext heading's own internal
 * boundary (its text line → its `===`/`---` underline line, both part of
 * the *same* `SetextHeading1`/`SetextHeading2` node) from re-triggering
 * this rule a second time: `pos` for that boundary is the underline
 * line, whose `state.doc.lineAt(pos).from` differs from the heading
 * node's own `state.doc.lineAt(node.from).from` (its first line), so this
 * returns `null` and the boundary falls through to the caller's default
 * (12) — exactly the existing, unchanged behavior for that transition.
 *
 * Walks `pos`'s ancestor chain outward (innermost first) rather than
 * only checking the immediate resolved node, mirroring {@link scopeChain}'s
 * own walk — `pos` typically resolves to a heading's inline content or
 * its `HeaderMark`, never the heading node itself directly.
 */
function headingEntryHeight(state: EditorState, pos: number): SeparatorHeight | null {
  const posLineFrom = state.doc.lineAt(pos).from;
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  for (; node; node = node.parent) {
    const height = HEADING_ENTRY_HEIGHT_BY_NODE_NAME.get(node.name);
    if (height !== undefined) {
      return state.doc.lineAt(node.from).from === posLineFrom ? height : null;
    }
  }
  return null;
}

/**
 * The spacing for a boundary between two document positions, `prevPos`
 * (the earlier side) and `pos` (the later side). Used identically for
 * two kinds of boundaries — between two physical lines, and between a
 * same-line `Image`/`Embed` and the text flanking it — because the rule
 * only depends on syntax-tree scope, never on whether the two positions
 * happen to be on the same physical line or different ones.
 *
 * Finds the *nearest common* grouping/atomic ancestor of the two
 * positions by walking `pos`'s own chain (innermost first) and returning
 * the first entry that also appears anywhere in `prevPos`'s chain:
 *
 * - Both positions inside the *same* List/Blockquote/Table/FencedCode (at
 *   any nesting depth — a parent item and its own nested list share the
 *   *outer* list as their nearest common ancestor, which is what keeps a
 *   nested list visually grouped with its parent rather than jumping to
 *   12px) → 6 (List/Blockquote) or 0 (Table/FencedCode) — **except** a
 *   shared List/Blockquote ancestor that `pos`'s line only reaches via
 *   CommonMark's lazy-continuation rule (a plain, non-indented,
 *   non-blank-line-separated line immediately following a list item
 *   structurally nests inside that item's own trailing paragraph even
 *   though it reads as unrelated top-level content) is *not* treated as
 *   genuine grouping — see {@link isGenuinelyGrouped} — and the search
 *   continues outward instead of stopping here. For a shared `Blockquote`
 *   specifically, genuine grouping is further refined to 0 rather than 6
 *   when the two positions are physical lines of the exact same inner
 *   `Paragraph` (see {@link isContiguousBlockquoteParagraph}) — keeping
 *   the quote's own vertical bar visually unbroken across a wrapped
 *   paragraph's own lines, while a real break inside the quote (a blank
 *   quoted line, or a nested list/heading) still gets its normal 6px.
 * - One position inside a construct the other isn't in at all (crossing
 *   the construct's own boundary in either direction) → no common
 *   ancestor found → 12, which is exactly "spacing before/after the
 *   whole construct" — the same rule that produces normal spacing
 *   between two ordinary paragraphs, with nothing extra required for the
 *   entering/exiting case specifically.
 * - Neither position is inside any grouping/atomic construct at all, and
 *   `pos` is not entering a heading either (ordinary paragraph-to-
 *   paragraph text, including multiple physical lines of one `Paragraph`
 *   node, and blank lines) → 12, unconditionally — this is what keeps
 *   spacing based on physical lines rather than Markdown's own
 *   `Paragraph` grouping, and is why filling a blank line never changes
 *   anything: the line count doesn't change, so the comparison never has
 *   a different answer just because the parser now sees one `Paragraph`
 *   instead of two.
 *
 * **Precedence (checked in this exact order, each one short-circuiting
 * the rest):**
 *
 * 1. A shared List/Blockquote/Table/FencedCode ancestor → 6 or 0 (the
 *    pre-existing rule, above, entirely unchanged).
 * 2. Otherwise, {@link unorderedListFamilyHeight}: are both sides
 *    members of the unordered-list visual family (a `BulletList`
 *    ancestor, or a blank line bridging two of them) even though they're
 *    *different* `BulletList` instances (rule 1 already covers the
 *    same-instance case)? → 6.
 * 3. Otherwise, {@link headingEntryHeight}: is `pos` entering a heading's
 *    own first line? → 36/30/24/18 by level.
 * 4. Otherwise → 12.
 *
 * Rule 1 outranking rule 2 is deliberate, not an oversight: it's what
 * makes a heading that is itself a child of the *same* List/Blockquote
 * item as the preceding line stay at that construct's own 6px grouping
 * height instead of jumping to its heading-hierarchy height —
 * `- Item\n  # Heading` groups tightly (6px) with its list item, the
 * same as any other block content nested one level under that item,
 * rather than getting the 36px a document-level `# Heading` would. A
 * heading only ever gets its hierarchy height when it's genuinely
 * entering top-level (or matching-scope) document flow, never when
 * List/Blockquote grouping already governs the boundary. This also keeps
 * heading detection subordinate to the atomic rule: a line inside
 * `Table`/`FencedCode` that merely *resembles* a heading (e.g. a `#`
 * inside a fenced code block) is never even reachable by rule 3, because
 * rule 1 already returned 0 for that boundary — {@link headingEntryHeight}
 * is a fallback path, never consulted for a boundary rule 1 fully
 * resolved.
 *
 * Rule 2 outranking rule 3/4 is what makes `- A\n+ B` resolve to 6
 * (adjacent `BulletList` instances, different markers) while
 * `- A\n# Heading\n+ B` and `- A\nParagraph\n+ B` do *not* bridge across
 * the heading/paragraph — {@link unorderedListFamilyMembership}'s
 * blank-line branch is gated on the physical line genuinely being blank,
 * so a real content line (heading or paragraph) sitting between two
 * bullet lists is never treated as part of the family, and those two
 * boundaries fall through to rules 3/4 exactly as they did before this
 * rule existed.
 */
export function resolveBoundaryHeight(state: EditorState, prevPos: number, pos: number): SeparatorHeight {
  const prevChain = scopeChain(state, prevPos);
  const chain = scopeChain(state, pos);

  for (const node of chain) {
    if (prevChain.some((candidate) => sameNode(candidate, node))) {
      if (ATOMIC_NODE_NAMES.has(node.name)) {
        return 0;
      }
      if (isGenuinelyGrouped(state, pos, node)) {
        if (node.name === 'Blockquote' && isContiguousBlockquoteParagraph(state, prevPos, pos)) {
          return 0;
        }
        return 6;
      }
      // Shares this ancestor only via CommonMark's lazy-continuation quirk
      // (see isGenuinelyGrouped's own doc comment) — not a genuine grouping
      // relationship, so keep searching outward for a different shared
      // ancestor rather than granting 6px here.
    }
  }

  const familyHeight = unorderedListFamilyHeight(state, prevPos, pos);
  if (familyHeight !== null) {
    return familyHeight;
  }

  const headingHeight = headingEntryHeight(state, pos);
  if (headingHeight !== null) {
    return headingHeight;
  }

  return 12;
}
