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
 * Widens a token's own range to include any directly enclosing chain of
 * delimited-inline-formatting ancestors (Emphasis, StrongEmphasis,
 * Strikethrough, Highlight, InlineCode — every construct
 * `delimitedInlineRenderer` in `inlineLivePreviewParticipants.ts` handles),
 * without naming any of them: `isDelimitedMarkConstruct` is the same
 * structural fact `delimitedInlineRenderer` itself keys off (`firstChild`/
 * `lastChild` same-name check), so this composes with any current or
 * future participant following that convention with zero new knowledge
 * added about what that participant is. Stops at the first ancestor that
 * doesn't match — ordinary block containers (Paragraph, Document,
 * ListItem, TableCell, ...) never have two identically-`Mark`-named
 * children bracketing their content, so the walk naturally terminates at
 * the paragraph boundary rather than reaching the document root.
 *
 * Promoted here (2026-09-15) from `wikiLinkLivePreview.ts`'s own
 * `widenToEnclosingLivePreviewRegion` (that file's original, WikiLink-only
 * copy now delegates here) once the same gap was found on the click side:
 * `**[[Page]]**` renders correctly as raw/editable while the cursor sits
 * between the `**` and the `[[` (the decoration path already widened via
 * that copy), but a *click* landing inside `[[Page]]`'s own narrower node
 * range used to check only the bare `WikiLink` node's range via
 * {@link isTokenEngaged} — missing the still-current selection sitting
 * just outside it — and so treated the click as landing on an at-rest
 * link and activated navigation, even though the construct was visibly
 * rendered as plain editable source at that exact moment. Centralizing
 * the widen here, inside {@link findAtRestTokenAt} itself, is what fixes
 * every semantic token kind's click/keyboard-activation path at once
 * (WikiLink, Link, Autolink/URL, Tag, Date, Embed, ...) rather than
 * requiring each kind's own mouse-handler file to remember to widen —
 * the "one shared choke point" principle {@link isTokenEngaged}'s own doc
 * comment already establishes for the read-only guard applies identically
 * here.
 */
export function widenToEnclosingDelimitedRegion(node: SyntaxNode): TokenNodeRange {
  let widest: TokenNodeRange = { from: node.from, to: node.to };
  let ancestor: SyntaxNode | null = node.parent;
  while (ancestor && isDelimitedMarkConstruct(ancestor)) {
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
 * to any enclosing delimited-mark construct ({@link widenToEnclosingDelimitedRegion}),
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
  if (isTokenEngaged(state, widenToEnclosingDelimitedRegion(node))) {
    return null;
  }
  return { from: node.from, to: node.to };
}
