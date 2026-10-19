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
  const pressStartedOnDragRegionRef = useRef(false);

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
            pressStartedOnDragRegionRef.current = isInDragRegion(event.target);
          }}
          onClick={(event) => {
            event.stopPropagation();
            // The drag strip lives inside the backdrop. A press that began on it is window chrome (drag, or a
            // double-click to maximise/restore), never a click outside the overlay. The press is what counts, not
            // the click's target: the native resize moves the window under the pointer mid-gesture, so the
            // resulting click can land on the backdrop itself, or on the backdrop as the common ancestor.
            const pressedOnDragRegion = pressStartedOnDragRegionRef.current;
            pressStartedOnDragRegionRef.current = false;
            if (pressedOnDragRegion || isInDragRegion(event.target)) {
              return;
            }
            if (dismissible) {
              onClose();
            }
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
