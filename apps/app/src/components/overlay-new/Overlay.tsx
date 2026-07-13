import { createPortal } from 'react-dom';
import { useRef } from 'react';
import './Overlay.css';
// Props
import type { OverlayProps } from './Overlay.types';

export function Overlay({
  open,
  onClose,
  anchorRef,
  offset = 4,
  side = 'bottom',
  alignment = 'start',
  backdrop = 'transparent',
  animate = true,
  children,
}: OverlayProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  if (!open) {
    return null;
  }

  const anchorElement = anchorRef.current;
  if (!anchorElement) {
    return null;
  }

  return createPortal(
    <div className="overlay">
      {backdrop !== false && (
        <div className={`overlay__backdrop overlay__backdrop--${backdrop}`} />
      )}
      <div ref={surfaceRef} className="overlay__surface">
        <div
          className={`overlay__content ${animate ? `overlay__content--animate` : ''}`}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
