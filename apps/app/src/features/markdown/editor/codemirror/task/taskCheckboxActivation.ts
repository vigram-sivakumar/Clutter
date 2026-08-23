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
 *
 * `requestImmediateSave`, if supplied, is called *after* the dispatch —
 * by then `onDocChange` has already run synchronously (CM6's
 * `updateListener` fires within `dispatch()` itself), so
 * `PageOperations.commitEdit()` has already committed this toggle to the
 * session before the flush request reads it. This is the same `onFlush`
 * callback `MarkdownEditor` already exposes for blur (`onBlur:
 * onFlushRef.current?.()` in `createEditorView.ts`), reused verbatim, not
 * a new save path — it just requests the existing debounced autosave
 * (`PageOperations.requestSave` via `SaveCoordinator`) run now instead of
 * waiting out its normal ~2s window, specifically for this one discrete,
 * instant-feedback action. Called for every click that reaches this
 * function, including Alt-click — the "mere engage" Alt-click carve-out
 * (and the keyboard-hop mechanism it paralleled) was Clutter-authored
 * cursor repositioning, removed in the cursor/selection behavior reset;
 * every click now activates identically.
 */
export function getTaskCheckboxActivation(
  view: EditorView,
  node: TaskMarkerNodeRange,
  requestImmediateSave?: () => void
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
    requestImmediateSave?.();
  };
}
