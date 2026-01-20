/**
 * FloatingMenu - Positioning and interaction layer for floating UI
 *
 * This component sits between FloatingContainer (pure primitive) and
 * menu content components (SlashCommandMenu, AtMentionMenu, etc).
 *
 * Responsibilities:
 * - Manage scroll locking (using reference-counted utility)
 * - Pass through positioning to FloatingContainer
 * - Handle interaction signals (outside clicks)
 * - Provide consistent behavior across all floating menus
 *
 * Does NOT handle:
 * - Menu content (that's SlashCommandMenu, etc)
 * - Position calculation (that's done by menu components)
 * - Portal rendering (that's FloatingContainer)
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
  onInteractOutside?: (event: MouseEvent) => void;
}

export const FloatingMenu = ({
  isOpen,
  position,
  children,
  className,
  lockScroll = false,
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
