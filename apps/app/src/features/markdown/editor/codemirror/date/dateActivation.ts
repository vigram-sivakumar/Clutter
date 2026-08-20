import type { EditorView } from '@codemirror/view';

import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';

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
 * a stale tree between parse and this call), **or** when the shape-valid
 * text isn't a real calendar date (`2026-13-45`) — a `null` here means
 * "no token to activate," which is what makes an invalid Date behave as
 * non-interactive at the mouse/keyboard layer: `tokenMouseHandlers.ts`'s
 * `handleTokenClick` treats a `null` activation exactly like "no token
 * was here at all" — it returns `false` without calling
 * `preventDefault()`, so a plain click on an invalid Date falls through
 * to ordinary browser click behavior (caret placement, which — since the
 * position is inside the node's range — engages it for editing) instead
 * of consuming the click for a no-op navigation. This is enforced here,
 * once, rather than relying on `resolveDate.ts`'s own `isValidCalendarDate`
 * guard inside `activate()` — that guard stays as defense in depth, but
 * this is what actually gives the click back to the editor. `DateWidget`
 * performs the identical `isValidCalendarDate` check for its own,
 * separate reason (choosing the at-rest render), never shared code with
 * this on purpose (rendering and interaction are already-established
 * separate concerns for every semantic token kind), but the same
 * classification.
 */
export function getDateActivation(
  view: EditorView,
  node: DateNodeRange,
  getResolver: () => ResolveDate | undefined
): (() => void) | null {
  const raw = view.state.sliceDoc(node.from, node.to);
  const match = scanDate(raw, 0);
  if (!match || !isValidCalendarDate(match.isoDate)) {
    return null;
  }

  const resolver = getResolver();
  const resolution = resolver?.(match.isoDate) ?? fallbackDateResolution();
  return () => resolution.activate();
}
