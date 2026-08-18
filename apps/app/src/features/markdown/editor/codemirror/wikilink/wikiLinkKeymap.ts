import type { Extension } from '@codemirror/state';
import type { Command, EditorView } from '@codemirror/view';

import {
  activateAdjacentToken,
  hopLeft as hopLeftToken,
  hopRight as hopRightToken,
  tokenKeymap,
} from '../semanticToken/tokenKeymap';
import { getWikiLinkActivation } from './wikiLinkActivation';
import { isWikiLinkNode } from './wikiLinkEngagement';
import type { ResolveWikiLink } from './wikiLinkResolution';

/**
 * WikiLink-specific entry points onto the generic hop mechanism
 * (`semanticToken/tokenKeymap.ts`) — kept as their own named exports
 * since they're exercised directly in tests.
 */
export function hopRight(view: EditorView): boolean {
  return hopRightToken(view, isWikiLinkNode);
}

export function hopLeft(view: EditorView): boolean {
  return hopLeftToken(view, isWikiLinkNode);
}

/**
 * Enter, when the caret is adjacent to an at-rest WikiLink: activates it,
 * the same action a click would perform — a thin adapter over the generic
 * `activateAdjacentToken` mechanism.
 */
export function activateAdjacent(getResolver: () => ResolveWikiLink | undefined): Command {
  return (view) =>
    activateAdjacentToken(view, isWikiLinkNode, (v, node) => getWikiLinkActivation(v, node, getResolver));
}

/**
 * Key bindings for WikiLinks — a thin adapter over the generic
 * `tokenKeymap` mechanism, shared by every semantic inline construct kind
 * (docs/editor-architecture-decisions.md §11).
 */
export function wikiLinkKeymap(getResolver: () => ResolveWikiLink | undefined): Extension {
  return tokenKeymap(isWikiLinkNode, (view, node) => getWikiLinkActivation(view, node, getResolver));
}
