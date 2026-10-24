import { tooltips } from '@codemirror/view';
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
