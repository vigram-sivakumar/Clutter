import { useRef } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';

import type { OverlayProps } from './Overlay.types';
import { useEscape } from './hooks/useEscape';
import { useOverlayPosition } from './hooks/useOverlayPosition';
import { useOverlayCenteredPosition } from './hooks/useOverlayCenteredPosition';
import { useOverlayFocus } from './hooks/useOverlayFocus';

import './Overlay.css';

const CENTERED_ANCHOR_PLACEHOLDER: RefObject<HTMLElement> = { current: null };

export function Overlay(props: OverlayProps) {
  const {
    open,
    onClose,
    children,
    backdrop = 'transparent',
    animate = true,
    className,
    returnFocusRef,
    suppressReturnFocusRef,
  } = props;

  const isCentered = props.position === 'centered';
  const surfaceRef = useRef<HTMLDivElement>(null);

  const focusRestoreRef = isCentered
    ? returnFocusRef
    : (returnFocusRef ?? props.anchorRef);

  useEscape({
    open,
    onClose,
  });

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
  });

  const overlayLayout = isCentered ? centeredPosition : anchoredPosition;

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="overlay">
      {backdrop !== false && (
        <div
          className={`overlay__backdrop overlay__backdrop--${backdrop}`}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        />
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
