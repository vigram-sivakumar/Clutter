import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { handleTokenClick, tokenMouseHandlers } from '../semanticToken/tokenMouseHandlers';
import { getUrlActivation } from './urlActivation';
import { isUrlNode } from './urlEngagement';

/**
 * URL-specific entry point onto the generic click mechanism — kept as its
 * own named export since it's exercised directly in tests, mirroring
 * `linkMouseHandlers.ts`'s `handleLinkClick`.
 */
export function handleUrlClick(view: EditorView, pos: number, altKey: boolean): boolean {
  return handleTokenClick(view, pos, altKey, isUrlNode, getUrlActivation);
}

/**
 * Mouse interaction for bare URLs and Autolinks (`<https://...>`) — a thin
 * adapter over the generic `tokenMouseHandlers` mechanism. Navigation-only:
 * no styling/decoration/concealment is introduced by this file, matching
 * the still-open bare-URL rendering question in
 * docs/editor-architecture-decisions.md — only its navigation piece is
 * resolved here.
 */
export function urlMouseHandlers(): Extension {
  return tokenMouseHandlers(isUrlNode, getUrlActivation);
}
