/**
 * FloatingContainer - Generic positioning primitive for floating UI
 *
 * This is the foundation component that handles:
 * - Portal rendering to document.body
 * - Fixed positioning relative to viewport
 * - Basic layout and visibility
 *
 * Later steps will add:
 * - Scroll locking
 * - Click-outside handling
 * - Collision detection
 */

import { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface FloatingContainerProps {
  isOpen: boolean;
  position: { top?: number; bottom?: number; left: number };
  children: ReactNode;
}

export const FloatingContainer = ({
  isOpen,
  position,
  children,
}: FloatingContainerProps) => {
  if (!isOpen) return null;

  const content = (
    <div
      style={{
        position: 'fixed',
        ...(position.top !== undefined
          ? { top: position.top }
          : { bottom: position.bottom }),
        left: position.left,
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
