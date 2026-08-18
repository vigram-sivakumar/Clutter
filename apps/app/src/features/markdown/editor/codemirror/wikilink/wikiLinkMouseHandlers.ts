import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { handleTokenClick, tokenMouseHandlers } from '../semanticToken/tokenMouseHandlers';
import { getWikiLinkActivation } from './wikiLinkActivation';
import { isWikiLinkNode } from './wikiLinkEngagement';
import type { ResolveWikiLink } from './wikiLinkResolution';

/**
 * WikiLink-specific entry point onto the generic click/Alt-click
 * mechanism (`semanticToken/tokenMouseHandlers.ts`) — kept as its own
 * named export since it's exercised directly in tests (see that module's
 * doc comment for why: jsdom has no `posAtCoords` geometry).
 */
export function handleWikiLinkClick(
  view: EditorView,
  pos: number,
  altKey: boolean,
  getResolver: () => ResolveWikiLink | undefined
): boolean {
  return handleTokenClick(view, pos, altKey, isWikiLinkNode, (v, node) =>
    getWikiLinkActivation(v, node, getResolver)
  );
}

/**
 * Mouse interaction for WikiLinks — a thin adapter over the generic
 * `tokenMouseHandlers` mechanism, shared by every semantic inline
 * construct kind (docs/editor-architecture-decisions.md §11).
 */
export function wikiLinkMouseHandlers(getResolver: () => ResolveWikiLink | undefined): Extension {
  return tokenMouseHandlers(isWikiLinkNode, (view, node) =>
    getWikiLinkActivation(view, node, getResolver)
  );
}
