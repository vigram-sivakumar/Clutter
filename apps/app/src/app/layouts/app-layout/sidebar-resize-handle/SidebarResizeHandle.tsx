import { useRef, useState } from 'react';
import './SidebarResizeHandle.css';

export type SidebarResizeDirection = 'increase' | 'decrease';

interface SidebarResizeHandleProps {
  /** Current committed+live Sidebar width — the delta baseline for a new drag. */
  readonly currentWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  /**
   * Called on every pointermove while dragging — live visual update only.
   * `direction` reflects this move's actual pointer movement (instantaneous
   * step, not cumulative from drag start) so it flips live if the user
   * reverses mid-drag.
   */
  readonly onResize: (width: number, direction: SidebarResizeDirection) => void;
  /** Called once on pointerup/cancel with the final width — persists. */
  readonly onResizeEnd: (width: number) => void;
  /**
   * Mirrors this handle's own `isResizing` state outward — true from
   * pointerdown to pointerup/cancel — so the layout (AppLayout.tsx) knows
   * exactly when to clear its own tracked resize direction (a drag ending
   * must never leave a stale direction that could affect a later,
   * unrelated collapse/expand).
   */
  readonly onResizingChange?: (isResizing: boolean) => void;
}

/**
 * Thin hit area + visual bar docked to the Sidebar's right edge (rendered
 * as a sibling of <Sidebar> inside .app-layout__sidepanel, which already
 * owns position:relative — see AppLayout.tsx). Bidirectional resize
 * clamped to a fixed [minWidth, maxWidth] range regardless of where the
 * current drag started — not a per-drag floor.
 */
export function SidebarResizeHandle({
  currentWidth,
  minWidth,
  maxWidth,
  onResize,
  onResizeEnd,
  onResizingChange,
}: SidebarResizeHandleProps) {
  const [isResizing, setIsResizing] = useState(false);
  const dragState = useRef<{
    startX: number;
    startWidth: number;
    lastWidth: number;
    /** Previous pointer x — direction is this move's step vs. this, not vs. startX. */
    lastX: number;
    direction: SidebarResizeDirection;
  } | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startWidth: currentWidth,
      lastWidth: currentWidth,
      lastX: e.clientX,
      // Arbitrary until the first move reports a real step; onResize (and
      // thus this value) is never read before that happens.
      direction: 'increase',
    };
    setIsResizing(true);
    onResizingChange?.(true);
    // Pointer capture doesn't affect which element's CSS `cursor` the OS
    // shows while the pointer moves over the rest of the app, and the
    // handle's own hit area is only a few px wide — without this, the
    // cursor would flicker back to default the moment the pointer drifts
    // off the handle during a drag. Reverted in endDrag.
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag) return;
    const delta = e.clientX - drag.startX;
    const next = Math.min(maxWidth, Math.max(minWidth, drag.startWidth + delta));
    // Direction reflects this move's own step (vs. the pointer's previous
    // position), not the cumulative delta from drag start — a step of 0
    // (duplicate/no-op move event) keeps the last real direction rather
    // than guessing one.
    const step = e.clientX - drag.lastX;
    if (step > 0) drag.direction = 'increase';
    else if (step < 0) drag.direction = 'decrease';
    drag.lastX = e.clientX;
    drag.lastWidth = next;
    onResize(next, drag.direction);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragState.current = null;
    setIsResizing(false);
    onResizingChange?.(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    onResizeEnd(drag.lastWidth);
  }

  return (
    <div
      className="sidebar-resize-handle"
      data-resizing={isResizing || undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="sidebar-resize-handle__bar" />
    </div>
  );
}
