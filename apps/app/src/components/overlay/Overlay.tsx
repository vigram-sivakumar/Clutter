import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';

import { TauriDragStrip } from '../tauri-drag-strip/TauriDragStrip';
import type { OverlayProps } from './Overlay.types';
import { useEscape } from './hooks/useEscape';
import { useOverlayPosition } from './hooks/useOverlayPosition';
import { useOverlayCenteredPosition } from './hooks/useOverlayCenteredPosition';
import { useOverlayFocus } from './hooks/useOverlayFocus';

import './Overlay.css';

const CENTERED_ANCHOR_PLACEHOLDER: RefObject<HTMLElement> = { current: null };

// Pointer travel (screen px) between press and click above which the gesture was a window drag, not a click.
const DRAG_MOVE_THRESHOLD_PX = 4;
// How long a drag-region click waits for a second press before it counts as a single click.
const DOUBLE_CLICK_WINDOW_MS = 350;

function isInDragRegion(target: EventTarget): boolean {
  return target instanceof Element && target.closest('[data-tauri-drag-region]') !== null;
}

export function Overlay(props: OverlayProps) {
  const {
    open,
    onClose,
    children,
    backdrop = 'transparent',
    scrim = 'default',
    animate = true,
    className,
    returnFocusRef,
    suppressReturnFocusRef,
    dismissible = true,
    dismissOnContextMenu = true,
    dragRegion = true,
  } = props;

  const isCentered = props.position === 'centered';
  const surfaceRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<{ screenX: number; screenY: number } | null>(null);
  const dragRegionDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const clearDragRegionDismissal = () => {
    if (dragRegionDismissTimerRef.current !== null) {
      clearTimeout(dragRegionDismissTimerRef.current);
      dragRegionDismissTimerRef.current = null;
    }
  };
  // A pending dismissal must not outlive the overlay (closed by Escape, a menu item, or unmount).
  useEffect(() => clearDragRegionDismissal, [open]);

  const focusRestoreRef = isCentered
    ? returnFocusRef
    : (returnFocusRef ?? props.anchorRef);

  useEscape({
    open: open && dismissible,
    onClose,
  });

  // Capture phase on the document: it runs before any row's or card's own `contextmenu` handler, and
  // stopping the event there is what keeps a second menu from opening in the same interaction.
  useEffect(() => {
    if (!open || !dismissible || !dismissOnContextMenu) {
      return;
    }
    const dismiss = (event: Event) => {
      // A text field inside the overlay keeps its native menu (copy, paste…).
      const target = event.target as HTMLElement | null;
      if (surfaceRef.current?.contains(target) && target?.closest('input, textarea, [contenteditable="true"]')) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('contextmenu', dismiss, true);
    return () => document.removeEventListener('contextmenu', dismiss, true);
  }, [open, dismissible, dismissOnContextMenu, onClose]);

  useOverlayFocus({
    open,
    returnFocusRef: focusRestoreRef,
    suppressReturnFocusRef,
  });

  const anchoredPosition = useOverlayPosition({
    open: open && !isCentered,
    anchorRef: isCentered ? CENTERED_ANCHOR_PLACEHOLDER : props.anchorRef,
    surfaceRef,
    side: isCentered ? 'bottom' : (props.side ?? 'bottom'),
    alignment: isCentered ? 'start' : (props.alignment ?? 'start'),
    offset: isCentered ? 6 : (props.offset ?? 6),
  });

  const centeredPosition = useOverlayCenteredPosition({
    open: open && isCentered,
    surfaceRef,
    top: isCentered ? props.top : undefined,
  });

  const overlayLayout = isCentered ? centeredPosition : anchoredPosition;

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="overlay">
      {backdrop !== false && (
        <div
          className={[
            'overlay__backdrop',
            `overlay__backdrop--${backdrop}`,
            scrim === 'strong' && 'overlay__backdrop--scrim-strong',
          ]
            .filter(Boolean)
            .join(' ')}
          onPointerDown={(event) => {
            // A second press inside the double-click window is the other half of a maximise/restore: cancel the
            // dismissal the first click scheduled.
            clearDragRegionDismissal();
            pressRef.current = isInDragRegion(event.target)
              ? { screenX: event.screenX, screenY: event.screenY }
              : null;
          }}
          onClick={(event) => {
            event.stopPropagation();
            // The press is what counts, not the click's target: the native window drag moves the window under the
            // pointer mid-gesture, so the resulting click can land on the backdrop itself.
            const press = pressRef.current;
            pressRef.current = null;
            if (!press && !isInDragRegion(event.target)) {
              if (dismissible) {
                onClose();
              }
              return;
            }
            // Drag region: a click is window chrome unless it is a plain, stationary single click. A drag moves the
            // pointer in screen space (the window moves with it), so it is skipped here.
            const moved =
              press !== null &&
              Math.hypot(event.screenX - press.screenX, event.screenY - press.screenY) > DRAG_MOVE_THRESHOLD_PX;
            if (!dismissible || moved || event.detail >= 2) {
              return;
            }
            // The first click of a double-click is indistinguishable from a single click, so dismissal waits out the
            // double-click window; a second press cancels it (see `onPointerDown`).
            clearDragRegionDismissal();
            dragRegionDismissTimerRef.current = setTimeout(() => {
              dragRegionDismissTimerRef.current = null;
              onCloseRef.current();
            }, DOUBLE_CLICK_WINDOW_MS);
          }}
        >
          {dragRegion && <TauriDragStrip />}
        </div>
      )}

      <div
        ref={surfaceRef}
        className="overlay__surface"
        style={{
          top: overlayLayout.top,
          bottom: overlayLayout.bottom,
          left: overlayLayout.left,
        }}
      >
        <div
          className={[
            'overlay__content',
            className,
            animate && 'overlay__content--animated',
            animate && `overlay__content--${overlayLayout.placement}`,
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            transformOrigin: overlayLayout.transformOrigin,
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
