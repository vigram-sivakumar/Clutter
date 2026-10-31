import { useLayoutEffect } from 'react';
import type { PointerDragSession } from '@shared/interaction';
import { createDragVisuals } from './dragVisuals';

export {
  DRAG_GHOST_FOLLOW_ATTRIBUTE,
  DRAG_GHOST_RETURN_MS,
  DRAG_GHOST_SETTLE_MS,
  DRAG_GHOST_SIZE_ATTRIBUTE,
  DRAG_GHOST_WIDTH_PX,
} from './dragVisuals';

interface DragGhostProps {
  readonly session: PointerDragSession;
}

/**
 * The drag visuals of a drag whose host ends them by unmounting this (the sidebar tree, the property list): it
 * starts the one shared system (`dragVisuals.ts`) for `session` and disposes it with the component. A host that needs
 * to hold, commit or cancel the visuals (a Collection View) uses `createDragVisuals` directly. It renders nothing:
 * the clones live in the system's own overlay.
 */
export function DragGhost({ session }: DragGhostProps) {
  useLayoutEffect(() => {
    const visuals = createDragVisuals();
    visuals.start(session);
    return () => visuals.dispose();
  }, [session]);

  return null;
}
