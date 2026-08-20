import type { EditorState } from '@codemirror/state';

import {
  findAtRestTokenAt,
  findTokenAt,
  isTokenEngaged,
  type TokenNodeRange,
} from '../semanticToken/tokenEngagement';

export type DateNodeRange = TokenNodeRange;

/** The one Date-specific fact the generic semantic-token mechanisms need: which Lezer node names count as a Date. */
export const isDateNode = (nodeName: string): boolean => nodeName === 'Date';

/**
 * Engagement is derived from selection containment alone, never stored
 * state (docs/editor-architecture-decisions.md) — see
 * `semanticToken/tokenEngagement.ts` for the shared mechanism this
 * delegates to.
 */
export function isEngaged(state: EditorState, node: DateNodeRange): boolean {
  return isTokenEngaged(state, node);
}

export function findDateAt(state: EditorState, pos: number): DateNodeRange | null {
  return findTokenAt(state, pos, isDateNode);
}

/** Same as {@link findDateAt}, but only returns a node that is currently at rest (not engaged). */
export function findAtRestDateAt(state: EditorState, pos: number): DateNodeRange | null {
  return findAtRestTokenAt(state, pos, isDateNode);
}
