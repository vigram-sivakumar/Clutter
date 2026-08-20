import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import {
  hopLeft as hopLeftToken,
  hopRight as hopRightToken,
  tokenKeymap,
} from '../semanticToken/tokenKeymap';
import { getDateActivation } from './dateActivation';
import { isDateNode } from './dateEngagement';
import type { ResolveDate } from './dateResolution';

/**
 * Date-specific entry points onto the generic hop mechanism
 * (`semanticToken/tokenKeymap.ts`) — kept as their own named exports since
 * they're exercised directly in tests, mirroring `wikiLinkKeymap.ts`/`tagKeymap.ts`.
 */
export function hopRight(view: EditorView): boolean {
  return hopRightToken(view, isDateNode);
}

export function hopLeft(view: EditorView): boolean {
  return hopLeftToken(view, isDateNode);
}

/**
 * Date needs no construct-specific keyboard behavior beyond this — no
 * concealed sub-range to hop over, same reasoning as `tagKeymap.ts`. Kept
 * as its own file only to preserve the established layering
 * (`MarkdownEditor.tsx` imports exclusively from per-kind adapter
 * folders, never `semanticToken/*` directly).
 */
export function dateKeymap(getResolver: () => ResolveDate | undefined): Extension {
  return tokenKeymap(isDateNode, (view, node) => getDateActivation(view, node, getResolver));
}
