import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { handleTokenClick, tokenMouseHandlers } from '../semanticToken/tokenMouseHandlers';
import { getLinkActivation } from './linkActivation';
import { isLinkNode } from './linkEngagement';

/**
 * Link-specific entry point onto the generic click mechanism
 * (`semanticToken/tokenMouseHandlers.ts`) — kept as its own named export
 * since it's exercised directly in tests, mirroring
 * `wikiLinkMouseHandlers.ts`'s `handleWikiLinkClick`.
 */
export function handleLinkClick(view: EditorView, pos: number, altKey: boolean): boolean {
  return handleTokenClick(view, pos, altKey, isLinkNode, getLinkActivation);
}

/**
 * Mouse interaction for explicit Markdown Links — a thin adapter over the
 * generic `tokenMouseHandlers` mechanism, shared by every semantic inline
 * construct kind. `findAtRestTokenAt`'s own engaged-node exclusion (see
 * `tokenEngagement.ts`) is what makes clicking an already-engaged/raw Link
 * behave as ordinary text editing rather than navigation — no separate
 * logic needed here for that distinction.
 */
export function linkMouseHandlers(): Extension {
  return tokenMouseHandlers(isLinkNode, getLinkActivation);
}
