import { useRef } from 'react';
import { createPortal } from 'react-dom';

import type { OverlayProps } from './Overlay.types';
import { useEscape } from './hooks/useEscape';
import { useOverlayPosition } from './hooks/useOverlayPosition';
import { useOverlayFocus } from './hooks/useOverlayFocus';

import './Overlay.css';

export function Overlay({
  open,
  anchorRef,
  side = 'bottom',
  alignment = 'start',
  offset = 6,
  onClose,
  children,
  backdrop = 'transparent',
  animate = true,
  className,
}: OverlayProps) {
  // Used to measure and position the overlay.
  const surfaceRef = useRef<HTMLDivElement>(null);

  // Close the overlay when Escape is pressed.
  useEscape({
    open,
    onClose,
  });

  // Return focus to the trigger after the overlay closes.
  useOverlayFocus({
    open,
    anchorRef,
    overlayRef: surfaceRef,
  });

  // Calculate where the overlay should appear.
  const overlayPosition = useOverlayPosition({
    open,
    anchorRef,
    surfaceRef,
    side,
    alignment,
    offset,
  });

  // Don't render anything while the overlay is closed.
  if (!open) {
    return null;
  }

  return createPortal(
    // Render the overlay above the rest of the application.
    <div className="overlay">
      {/* Optional backdrop for outside clicks and visual dimming. */}
      {backdrop !== false && (
        <div
          className={`overlay__backdrop overlay__backdrop--${backdrop}`}
          // React bubbles a portaled event through the *component* tree,
          // not the DOM tree — this backdrop is a DOM sibling of whatever
          // rendered the Overlay (e.g. a sidebar row), but a React-tree
          // descendant of it (via the anchor's actions prop). Without
          // stopping propagation here, closing the menu on an outside
          // click lets the same click event continue bubbling up into
          // that ancestor's own onClick (e.g. the row's "open" handler).
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        />
      )}

      {/* Positions the overlay next to its anchor. */}
      <div
        ref={surfaceRef}
        className="overlay__surface"
        style={{
          top: overlayPosition.top,
          left: overlayPosition.left,
        }}
      >
        {/* The visible panel that handles animation and styling. */}
        <div
          className={[
            'overlay__content',
            className,
            animate && 'overlay__content--animated',
            animate && `overlay__content--${overlayPosition.side}`,
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            transformOrigin: overlayPosition.transformOrigin,
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
