/**
 * FloatingMenu - Positioning and interaction layer for floating UI
 *
 * This component sits between FloatingContainer (pure primitive) and
 * menu content components (SlashCommandMenu, AtMentionMenu, etc).
 *
 * Responsibilities:
 * - Manage scroll locking (using reference-counted utility)
 * - Pass through positioning to FloatingContainer
 * - Handle interaction signals (outside clicks, ESC key)
 * - Provide consistent behavior across all floating menus
 * - Constrain positioning within boundaries (optional, for toolbars)
 *
 * Does NOT handle:
 * - Menu content (that's SlashCommandMenu, etc)
 * - Position calculation (that's done by menu components)
 * - Portal rendering (that's FloatingContainer)
 * - Dismissal decisions (parent decides via onInteractOutside)
 */

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FloatingContainer, FloatingPosition } from './FloatingContainer';
import { acquireScrollLock, releaseScrollLock } from '../../utils/scrollLock';

export interface FloatingMenuProps {
  isOpen: boolean;
  position: FloatingPosition;
  children: ReactNode;
  className?: string;
  lockScroll?: boolean;
  dismissOnEscape?: boolean;
  onInteractOutside?: (event: MouseEvent | KeyboardEvent) => void;
  // boundaryRect constrains floating UI horizontally.
  // Used for content-attached UI (e.g. FloatingToolbar).
  // Menus intentionally do not pass this.
  boundaryRect?: DOMRect;
}

export const FloatingMenu = ({
  isOpen,
  position,
  children,
  className,
  lockScroll = false,
  dismissOnEscape = false,
  onInteractOutside,
  boundaryRect,
}: FloatingMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuWidth, setMenuWidth] = useState<number | null>(null);

  // Measure menu width for boundary clamping
  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    setMenuWidth(rect.width);
  }, [isOpen, children]); // Re-measure if content changes

  // Manage scroll lock lifecycle
  useEffect(() => {
    if (!isOpen || !lockScroll) return;

    acquireScrollLock();
    return () => {
      releaseScrollLock();
    };
  }, [isOpen, lockScroll]);

  // Handle ESC key dismissal
  useEffect(() => {
    if (!isOpen || !dismissOnEscape || !onInteractOutside) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onInteractOutside(e); // Signal, parent decides
        e.stopPropagation();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, dismissOnEscape, onInteractOutside]);

  // Clamp position horizontally if boundary is provided
  let finalPosition = position;
  if (boundaryRect && menuWidth && position.left !== undefined) {
    const halfWidth = menuWidth / 2;
    const padding = 8; // Minimum distance from boundary edges

    // Calculate min/max allowed left position (accounting for centering transform)
    const minLeft = boundaryRect.left + halfWidth + padding;
    const maxLeft = boundaryRect.right - halfWidth - padding;

    // Clamp the left position
    const clampedLeft = Math.max(minLeft, Math.min(maxLeft, position.left));

    finalPosition = {
      ...position,
      left: clampedLeft,
    };
  }

  return (
    <FloatingContainer
      isOpen={isOpen}
      position={finalPosition}
      className={className}
      onInteractOutside={onInteractOutside}
    >
      <div ref={menuRef}>{children}</div>
    </FloatingContainer>
  );
};
