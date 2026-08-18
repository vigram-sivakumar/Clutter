import type { Extension } from '@codemirror/state';

import { tokenSelectionSnap } from '../semanticToken/tokenSelectionSnap';
import { isWikiLinkNode } from './wikiLinkEngagement';

/**
 * WikiLink-specific entry point onto the generic selection-snap mechanism
 * (`semanticToken/tokenSelectionSnap.ts`) — see that module for the full
 * rationale.
 */
export function wikiLinkSelectionSnap(): Extension {
  return tokenSelectionSnap(isWikiLinkNode);
}
