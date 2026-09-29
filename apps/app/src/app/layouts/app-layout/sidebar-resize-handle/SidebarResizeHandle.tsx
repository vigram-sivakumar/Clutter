import { useRef, useState } from 'react';
import './SidebarResizeHandle.css';

interface SidebarResizeHandleProps {
  /** Current committed+live Sidebar width — the delta baseline for a new drag. */
  readonly currentWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  /** Called on every pointermove while dragging — live visual update only. */
  readonly onResize: (width: number) => void;
  /** Called once on pointerup/cancel with the final width — persists. */
  readonly onResizeEnd: (width: number) => void;
  /**
   * Mirrors this handle's own `isResizing` state outward — true from
   * pointerdown to pointerup/cancel — so the layout (AppLayout.tsx) can
   * suppress its collapse/expand transition for exactly the duration of an
   * active drag, without the layout needing its own separate notion of
   * "is resizing."
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
  const dragState = useRef<{ startX: number; startWidth: number; lastWidth: number } | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startWidth: currentWidth, lastWidth: currentWidth };
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
    drag.lastWidth = next;
    onResize(next);
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
