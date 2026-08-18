import type { EditorView } from '@codemirror/view';

import type { WikiLinkNodeRange } from './wikiLinkEngagement';
import { scanWikiLink } from './wikiLinkScanner';
import { fallbackWikiLinkResolution, type ResolveWikiLink } from './wikiLinkResolution';

/**
 * Scans a WikiLink node's raw text and resolves it, exposing only the
 * `activate()` callback the generic hop/click/keyboard mechanism
 * (`semanticToken/tokenMouseHandlers.ts`, `semanticToken/tokenKeymap.ts`)
 * needs — shared by `wikiLinkMouseHandlers.ts` and `wikiLinkKeymap.ts` so
 * the scan-then-resolve step exists in exactly one place rather than
 * duplicated per interaction mechanism. Returns `null` when the node
 * can't be re-scanned (only possible if the buffer changed out from under
 * a stale tree between parse and this call), matching
 * `GetTokenActivation`'s contract.
 */
export function getWikiLinkActivation(
  view: EditorView,
  node: WikiLinkNodeRange,
  getResolver: () => ResolveWikiLink | undefined
): (() => void) | null {
  const raw = view.state.sliceDoc(node.from, node.to);
  const match = scanWikiLink(raw, 0);
  if (!match) {
    return null;
  }

  const resolver = getResolver();
  const resolution = resolver?.(match.path, match.alias) ?? fallbackWikiLinkResolution(match.path);
  return () => resolution.activate();
}
