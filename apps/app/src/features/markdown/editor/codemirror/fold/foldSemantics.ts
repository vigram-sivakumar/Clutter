import { foldable, foldedRanges, syntaxTree } from '@codemirror/language';
import type { EditorState, Line } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { firstNonWhitespaceOffset, resolveLineIndentContext } from '../indent/markdownIndentContext';
import { computeIndentedParagraphFold } from './indentedParagraphFoldService';

/** The single authoritative fold eligibility and range policy for toggle and keyboard commands.
 * CM6 still owns fold state and effects. List/task markers and their list-owned
 * continuation paragraphs are explicitly ineligible; native foldable() must
 * not be asked for them because its generic ListItem fallback can fold them.
 * Standalone indented paragraphs, headings and fenced code retain their rules.
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

/** Identifies retired list fold owners, including list-owned continuation rows.
 * Probe the first content character so nested markers are not missed.
 * A heading or fenced-code owner inside a list retains its own fold semantics.
 */
export function isListFoldOwner(state: EditorState, line: Line): boolean {
  if (resolveLineIndentContext(state, line).kind === 'list') {
    return true;
  }
  return resolveFoldOwnerNodeName(state, line.from + firstNonWhitespaceOffset(line.text)) === 'ListItem';
}

/** The sole eligibility gate: no native fallback for retired list folds. */
export function getFoldRange(state: EditorState, line: Line): FoldRange | null {
  if (isListFoldOwner(state, line)) {
    return null;
  }
  const context = resolveLineIndentContext(state, line);
  if (context.kind === 'paragraph') {
    return computeIndentedParagraphFold(state, line);
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
