import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import {
  hopLeft as hopLeftToken,
  hopRight as hopRightToken,
  tokenKeymap,
} from '../semanticToken/tokenKeymap';
import { getTagActivation } from './tagActivation';
import { isTagNode } from './tagEngagement';
import type { ResolveTag } from './tagResolution';

/**
 * Tag-specific entry points onto the generic hop mechanism
 * (`semanticToken/tokenKeymap.ts`) — kept as their own named exports since
 * they're exercised directly in tests, mirroring `wikiLinkKeymap.ts`'s
 * `hopRight`/`hopLeft`.
 */
export function hopRight(view: EditorView): boolean {
  return hopRightToken(view, isTagNode);
}

export function hopLeft(view: EditorView): boolean {
  return hopLeftToken(view, isTagNode);
}

/**
 * Tag needs no construct-specific keyboard behavior beyond this — unlike
 * `wikiLinkKeymap.ts`, there is no concealed sub-range to hop over (a Tag
 * has no internal path/alias structure to conceal in the first place), so
 * this is a direct, unmodified pass-through to the generic hop mechanism.
 * Kept as its own file only to preserve the established layering
 * (`MarkdownEditor.tsx` imports exclusively from per-kind adapter folders,
 * never `semanticToken/*` directly).
 */
export function tagKeymap(getResolver: () => ResolveTag | undefined): Extension {
  return tokenKeymap(isTagNode, (view, node) => getTagActivation(view, node, getResolver));
}
