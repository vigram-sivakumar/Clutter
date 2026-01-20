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
 *
 * Does NOT handle:
 * - Menu content (that's SlashCommandMenu, etc)
 * - Position calculation (that's done by menu components)
 * - Portal rendering (that's FloatingContainer)
 * - Dismissal decisions (parent decides via onInteractOutside)
 */

import { ReactNode, useEffect } from 'react';
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
}

export const FloatingMenu = ({
  isOpen,
  position,
  children,
  className,
  lockScroll = false,
  dismissOnEscape = false,
  onInteractOutside,
}: FloatingMenuProps) => {
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

  return (
    <FloatingContainer
      isOpen={isOpen}
      position={position}
      className={className}
      onInteractOutside={onInteractOutside}
    >
      {children}
    </FloatingContainer>
  );
};
