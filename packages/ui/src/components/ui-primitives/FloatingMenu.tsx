/**
 * FloatingMenu - Positioning and interaction layer for floating UI
 *
 * This component sits between FloatingContainer (pure primitive) and
 * menu content components (SlashCommandMenu, AtMentionMenu, etc).
 *
 * Responsibilities:
 * - Manage scroll locking (using reference-counted utility)
 * - Handle ALL layout policy (flip, clamp, measure)
 * - Handle interaction signals (outside clicks, ESC key)
 * - Provide consistent behavior across all floating menus
 * - Constrain positioning within boundaries (optional, for toolbars)
 * - Vertical flip with configurable preference:
 *   - preferAbove=false (default): Menus open below, flip above if insufficient space
 *   - preferAbove=true: Toolbars open above, flip below if insufficient space
 * - Viewport clamping (horizontal and vertical - prevents off-screen menus)
 * - Predictive flip calculation (using estimatedHeight when provided)
 *
 * Does NOT handle:
 * - Menu content (that's SlashCommandMenu, etc)
 * - Anchor point calculation (that's done by menu components)
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
  // estimatedHeight allows predictive flip calculation before measurement.
  // Used for menus with dynamic content (e.g., AtMentionMenu) to avoid flicker.
  // If not provided, uses measured height after render.
  estimatedHeight?: number;
  // preferAbove controls flip direction preference.
  // true = prefer opening above (toolbars), false = prefer opening below (menus)
  // Default: false (menus)
  preferAbove?: boolean;
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
  estimatedHeight,
  preferAbove = false,
}: FloatingMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuWidth, setMenuWidth] = useState<number | null>(null);
  const [menuHeight, setMenuHeight] = useState<number | null>(null);

  // Measure menu dimensions for positioning logic
  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    setMenuWidth(rect.width);
    setMenuHeight(rect.height);
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

  // Calculate final position with all layout policy applied
  const finalPosition = { ...position };

  // Vertical flip logic: decide whether to open above or below anchor
  // Use estimatedHeight for predictive flip (avoids flicker), or measured height
  const heightForFlip = estimatedHeight ?? menuHeight;
  
  if (
    heightForFlip !== null &&
    position.top !== undefined &&
    position.bottom !== undefined
  ) {
    const gap = 8; // Gap between menu and selection
    const viewportPadding = 8; // Minimum distance from viewport edges

    // Calculate both options
    const topIfBelow = position.bottom + gap;
    const topIfAbove = position.top - heightForFlip - gap;
    
    // Check which direction has space
    const fitsBelow = topIfBelow + heightForFlip <= window.innerHeight - viewportPadding;
    const fitsAbove = topIfAbove >= viewportPadding;

    if (preferAbove) {
      // Prefer above (toolbars), flip below only if insufficient space above
      if (fitsAbove || !fitsBelow) {
        finalPosition.top = topIfAbove;
      } else {
        finalPosition.top = topIfBelow;
      }
    } else {
      // Prefer below (menus), flip above only if insufficient space below
      if (fitsBelow || !fitsAbove) {
        finalPosition.top = topIfBelow;
      } else {
        finalPosition.top = topIfAbove;
      }
    }

    // Remove bottom from final position (it was only for flip calculation)
    delete finalPosition.bottom;
  }

  // Viewport clamping: ensure menu stays within viewport bounds
  // This applies to ALL menus (prevents off-screen menus)
  if (menuWidth && menuHeight && finalPosition.left !== undefined && finalPosition.top !== undefined) {
    const padding = 8; // Minimum distance from viewport edges
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Horizontal clamping
    const minLeft = padding;
    const maxLeft = viewportWidth - menuWidth - padding;
    finalPosition.left = Math.max(minLeft, Math.min(maxLeft, finalPosition.left));

    // Vertical clamping (ensures menu doesn't overflow viewport vertically)
    const minTop = padding;
    const maxTop = viewportHeight - menuHeight - padding;
    finalPosition.top = Math.max(minTop, Math.min(maxTop, finalPosition.top));
  }

  // Horizontal boundary clamping (optional, for toolbars with specific boundaries)
  // This OVERRIDES viewport clamping if boundaryRect is provided
  if (boundaryRect && menuWidth && finalPosition.left !== undefined) {
    const halfWidth = menuWidth / 2;
    const padding = 8; // Minimum distance from boundary edges

    // Calculate min/max allowed left position (accounting for centering transform)
    const minLeft = boundaryRect.left + halfWidth + padding;
    const maxLeft = boundaryRect.right - halfWidth - padding;

    // Clamp the left position
    const clampedLeft = Math.max(
      minLeft,
      Math.min(maxLeft, finalPosition.left)
    );

    finalPosition.left = clampedLeft;
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
