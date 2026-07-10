import { createPortal } from 'react-dom';
import { useRef } from 'react';
import { OverlayProps } from './types';
import './Overlay.css';
// Hooks
import { useEscape } from './hooks/useEscape';
import { usePosition } from './hooks/usePosition';

export function Overlay({
  open,
  anchorRef,
  offset = 6,
  placement = 'bottom-start',
  onClose,
  children,
  backdrop = true,
  dismissOnOutsideClick = true,
}: OverlayProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEscape({
    open,
    onClose,
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
      {backdrop && (
        <div
          className="overlay__backdrop"
          onClick={dismissOnOutsideClick ? onClose : undefined}
        />
      )}

      <div
        ref={surfaceRef}
        className="overlay__surface"
        style={{
          top: position.top,
          left: position.left,
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
