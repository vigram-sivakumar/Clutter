import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { handleTokenClick, tokenMouseHandlers } from '../semanticToken/tokenMouseHandlers';
import { getTaskCheckboxActivation } from './taskCheckboxActivation';
import { isTaskMarkerNode } from './taskEngagement';

/**
 * Task-specific entry point onto the generic click mechanism
 * (`semanticToken/tokenMouseHandlers.ts`) — kept as its own named export
 * since it's exercised directly in tests, same rationale as
 * `handleTagClick`/`handleWikiLinkClick`: jsdom has no `posAtCoords`
 * geometry, so tests call this with an explicit position instead of
 * synthesizing real click coordinates.
 */
export function handleTaskCheckboxClick(
  view: EditorView,
  pos: number,
  requestImmediateSave?: () => void
): boolean {
  return handleTokenClick(view, pos, false, isTaskMarkerNode, (v, node) =>
    getTaskCheckboxActivation(v, node, requestImmediateSave)
  );
}

/**
 * The task checkbox's click entry point — rebuilding exactly the gap
 * `MarkdownEditor.tsx`'s own comment already named ("click-driven
 * checkbox toggling is disabled, not just its visual widget...
 * `taskCheckboxActivation.ts`'s own toggle logic is untouched and still
 * fully covered by its own tests — only the mouse-click entry point onto
 * it needs rebuilding").
 *
 * A thin adapter over the exact same generic `tokenMouseHandlers`
 * mechanism already shared by WikiLink/Tag/Date
 * (`wikiLinkMouseHandlers.ts`/`tagMouseHandlers.ts`/`dateMouseHandlers.ts`)
 * — not a new click-handling mechanism. `isTaskMarkerNode` and
 * `getTaskCheckboxActivation` are reused unchanged; this file adds zero
 * new logic beyond the adapter closure itself, mirroring
 * `wikiLinkMouseHandlers`'s own shape exactly.
 */
export function taskCheckboxMouseHandlers(requestImmediateSave?: () => void): Extension {
  return tokenMouseHandlers(isTaskMarkerNode, (view, node) =>
    getTaskCheckboxActivation(view, node, requestImmediateSave)
  );
}
