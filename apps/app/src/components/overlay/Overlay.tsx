import { createPortal } from 'react-dom';
import { useRef } from 'react';
import { OverlayProps } from './Overlay.types';
import './Overlay.css';
// Hooks
import { useEscape } from './hooks/useEscape';
import { usePosition } from './hooks/usePosition';
import { useRestoreFocus } from './hooks/useRestoreFocus';

export function Overlay({
  open,
  anchorRef,
  offset = 6,
  placement = 'bottom-start',
  onClose,
  children,
  backdrop = true,
  animate = true,
}: OverlayProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEscape({
    open,
    onClose,
  });

  useRestoreFocus({
    open,
    anchorRef,
  });

  const position = usePosition({
    open,
    anchorRef,
    surfaceRef,
    placement,
    offset,
  });

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="overlay">
      {backdrop && <div className="overlay__backdrop" onClick={onClose} />}

      <div
        ref={surfaceRef}
        className="overlay__surface"
        style={{
          top: position.top,
          left: position.left,
        }}
      >
        <div
          className={[
            'overlay__content',
            animate && 'overlay__content--animated',
            animate && `overlay__content--${position.side}`,
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            transformOrigin: position.transformOrigin,
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
