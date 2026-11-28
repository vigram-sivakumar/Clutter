import { foldable, foldedRanges, syntaxTree } from '@codemirror/language';
import type { EditorState, Line } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { firstNonWhitespaceOffset } from '../indent/markdownIndentContext';

/** Shared fold policy: only headings and fenced code own document folds.
 * Note-embed card collapse remains a separate widget-level affordance.
 * Native CM6 owns fold state and effects; generic paragraph/list fallback
 * is intentionally not exposed by Clutter.
 */
export interface FoldRange {
  readonly from: number;
  readonly to: number;
}

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

/** Only an actual opening line can own a fold; a list or quote marker
 * cannot borrow an enclosing heading or a descendant's eligibility. */
function foldOwner(state: EditorState, line: Line): SyntaxNode | null {
  if (line.text.trim() === '') return null;
  const probe = line.from + firstNonWhitespaceOffset(line.text);
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(probe, 1); node; node = node.parent) {
    if (HEADING_NODE_NAMES.has(node.name) || node.name === 'FencedCode') {
      return state.doc.lineAt(node.from).from === line.from ? node : null;
    }
    if (node.name === 'ListItem') return null;
  }
  return null;
}

export function resolveHeadingFoldClass(state: EditorState, linePos: number): string | null {
  const owner = foldOwner(state, state.doc.lineAt(linePos));
  return owner ? HEADING_FOLD_CLASS_BY_NODE_NAME.get(owner.name) ?? null : null;
}

/** The UI, shortcuts and restoration use the same positive allowlist. */
export function getFoldRange(state: EditorState, line: Line): FoldRange | null {
  if (!foldOwner(state, line)) return null;
  return foldable(state, line.from, line.to);
}

/** Only restore an exact currently eligible range, never a retired or
 * malformed fold that could hide arbitrary content. */
export function isRestorableFold(state: EditorState, from: number, to: number): boolean {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= to || to > state.doc.length) {
    return false;
  }
  const range = getFoldRange(state, state.doc.lineAt(from));
  return range !== null && range.from === from && range.to === to;
}

export function isFoldable(state: EditorState, line: Line): boolean {
  return getFoldRange(state, line) !== null;
}


