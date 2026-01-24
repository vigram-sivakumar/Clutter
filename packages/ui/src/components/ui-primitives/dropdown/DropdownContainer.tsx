/**
 * DropdownContainer - Shared visual wrapper for dropdown menus
 *
 * Now a thin wrapper around FloatingMenu that provides:
 * - Consistent dropdown styling (colors, padding, shadows, radius)
 * - Custom scrollbar styling
 * - Size constraints (minWidth, maxWidth, maxHeight)
 *
 * Delegates to FloatingMenu for:
 * - Portal rendering (via FloatingContainer)
 * - Scroll locking (reference-counted)
 * - Click-outside detection (capture phase)
 * - ESC key dismissal
 * - Z-index management
 */

import { ReactNode } from 'react';
import { useTheme } from '../../../hooks/useTheme';
import {
  getDropdownContainerStyles,
  getDropdownScrollbarCSS,
  getDropdownTransitionStyles,
} from '../../../styles/dropdownStyles';
import { FloatingMenu } from '../FloatingMenu';

interface DropdownContainerProps {
  isOpen: boolean;
  position: { top?: number; bottom?: number; left: number };
  onClose: () => void;
  children: ReactNode;
  width?: string;
  minWidth?: string;
  maxWidth?: string;
  maxHeight?: string;
  dismissOnEscape?: boolean;
  /** Estimated height for predictive flip calculation (avoids flicker) */
  estimatedHeight?: number;
}

export const DropdownContainer = ({
  isOpen,
  position,
  onClose,
  children,
  width = '220px',
  minWidth = '180px',
  maxWidth = 'calc(100vw - 24px)',
  maxHeight = '70vh',
  dismissOnEscape = true,
  estimatedHeight,
}: DropdownContainerProps) => {
  const { colors } = useTheme();

  return (
    <>
      {/* Custom scrollbar styles */}
      <style>{getDropdownScrollbarCSS(colors)}</style>

      <FloatingMenu
        isOpen={isOpen}
        position={position}
        lockScroll={true}
        dismissOnEscape={dismissOnEscape}
        onInteractOutside={onClose}
        className="dropdown-container"
        estimatedHeight={estimatedHeight}
      >
        <div
          style={{
            ...getDropdownContainerStyles(colors),
            width,
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
      </FloatingMenu>
    </>
  );
};
