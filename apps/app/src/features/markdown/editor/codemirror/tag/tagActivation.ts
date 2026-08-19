import type { EditorView } from '@codemirror/view';

import type { TagNodeRange } from './tagEngagement';
import { fallbackTagResolution, type ResolveTag } from './tagResolution';
import { scanTag } from './tagScanner';

/**
 * Scans a Tag node's raw text and resolves it, exposing only the
 * `activate()` callback the generic hop/click/keyboard mechanism
 * (`semanticToken/tokenMouseHandlers.ts`, `semanticToken/tokenKeymap.ts`)
 * needs — shared by `tagMouseHandlers.ts` and `tagKeymap.ts` so the
 * scan-then-resolve step exists in exactly one place, mirroring
 * `wikiLinkActivation.ts`. Returns `null` when the node can't be
 * re-scanned (only possible if the buffer changed out from under a stale
 * tree between parse and this call).
 */
export function getTagActivation(
  view: EditorView,
  node: TagNodeRange,
  getResolver: () => ResolveTag | undefined
): (() => void) | null {
  const raw = view.state.sliceDoc(node.from, node.to);
  const match = scanTag(raw, 0);
  if (!match) {
    return null;
  }

  const resolver = getResolver();
  const resolution = resolver?.(match.name) ?? fallbackTagResolution();
  return () => resolution.activate();
}
