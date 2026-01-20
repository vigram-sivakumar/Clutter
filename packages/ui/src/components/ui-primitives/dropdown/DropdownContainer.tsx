/**
 * DropdownContainer - Shared visual primitive for all dropdown types
 *
 * Handles:
 * - Consistent styling (colors, padding, shadows, radius)
 * - Portal rendering
 * - Click-outside behavior
 * - Scrollbar styling
 */

import { useRef, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../../hooks/useTheme';
import { sizing } from '../../../tokens/sizing';
import {
  getDropdownContainerStyles,
  getDropdownScrollbarCSS,
  getDropdownTransitionStyles,
} from '../../../styles/dropdownStyles';

interface DropdownContainerProps {
  isOpen: boolean;
  position: { top?: number; bottom?: number; left: number };
  onClose: () => void;
  children: ReactNode;
  minWidth?: string;
  maxWidth?: string;
  maxHeight?: string;
}

export const DropdownContainer = ({
  isOpen,
  position,
  onClose,
  children,
  minWidth = '220px',
  maxWidth = '220px',
  maxHeight = '300px',
}: DropdownContainerProps) => {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    // Delay to prevent immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Block page scrolling when dropdown is open (global behavior for all dropdowns)
  useEffect(() => {
    if (!isOpen) return;

    // Find the actual scrolling container (.scroll-wrapper in AppLayout)
    const scrollContainer = document.querySelector(
      '.scroll-wrapper'
    ) as HTMLElement;

    if (scrollContainer) {
      // Save scroll position and original overflow
      const scrollY = scrollContainer.scrollTop;
      const originalOverflow = scrollContainer.style.overflow;

      // Block scrolling on the container
      scrollContainer.style.overflow = 'hidden';

      return () => {
        // Restore scrolling
        scrollContainer.style.overflow = originalOverflow;
        // Restore scroll position
        scrollContainer.scrollTop = scrollY;
      };
    } else {
      // Fallback: Block body scrolling (for non-desktop apps or other contexts)
      const scrollY = window.scrollY;
      const originalOverflow = document.body.style.overflow;
      const originalPosition = document.body.style.position;
      const originalTop = document.body.style.top;
      const originalWidth = document.body.style.width;

      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.position = originalPosition;
        document.body.style.top = originalTop;
        document.body.style.width = originalWidth;
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const content = (
    <>
      {/* Custom scrollbar styles */}
      <style>{getDropdownScrollbarCSS(colors)}</style>

      <div
        ref={containerRef}
        className="dropdown-container"
        style={{
          position: 'fixed',
          ...(position.top !== undefined
            ? { top: position.top }
            : { bottom: position.bottom }),
          left: position.left,
          ...getDropdownContainerStyles(colors),
          zIndex: sizing.zIndex.dropdown,
          minWidth,
          maxWidth,
          maxHeight,
          ...getDropdownTransitionStyles(position),
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {children}
      </div>
    </>
  );

  return typeof document !== 'undefined'
    ? createPortal(content, document.body)
    : null;
};
