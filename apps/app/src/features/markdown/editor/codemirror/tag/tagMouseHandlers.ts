import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { handleTokenClick, tokenMouseHandlers } from '../semanticToken/tokenMouseHandlers';
import { getTagActivation } from './tagActivation';
import { isTagNode } from './tagEngagement';
import type { ResolveTag } from './tagResolution';

/**
 * Tag-specific entry point onto the generic click/Alt-click mechanism
 * (`semanticToken/tokenMouseHandlers.ts`) — kept as its own named export
 * since it's exercised directly in tests, mirroring
 * `wikiLinkMouseHandlers.ts`'s `handleWikiLinkClick`.
 */
export function handleTagClick(
  view: EditorView,
  pos: number,
  altKey: boolean,
  getResolver: () => ResolveTag | undefined
): boolean {
  return handleTokenClick(view, pos, altKey, isTagNode, (v, node) =>
    getTagActivation(v, node, getResolver)
  );
}

/**
 * Mouse interaction for Tags — a thin adapter over the generic
 * `tokenMouseHandlers` mechanism, shared by every semantic inline
 * construct kind.
 */
export function tagMouseHandlers(getResolver: () => ResolveTag | undefined): Extension {
  return tokenMouseHandlers(isTagNode, (view, node) => getTagActivation(view, node, getResolver));
}
