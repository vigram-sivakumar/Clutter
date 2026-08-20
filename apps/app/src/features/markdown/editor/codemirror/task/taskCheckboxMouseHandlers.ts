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
 */
export function handleTaskCheckboxClick(view: EditorView, pos: number, altKey: boolean): boolean {
  return handleTokenClick(view, pos, altKey, isTaskMarkerNode, getTaskCheckboxActivation);
}

export function taskCheckboxMouseHandlers(): Extension {
  return tokenMouseHandlers(isTaskMarkerNode, getTaskCheckboxActivation);
}
