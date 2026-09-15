import { foldable, foldedRanges, syntaxTree } from '@codemirror/language';
import type { EditorState, Line } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { resolveLineIndentContext } from '../indent/markdownIndentContext';
import { computeIndentedParagraphFold } from './indentedParagraphFoldService';
import { computeListItemFold } from './listItemFoldService';

/**
 * **The single authoritative answer, for the entire editor, to "can this
 * line be folded, and if so, exactly what range does it own."** Every
 * fold-producing entry point in this codebase — the inline toggle's own
 * render pass and click handler (`foldToggleDecoration.ts`), Clutter's own
 * fold/unfold/fold-all keyboard commands (`foldSemanticsKeymap.ts`), and
 * the fold-preserving line-move command (`foldAwareMoveLineKeymap.ts`) —
 * calls `getFoldRange`/`isFoldable` here, never `@codemirror/language`'s
 * own `foldable()` directly and never a construct-specific service
 * function directly. This is what closes the gap a prior investigation
 * found: `foldService`'s own public contract has no way for a registered
 * service to say "and don't ask anyone else either" — returning `null`
 * only ever means "try the next one," which (for `ListItem`/`Task`)
 * eventually reaches `@codemirror/lang-markdown`'s generic native
 * `foldNodeProp` branch and its lazy-continuation-corrupted answer, no
 * matter how correct `listItemFoldService.ts`'s own registered service
 * is. A registered `foldService` cannot close that gap by itself — only
 * *never asking `foldable()` at all* for the constructs where the native
 * answer is untrustworthy can, which is what every call site in this
 * codebase now does by going through this module instead.
 *
 * **This module does not replace CM6's fold mechanics — it replaces only
 * the *range-computation* entry point.** `foldState` (the `StateField`),
 * `foldEffect`/`unfoldEffect` (the state effects that mutate it),
 * `RangeSet.map` (how existing folds survive document edits),
 * `EditorState.toJSON`/`fromJSON` (serialization) are all still exactly
 * CM6's own, completely unmodified — `codeFolding()` is still the one and
 * only extension that owns fold *state*. This module only ever answers
 * "what range would folding this line hide," the same question
 * `foldable()` answers, just with Clutter's own corrections applied
 * uniformly instead of registered as one-of-several competing
 * `foldService`s.
 *
 * **Delegates to native CM6 wherever native semantics are already
 * correct** — headings and fenced code are never recomputed here; their
 * boundaries are delimiter/name-based, structurally immune to CommonMark
 * lazy continuation, so `foldable()` (gated by `isInScopeFoldOwner`, the
 * same allowlist this module always applied) remains the source of
 * truth for exactly those two constructs. Only `Paragraph` and
 * `ListItem`/`Task` — the two node shapes lazy continuation can corrupt —
 * are ever recomputed, by the same two Clutter-authored algorithms this
 * codebase already established (`computeIndentedParagraphFold`,
 * `computeListItemFold`), unchanged by this refactor.
 */

/** A fold's `[from, to)` span — deliberately the same plain shape `@codemirror/language`'s own `foldable()`/`findFold` return, so every caller here is a drop-in replacement for the native call it used to make. */
export interface FoldRange {
  readonly from: number;
  readonly to: number;
}

/**
 * Headings, list items, and fenced code — the three node shapes whose
 * *existence as an owner* is decided structurally (a real ancestor node),
 * as opposed to `Paragraph`/indentation-based ownership, which
 * `resolveLineIndentContext` decides instead. Unchanged from
 * `foldToggleDecoration.ts`'s original allowlist — moved here verbatim,
 * not reconsidered, since nothing about this refactor changes which
 * constructs are in scope, only how many places compute their ranges.
 */
const HEADING_NODE_NAMES: ReadonlySet<string> = new Set([
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'SetextHeading1',
  'SetextHeading2',
]);

/** Heading level → the fold toggle's own heading-typography CSS class — see `resolveHeadingFoldClass` below. Moved here verbatim from `foldToggleDecoration.ts`. */
const HEADING_FOLD_CLASS_BY_NODE_NAME: ReadonlyMap<string, string> = new Map([
  ['ATXHeading1', 'cm-fold-heading-1'],
  ['ATXHeading2', 'cm-fold-heading-2'],
  ['ATXHeading3', 'cm-fold-heading-3'],
  ['ATXHeading4', 'cm-fold-heading-4'],
  ['ATXHeading5', 'cm-fold-heading-5'],
  ['ATXHeading6', 'cm-fold-heading-6'],
  ['SetextHeading1', 'cm-fold-heading-1'],
  ['SetextHeading2', 'cm-fold-heading-2'],
]);

/** The tree-walk shared by `isInScopeFoldOwner` and `resolveHeadingFoldClass` — "earliest matching ancestor wins," matching `HEADING_NODE_NAMES ∪ {ListItem, FencedCode}`. Moved here verbatim from `foldToggleDecoration.ts`'s own `resolveFoldOwnerNodeName`. */
function resolveFoldOwnerNodeName(state: EditorState, linePos: number): string | null {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(linePos, 1); node; node = node.parent) {
    if (HEADING_NODE_NAMES.has(node.name) || node.name === 'ListItem' || node.name === 'FencedCode') {
      return node.name;
    }
  }
  return null;
}

function isInScopeFoldOwner(state: EditorState, linePos: number): boolean {
  return resolveFoldOwnerNodeName(state, linePos) !== null;
}

/**
 * `null` for every non-heading fold owner, and for any line with no
 * recognized owner at all. Lets a folded/foldable heading's own toggle
 * carry heading-specific typography sizing — see the field's own original
 * doc comment (now in this module) for why `.cm-fold-toggle`'s
 * `position: absolute` needs this.
 */
export function resolveHeadingFoldClass(state: EditorState, linePos: number): string | null {
  const ownerNodeName = resolveFoldOwnerNodeName(state, linePos);
  return ownerNodeName ? HEADING_FOLD_CLASS_BY_NODE_NAME.get(ownerNodeName) ?? null : null;
}

/**
 * **The authority's own core function.** For `kind: 'paragraph'`/`'list'`
 * lines, calls the corresponding Clutter-authored algorithm directly,
 * *never* consulting `foldable()` at all for those two kinds — this is
 * what makes the answer authoritative rather than merely "tried first."
 * For every other kind (heading/fenced-code/anything else),
 * `isInScopeFoldOwner` gates a call to the native `foldable()`, which is
 * correct and sufficient there (see this module's own top doc comment).
 */
export function getFoldRange(state: EditorState, line: Line): FoldRange | null {
  const context = resolveLineIndentContext(state, line);
  if (context.kind === 'paragraph') {
    return computeIndentedParagraphFold(state, line);
  }
  if (context.kind === 'list') {
    return computeListItemFold(state, line);
  }
  return isInScopeFoldOwner(state, line.from) ? foldable(state, line.from, line.to) : null;
}

/** Whether `line` can be folded at all — `getFoldRange(state, line) !== null`, named for readability at call sites that only need the boolean. */
export function isFoldable(state: EditorState, line: Line): boolean {
  return getFoldRange(state, line) !== null;
}

/**
 * Whether `[from, to)` currently sits inside an *existing* fold, and if
 * so, that fold's own full range — a read of live `foldState`
 * (`@codemirror/language`'s own `foldedRanges()`), never a second fold
 * *state* mechanism. `@codemirror/language` never exports its own private
 * `findFold` helper (confirmed against the installed
 * `@codemirror/language@6.12.4` source) — this is that same query,
 * reimplemented as a read-only lookup over public state. Moved here
 * (from `foldToggleDecoration.ts`) so every entry point that needs "is
 * this line already folded" (the toggle, Clutter's own fold/unfold
 * keyboard commands, the fold-aware line-move command) shares one
 * implementation instead of three.
 */
export function findFold(state: EditorState, from: number, to: number): FoldRange | null {
  let found: FoldRange | null = null;
  foldedRanges(state).between(from, to, (foldFrom, foldTo) => {
    if (!found || found.from > foldFrom) {
      found = { from: foldFrom, to: foldTo };
    }
  });
  return found;
}
