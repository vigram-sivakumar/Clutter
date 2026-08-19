import type { EditorState } from '@codemirror/state';

import {
  findAtRestTokenAt,
  findTokenAt,
  isTokenEngaged,
  type TokenNodeRange,
} from '../semanticToken/tokenEngagement';

export type TagNodeRange = TokenNodeRange;

/** The one Tag-specific fact the generic semantic-token mechanisms need: which Lezer node names count as a Tag. */
export const isTagNode = (nodeName: string): boolean => nodeName === 'Tag';

/**
 * Engagement is derived from selection containment alone, never stored
 * state (docs/editor-architecture-decisions.md) — see
 * `semanticToken/tokenEngagement.ts` for the shared mechanism this
 * delegates to.
 */
export function isEngaged(state: EditorState, node: TagNodeRange): boolean {
  return isTokenEngaged(state, node);
}

export function findTagAt(state: EditorState, pos: number): TagNodeRange | null {
  return findTokenAt(state, pos, isTagNode);
}

/** Same as {@link findTagAt}, but only returns a node that is currently at rest (not engaged). */
export function findAtRestTagAt(state: EditorState, pos: number): TagNodeRange | null {
  return findAtRestTokenAt(state, pos, isTagNode);
}
