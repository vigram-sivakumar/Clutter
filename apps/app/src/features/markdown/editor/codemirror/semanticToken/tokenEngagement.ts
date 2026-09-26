import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { isDelimitedMarkConstruct } from '../highlight/inlineLivePreviewParticipants';

/**
 * Generic reveal-on-engagement query mechanism, extracted from the
 * WikiLink vertical slice once it proved this part is genuinely
 * kind-agnostic (docs/editor-architecture-decisions.md §11). Every
 * semantic inline construct kind shares this: engagement is derived
 * purely from selection containment against a Lezer node range, never
 * stored state. Which node names count as "a semantic inline token" is
 * supplied per call site via `TokenNodePredicate` — this module has no
 * knowledge of `WikiLink` or any other concrete kind.
 */
export interface TokenNodeRange {
  readonly from: number;
  readonly to: number;
}

export type TokenNodePredicate = (nodeName: string) => boolean;

/**
 * A selection strictly within the node's range — including a zero-width
 * caret at either boundary — means engaged.
 *
 * Never engaged when `state.readOnly` — a permanently read-only view
 * (a note embed's nested `EditorView`, `createEditorView.ts`'s `readOnly`
 * option) can never actually be edited, so a click/selection landing
 * inside a construct must never flip it into its raw-source form; the
 * whole point of a note embed is that its content stays permanently
 * rendered, exactly like every other visual behavior it reuses from the
 * normal editor. This is the one shared choke point every reveal-on-
 * engage construct (heading, emphasis/strong/strikethrough/highlight/
 * inline-code, blockquote, WikiLink, Tag, Date) already funnels through,
 * so guarding it here — rather than in each construct — is what keeps
 * this a one-line fix instead of N. `state.selection` itself is
 * untouched: text selection and copy inside a read-only view are
 * unaffected, only this decoration-facing query is short-circuited.
 * A side effect, not a regression: `findAtRestTokenAt` (used by every
 * click-to-navigate handler) also calls this — forcing "never engaged"
 * means a click on a WikiLink/Tag/Date inside a read-only view always
 * resolves to "at rest" and therefore always activates navigation,
 * never a half-revealed state that could never be edited anyway.
 */
export function isTokenEngaged(state: EditorState, node: TokenNodeRange): boolean {
  if (state.readOnly) {
    return false;
  }
  const selection = state.selection.main;
  return selection.from >= node.from && selection.to <= node.to;
}

/**
 * Finds the actual token `SyntaxNode` (if any, per `isTokenNode`) whose
 * range contains `pos`, scoped to a narrow window around `pos` rather than
 * the whole document — this is called from hot paths (mouse handlers,
 * arrow-key commands), not a viewport-wide decoration pass. Kept
 * module-private and returning the real node (not just its range) so
 * {@link findAtRestTokenAt} can walk its ancestors for
 * {@link widenToEnclosingDelimitedRegion} without a second tree scan;
 * {@link findTokenAt} is the public, range-only view of the same lookup.
 */
function resolveTokenNode(
  state: EditorState,
  pos: number,
  isTokenNode: TokenNodePredicate
): SyntaxNode | null {
  let found: SyntaxNode | null = null;
  syntaxTree(state).iterate({
    from: Math.max(0, pos - 1),
    to: Math.min(state.doc.length, pos + 1),
    enter: (node) => {
      if (isTokenNode(node.name) && node.from <= pos && pos <= node.to) {
        found = node.node;
      }
    },
  });
  return found;
}

/**
 * Widens a token's own range outward through an ancestor chain of
 * delimited-inline-formatting constructs (Emphasis, StrongEmphasis,
 * Strikethrough, Highlight, InlineCode, Link, Autolink — every construct
 * `isDelimitedMarkConstruct` recognizes), but **only while this node (or
 * the previously-widened result) is that ancestor's entire content** —
 * flush against both of the ancestor's own delimiter marks, with no
 * sibling text or construct on either side. The walk stops the moment
 * either side has a gap: from that point, the ancestor's own engagement
 * state implies nothing about this node, which must resolve its own
 * engagement independently.
 *
 * **Corrected 2026-09-26 (nested-inline-rendering generic fix, see
 * docs/editor-architecture-decisions.md's correction of that name).**
 * Superseded the previous `widenToEnclosingDelimitedRegion`, which widened
 * through *every* enclosing delimited-mark ancestor unconditionally,
 * regardless of whether this node was flush against that ancestor's own
 * marks or merely sat *somewhere* inside it alongside unrelated sibling
 * content. That unconditional widen was the generic root cause of a
 * confirmed bug: a WikiLink/Tag/Link/plain-formatted sibling anywhere
 * inside an engaged ancestor (e.g. `**bold text [[Page]] #tag more**`)
 * was treated as itself engaged the instant the cursor entered *any* part
 * of that ancestor, even far from the sibling itself — exposing it as raw
 * Markdown though the cursor never came near it. The flush condition
 * added here is the fix: two children of the same delimited construct
 * that are genuinely siblings (not zero-gap nested) never share a flush
 * boundary with the ancestor at the same time, so widening naturally
 * excludes exactly the sibling-contamination case while preserving the
 * one case flush widening exists for — the ancestor's marker sits
 * immediately against a nested construct that *is* its entire content
 * (`**[[Page]]**`, `**~~[[Page]]~~**`), where a caret at the ancestor's
 * own outer boundary must still show the whole thing as one coherent
 * raw/rendered unit rather than a broken half-revealed-half-widget seam
 * (the original regression `widenToEnclosingDelimitedRegion` was written
 * to fix — see docs/editor-architecture-decisions.md's "regression:
 * engagement boundary matches the enclosing formatting region, no gap").
 *
 * Ordinary block containers (Paragraph, Document, ListItem, TableCell,
 * ...) never satisfy `isDelimitedMarkConstruct` in the first place, so the
 * walk still naturally terminates at the paragraph boundary without
 * needing to name any container type.
 *
 * Shared by both the decoration side (`inlineLivePreviewRegion.ts`'s own
 * per-participant engagement check, and `wikiLinkLivePreview.ts`'s
 * standalone one) and the click-activation side ({@link findAtRestTokenAt},
 * below) — the same single definition of "engaged" everywhere, so a
 * rendered widget and its own click-to-activate resolution can never
 * disagree about whether the cursor currently occupies it.
 */
export function widenThroughFlushAncestors(node: SyntaxNode): TokenNodeRange {
  let widest: TokenNodeRange = { from: node.from, to: node.to };
  let ancestor: SyntaxNode | null = node.parent;
  while (ancestor && isDelimitedMarkConstruct(ancestor)) {
    const openMark = ancestor.firstChild;
    const closeMark = ancestor.lastChild;
    if (!openMark || !closeMark || openMark.to !== widest.from || closeMark.from !== widest.to) {
      break;
    }
    widest = { from: ancestor.from, to: ancestor.to };
    ancestor = ancestor.parent;
  }
  return widest;
}

/**
 * Finds the token node (if any, per `isTokenNode`) whose range contains
 * `pos`, scoped to a narrow window around `pos` rather than the whole
 * document — this is called from hot paths (mouse handlers, arrow-key
 * commands), not a viewport-wide decoration pass.
 */
export function findTokenAt(
  state: EditorState,
  pos: number,
  isTokenNode: TokenNodePredicate
): TokenNodeRange | null {
  const node = resolveTokenNode(state, pos, isTokenNode);
  return node ? { from: node.from, to: node.to } : null;
}

/**
 * Same as {@link findTokenAt}, but only returns a node that is currently
 * at rest (not engaged) — checked against the node's own range *widened*
 * to any flush-enclosing delimited-mark construct ({@link widenThroughFlushAncestors}),
 * not the bare node range, so this agrees with whatever the decoration
 * side actually rendered (raw/editable vs. at-rest widget) at the moment
 * of the click. The returned range itself stays the token's own narrow
 * range, unchanged — callers (activation resolvers) need the token's own
 * source text, not the widened region used only for this containment
 * check.
 */
export function findAtRestTokenAt(
  state: EditorState,
  pos: number,
  isTokenNode: TokenNodePredicate
): TokenNodeRange | null {
  const node = resolveTokenNode(state, pos, isTokenNode);
  if (!node) {
    return null;
  }
  if (isTokenEngaged(state, widenThroughFlushAncestors(node))) {
    return null;
  }
  return { from: node.from, to: node.to };
}
