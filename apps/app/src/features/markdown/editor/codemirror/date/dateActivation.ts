import type { EditorView } from '@codemirror/view';

import type { DateNodeRange } from './dateEngagement';
import { fallbackDateResolution, type ResolveDate } from './dateResolution';
import { scanDate } from './dateScanner';

/**
 * Scans a Date node's raw text and resolves it, exposing only the
 * `activate()` callback the generic hop/click/keyboard mechanism
 * (`semanticToken/tokenMouseHandlers.ts`, `semanticToken/tokenKeymap.ts`)
 * needs — shared by `dateMouseHandlers.ts` and `dateKeymap.ts`, mirroring
 * `wikiLinkActivation.ts`/`tagActivation.ts`. Returns `null` when the node
 * can't be re-scanned (only possible if the buffer changed out from under
 * a stale tree between parse and this call).
 */
export function getDateActivation(
  view: EditorView,
  node: DateNodeRange,
  getResolver: () => ResolveDate | undefined
): (() => void) | null {
  const raw = view.state.sliceDoc(node.from, node.to);
  const match = scanDate(raw, 0);
  if (!match) {
    return null;
  }

  const resolver = getResolver();
  const resolution = resolver?.(match.isoDate) ?? fallbackDateResolution();
  return () => resolution.activate();
}
