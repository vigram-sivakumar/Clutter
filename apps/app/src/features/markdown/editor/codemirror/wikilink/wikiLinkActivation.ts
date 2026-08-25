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
 *
 * Also returns `null` for an empty or whitespace-only path (`[[]]`,
 * `[[ ]]`) — same guard, same reasoning as `renderWikiLink`'s: without
 * it, a click resolves the empty path through the ordinary `unresolved`
 * branch and activates create-and-open with an empty title. `null` here
 * means `handleTokenClick` treats the click as unhandled and falls
 * through to CM6's default click-to-position-cursor — which, per
 * `wikiLinkAutocomplete.ts`'s `reactivateOnEnteringEmptyReference`, is
 * exactly what lets the user click into an empty reference and get
 * autocomplete instead of an accidental new page.
 */
export function getWikiLinkActivation(
  view: EditorView,
  node: WikiLinkNodeRange,
  getResolver: () => ResolveWikiLink | undefined
): (() => void) | null {
  const raw = view.state.sliceDoc(node.from, node.to);
  const match = scanWikiLink(raw, 0);
  if (!match || !match.path.trim()) {
    return null;
  }

  const resolver = getResolver();
  const resolution = resolver?.(match.path, match.alias) ?? fallbackWikiLinkResolution(match.path);
  return () => resolution.activate();
}
