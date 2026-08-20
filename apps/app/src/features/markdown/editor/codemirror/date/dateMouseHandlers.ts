import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { handleTokenClick, tokenMouseHandlers } from '../semanticToken/tokenMouseHandlers';
import { getDateActivation } from './dateActivation';
import { isDateNode } from './dateEngagement';
import type { ResolveDate } from './dateResolution';

/**
 * Date-specific entry point onto the generic click/Alt-click mechanism
 * (`semanticToken/tokenMouseHandlers.ts`) — kept as its own named export
 * since it's exercised directly in tests, mirroring
 * `handleWikiLinkClick`/`handleTagClick`.
 */
export function handleDateClick(
  view: EditorView,
  pos: number,
  altKey: boolean,
  getResolver: () => ResolveDate | undefined
): boolean {
  return handleTokenClick(view, pos, altKey, isDateNode, (v, node) =>
    getDateActivation(v, node, getResolver)
  );
}

/**
 * Mouse interaction for Dates — a thin adapter over the generic
 * `tokenMouseHandlers` mechanism, shared by every semantic inline
 * construct kind.
 */
export function dateMouseHandlers(getResolver: () => ResolveDate | undefined): Extension {
  return tokenMouseHandlers(isDateNode, (view, node) => getDateActivation(view, node, getResolver));
}
