import type { EditorView } from '@codemirror/view';

import type { TaskMarkerNodeRange } from './taskEngagement';

/**
 * Toggles the single state character inside a `TaskMarker` (`[ ]` ↔
 * `[x]`) via a normal CM6 document dispatch — the same mechanism as any
 * other keystroke, so the change flows out through the existing
 * `onDocChange` pipeline with zero new plumbing. Deliberately never
 * touches `TaskExtractor`/`TaskOperations`/`PageOperations`/`Vault`: those
 * exist for callers with only a `TaskOccurrence` reference and no open
 * editor (the sidebar); the editor already has the live document and the
 * node's exact position, so there is nothing to look up.
 *
 * Always writes canonical lowercase `x` regardless of whether the read
 * character was `x` or `X` — "lenient reader, strict writer"
 * (docs/editor-architecture-decisions.md), the same convention every other
 * construct's writer already follows.
 */
export function getTaskCheckboxActivation(
  view: EditorView,
  node: TaskMarkerNodeRange
): (() => void) | null {
  const stateCharFrom = node.from + 1;
  const stateCharTo = node.from + 2;
  if (stateCharTo > node.to) {
    // Only possible if the buffer changed out from under a stale tree
    // between parse and this call — nothing valid to toggle this pass.
    return null;
  }

  const currentChar = view.state.sliceDoc(stateCharFrom, stateCharTo);
  const nextChar = currentChar.toLowerCase() === 'x' ? ' ' : 'x';

  return () => {
    view.dispatch({
      changes: { from: stateCharFrom, to: stateCharTo, insert: nextChar },
    });
  };
}
