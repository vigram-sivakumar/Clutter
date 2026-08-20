import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { handleTokenClick, tokenMouseHandlers } from '../semanticToken/tokenMouseHandlers';
import { getTaskCheckboxActivation } from './taskCheckboxActivation';
import { isTaskMarkerNode } from './taskEngagement';

/**
 * Task-specific entry point onto the generic click/Alt-click mechanism
 * (`semanticToken/tokenMouseHandlers.ts`) — kept as its own named export
 * since it's exercised directly in tests, mirroring `handleDateClick`.
 * Alt-click still engages (reveals the raw `[ ]`/`[x]` text) rather than
 * toggling — same as every other semantic token kind, not a checkbox-
 * specific carve-out.
 *
 * `requestImmediateSave` is threaded straight through to
 * `getTaskCheckboxActivation` — see that function's own doc comment for
 * why. Alt-click never reaches it (it never calls `activate()`), so a
 * mere engage never triggers a save.
 */
export function handleTaskCheckboxClick(
  view: EditorView,
  pos: number,
  altKey: boolean,
  requestImmediateSave?: () => void
): boolean {
  return handleTokenClick(view, pos, altKey, isTaskMarkerNode, (v, node) =>
    getTaskCheckboxActivation(v, node, requestImmediateSave)
  );
}

export function taskCheckboxMouseHandlers(requestImmediateSave?: () => void): Extension {
  return tokenMouseHandlers(isTaskMarkerNode, (view, node) =>
    getTaskCheckboxActivation(view, node, requestImmediateSave)
  );
}
