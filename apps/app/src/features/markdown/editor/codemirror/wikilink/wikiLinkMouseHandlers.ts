import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { handleTokenClick, tokenMouseHandlers, type TokenMouseOptions } from '../semanticToken/tokenMouseHandlers';
import { getWikiLinkActivation } from './wikiLinkActivation';
import { isWikiLinkNode } from './wikiLinkEngagement';
import type { WikiLinkSourceContext } from '@core/vault/ingest/grammar/wikiLinkScanner';
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
  getResolver: () => ResolveWikiLink | undefined
): boolean {
  return handleTokenClick(view, pos, isWikiLinkNode, (v, node) =>
    getWikiLinkActivation(v, node, getResolver)
  );
}

/**
 * Mouse interaction for WikiLinks — a thin adapter over the generic
 * `tokenMouseHandlers` mechanism, shared by every semantic inline
 * construct kind (docs/editor-architecture-decisions.md §11).
 */
export function wikiLinkEditCaret(raw: string, to: number): number {
  return raw.endsWith(']]') ? to - 2 : to;
}

export function wikiLinkMouseHandlers(
  getResolver: () => ResolveWikiLink | undefined,
  context: WikiLinkSourceContext = 'prose',
  options: TokenMouseOptions = {}
): Extension {
  return tokenMouseHandlers(
    isWikiLinkNode,
    (view, node) => getWikiLinkActivation(view, node, getResolver, context),
    // ⌘-click reveals the raw `[[…]]` and puts the caret just before the closing `]]` — the end of the target, or of
    // the alias when there is one — where editing and completion pick up.
    (view, node) => wikiLinkEditCaret(view.state.sliceDoc(node.from, node.to), node.to),
    options
  );
}
