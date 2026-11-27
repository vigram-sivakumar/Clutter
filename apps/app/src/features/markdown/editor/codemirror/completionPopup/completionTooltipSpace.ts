import { getTooltip, showTooltip, tooltips } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

import { COLLISION_PADDING } from '@components/overlay/collisionPadding';

/**
 * The area the editor's completion popup (and any other CM6 tooltip) may occupy: the window inset by the same
 * `COLLISION_PADDING` the shared `Overlay` keeps. CM6's default is the bare window, so a popup anchored near the
 * right or bottom edge ran flush against it; with this it is shifted in and stops short of the edge like a menu.
 */
export function completionTooltipSpace(view: EditorView): { top: number; left: number; right: number; bottom: number } {
  const win = view.dom.ownerDocument.defaultView ?? window;
  return {
    top: COLLISION_PADDING,
    left: COLLISION_PADDING,
    right: win.innerWidth - COLLISION_PADDING,
    bottom: win.innerHeight - COLLISION_PADDING,
  };
}

export const completionTooltipSpaceExtension = (): Extension => tooltips({ tooltipSpace: completionTooltipSpace });

/** Resolve the actual completion tooltip owned by this view, even when
 * CodeMirror hosts it outside the editor. Never search another editor's
 * popup or depend on where CodeMirror puts its theme container. */
export function completionPopupDOM(view: EditorView): HTMLElement | null {
  for (const tooltip of view.state.facet(showTooltip)) {
    if (tooltip === null) continue;
    const dom = getTooltip(view, tooltip)?.dom;
    if (dom?.classList.contains('cm-tooltip-autocomplete')) return dom;
  }
  return null;
}
