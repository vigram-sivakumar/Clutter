import { useRef, useState } from 'react';
import './SidebarResizeHandle.css';

/** Below this, a pointerdown->pointerup with no move beyond it is a click, not a resize drag. */
const CLICK_MOVEMENT_THRESHOLD_PX = 3;

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
   * Mirrors this handle's own `isResizing` state outward — true only once
   * an active pointer interaction has moved past the click threshold (a
   * plain click never sets this) — so the layout (AppLayout.tsx) can
   * suppress its collapse/expand transition specifically while manually
   * resizing (resize is always immediate, in both directions; collapse/
   * expand keeps the existing transition).
   */
  readonly onResizingChange?: (isResizing: boolean) => void;
  /** A single click (no drag) toggles Sidebar collapse/expand, immediately. */
  readonly onToggleCollapse?: () => void;
}

/**
 * Thin hit area + visual bar docked to the Sidebar's right edge (rendered
 * as a direct child of .app-layout — see AppLayout.tsx). Bidirectional
 * resize clamped to a fixed [minWidth, maxWidth] range regardless of where
 * the current drag started — not a per-drag floor.
 *
 * Click/drag disambiguation is manual (not native onClick) because a real
 * drag and a click share the same pointerdown->pointerup sequence here:
 * only once movement exceeds CLICK_MOVEMENT_THRESHOLD_PX does this become
 * a resize (entering isResizing, disabling the page transition); a
 * pointerup before that threshold fires onToggleCollapse immediately.
 */
export function SidebarResizeHandle({
  currentWidth,
  minWidth,
  maxWidth,
  onResize,
  onResizeEnd,
  onResizingChange,
  onToggleCollapse,
}: SidebarResizeHandleProps) {
  const [isResizing, setIsResizing] = useState(false);
  const dragState = useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    lastWidth: number;
    hasMoved: boolean;
  } | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: currentWidth,
      lastWidth: currentWidth,
      hasMoved: false,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag) return;
    const delta = e.clientX - drag.startX;
    if (!drag.hasMoved) {
      const dy = e.clientY - drag.startY;
      if (Math.abs(delta) <= CLICK_MOVEMENT_THRESHOLD_PX && Math.abs(dy) <= CLICK_MOVEMENT_THRESHOLD_PX) {
        return; // still within click threshold — not a resize yet
      }
      drag.hasMoved = true;
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
    const next = Math.min(maxWidth, Math.max(minWidth, drag.startWidth + delta));
    drag.lastWidth = next;
    onResize(next);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragState.current = null;
    if (drag.hasMoved) {
      setIsResizing(false);
      onResizingChange?.(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      onResizeEnd(drag.lastWidth);
    } else {
      onToggleCollapse?.();
    }
  }

  function cancelDrag(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragState.current = null;
    if (drag.hasMoved) {
      setIsResizing(false);
      onResizingChange?.(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      onResizeEnd(drag.lastWidth);
    }
    // A cancelled (not completed) interaction never counts as a click.
  }

  return (
    <div
      className="sidebar-resize-handle"
      data-resizing={isResizing || undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={cancelDrag}
    >
      <div className="sidebar-resize-handle__bar" />
    </div>
  );
}
