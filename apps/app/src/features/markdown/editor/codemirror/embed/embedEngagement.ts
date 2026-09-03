import type { EditorState } from '@codemirror/state';

import {
  findAtRestTokenAt,
  findTokenAt,
  isTokenEngaged,
  type TokenNodeRange,
} from '../semanticToken/tokenEngagement';

export type EmbedNodeRange = TokenNodeRange;

/** The one Embed-specific fact the generic semantic-token mechanisms need: which Lezer node names count as an Embed. */
export const isEmbedNode = (nodeName: string): boolean => nodeName === 'Embed';

/**
 * Engagement is derived from selection containment alone, never stored
 * state — same rule WikiLink's engagement already follows (see
 * wikilink/wikiLinkEngagement.ts and
 * docs/editor-architecture-decisions.md), delegated to the same shared
 * mechanism.
 */
export function isEngaged(state: EditorState, node: EmbedNodeRange): boolean {
  return isTokenEngaged(state, node);
}

export function findEmbedAt(state: EditorState, pos: number): EmbedNodeRange | null {
  return findTokenAt(state, pos, isEmbedNode);
}

/** Same as {@link findEmbedAt}, but only returns a node that is currently at rest (not engaged). */
export function findAtRestEmbedAt(state: EditorState, pos: number): EmbedNodeRange | null {
  return findAtRestTokenAt(state, pos, isEmbedNode);
}
