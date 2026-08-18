import type { EditorState } from '@codemirror/state';

import {
  findAtRestTokenAt,
  findTokenAt,
  isTokenEngaged,
  type TokenNodeRange,
} from '../semanticToken/tokenEngagement';

export type WikiLinkNodeRange = TokenNodeRange;

/** The one WikiLink-specific fact the generic semantic-token mechanisms need: which Lezer node names count as a WikiLink. */
export const isWikiLinkNode = (nodeName: string): boolean => nodeName === 'WikiLink';

/**
 * Engagement is derived from selection containment alone, never stored
 * state (docs/editor-architecture-decisions.md) — see
 * `semanticToken/tokenEngagement.ts` for the shared mechanism this
 * delegates to.
 */
export function isEngaged(state: EditorState, node: WikiLinkNodeRange): boolean {
  return isTokenEngaged(state, node);
}

export function findWikiLinkAt(state: EditorState, pos: number): WikiLinkNodeRange | null {
  return findTokenAt(state, pos, isWikiLinkNode);
}

/** Same as {@link findWikiLinkAt}, but only returns a node that is currently at rest (not engaged). */
export function findAtRestWikiLinkAt(state: EditorState, pos: number): WikiLinkNodeRange | null {
  return findAtRestTokenAt(state, pos, isWikiLinkNode);
}
