/**
 * FloatingContainer - Generic positioning primitive for floating UI
 *
 * This is the foundation component that handles:
 * - Portal rendering to document.body
 * - Fixed positioning relative to viewport
 * - Z-index management
 * - Basic layout and visibility
 *
 * Later steps will add:
 * - Scroll locking (Step 4)
 * - Click-outside handling (Step 5)
 * - Collision detection (future)
 */

import { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { sizing } from '../../tokens/sizing';

/**
 * Position configuration for floating containers
 * Supports flexible positioning with transforms for centering
 */
export interface FloatingPosition {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  transform?: string;
}

export interface FloatingContainerProps {
  isOpen: boolean;
  position: FloatingPosition;
  children: ReactNode;
  className?: string;
  lockScroll?: boolean; // Reserved for Step 4
}

export const FloatingContainer = ({
  isOpen,
  position,
  children,
  className,
}: FloatingContainerProps) => {
  if (!isOpen) return null;

  const content = (
    <div
      data-floating-container
      className={className}
      style={{
        position: 'fixed',
        zIndex: sizing.zIndex.dropdown,
        ...(position.top !== undefined && { top: position.top }),
        ...(position.bottom !== undefined && { bottom: position.bottom }),
        ...(position.left !== undefined && { left: position.left }),
        ...(position.right !== undefined && { right: position.right }),
        ...(position.transform && { transform: position.transform }),
      }}
    >
      {children}
    </div>
  );

  // Render via portal to document.body (breaks out of React tree)
  return typeof document !== 'undefined'
    ? createPortal(content, document.body)
    : null;
};
