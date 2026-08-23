import { syntaxTree } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { findTaskMarker, markerRange } from '../highlight/listMarkerDecoration';
import { handleTokenClick, isWithinTokenBounds } from '../semanticToken/tokenMouseHandlers';
import { getTaskCheckboxActivation } from './taskCheckboxActivation';
import { isTaskMarkerNode } from './taskEngagement';

/**
 * A click on the checkbox widget resolves, via `posAtCoords`, to a
 * position within the range `listMarkerDecoration.ts` actually replaced —
 * the combined `"- [ ]"` unit, starting at the dash — not the
 * `TaskMarker`'s own narrower `[ ]` sub-range the generic
 * `tokenEngagement.ts`/`tokenMouseHandlers.ts` machinery expects.
 * Confirmed live, two distinct failures from this mismatch:
 *
 *  1. A raw click position (e.g. the combined range's own start, at the
 *     dash) falls outside the `TaskMarker`'s own range entirely, so a
 *     plain `findAtRestTokenAt` lookup there misses it — snapping to just
 *     inside the actual `TaskMarker` (`pos` below) fixes this.
 *  2. Even after that snap, `isWithinTokenBounds`'s own geometry check
 *     (`coordsAtPos` on the `TaskMarker`'s own boundaries) breaks: both of
 *     those boundary positions are now *interior* to the wider replaced
 *     widget, not at its edges, so CM6 can't give them independent
 *     coordinates — both collapsed to the same degenerate point in
 *     testing, rejecting every click regardless of where it actually
 *     landed. Bounds-checking against the full combined `range` (the
 *     widget's real rendered extent) instead of the `TaskMarker`'s own
 *     range fixes this.
 *
 * Both fixes are local to this file — the generic, shared
 * `tokenMouseHandlers.ts`/`tokenEngagement.ts` machinery every other
 * semantic token kind (dates, WikiLinks, tags) still relies on is
 * untouched.
 */
interface TaskClickResolution {
  /** Position just inside the actual `TaskMarker`, for the generic click/activation lookup. */
  pos: number;
  /** The full rendered widget's range (the combined `"- [ ]"` unit) — what bounds-checking must measure against. */
  range: { from: number; to: number };
}

function resolveTaskClick(view: EditorView, pos: number): TaskClickResolution | null {
  let node = syntaxTree(view.state).resolveInner(pos, 1);
  for (; node; node = node.parent!) {
    if (node.name !== 'ListItem') {
      continue;
    }
    const taskMarker = findTaskMarker(node);
    const range = markerRange(node);
    if (taskMarker && range && pos >= range.from && pos <= range.to) {
      return { pos: taskMarker.from + 1, range };
    }
    break;
  }
  return null;
}

/**
 * Task-specific entry point onto the click mechanism — kept as its own
 * named export since it's exercised directly in tests, mirroring
 * `handleDateClick`. `altKey` is accepted but no longer changes behavior
 * — see `tokenMouseHandlers.ts`'s `handleTokenClick` doc comment for why.
 *
 * `requestImmediateSave` is threaded straight through to
 * `getTaskCheckboxActivation` — see that function's own doc comment for
 * why. Called for every click that reaches `activate()`, Alt-click
 * included.
 */
export function handleTaskCheckboxClick(
  view: EditorView,
  pos: number,
  altKey: boolean,
  requestImmediateSave?: () => void
): boolean {
  const resolved = resolveTaskClick(view, pos);
  return handleTokenClick(view, resolved?.pos ?? pos, altKey, isTaskMarkerNode, (v, node) =>
    getTaskCheckboxActivation(v, node, requestImmediateSave)
  );
}

/**
 * Not built on the fully generic `tokenMouseHandlers()` (unlike
 * date/WikiLink/tag) specifically because of `resolveTaskClick` above —
 * both the position-snap and the bounds-check need the combined marker
 * range, which the generic wrapper has no hook for. Everything else
 * mirrors it exactly.
 */
export function taskCheckboxMouseHandlers(requestImmediateSave?: () => void): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0) {
        return false;
      }

      const rawPos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (rawPos == null) {
        return false;
      }

      const resolved = resolveTaskClick(view, rawPos);
      if (resolved && !isWithinTokenBounds(view, resolved.range, event.clientX, event.clientY)) {
        return false;
      }

      const handled = handleTaskCheckboxClick(view, rawPos, event.altKey, requestImmediateSave);
      if (handled) {
        event.preventDefault();
      }
      return handled;
    },
  });
}
