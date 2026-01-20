/**
 * AutocompleteDropdown - Dropdown for autocomplete/suggestions (typing-triggered)
 *
 * Used for editor suggestions like @ mentions, / commands, # tags
 * Uses shared dropdown primitives for consistent styling
 *
 * Features:
 * - Automatic scroll-into-view for selected items (keyboard navigation)
 * - Scroll blocking (handled by DropdownContainer)
 */

import { ReactNode, useRef, useEffect } from 'react';
import { DropdownContainer, DropdownItem, DropdownHeader } from './dropdown';

interface AutocompleteDropdownProps {
  isOpen: boolean;
  position: { top?: number; bottom?: number; left: number } | null;
  onClose: () => void;
  header?: string;
  children?: ReactNode;
  /** Index of currently selected item (for keyboard navigation) */
  selectedIndex?: number;
}

export const AutocompleteDropdown = ({
  isOpen,
  position,
  onClose,
  header,
  children,
  selectedIndex,
}: AutocompleteDropdownProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll selected item into view (for keyboard navigation)
  useEffect(() => {
    if (
      !isOpen ||
      selectedIndex === undefined ||
      selectedIndex < 0 ||
      !containerRef.current
    ) {
      return;
    }

    // Find all button elements (DropdownItems render as buttons)
    const buttons = containerRef.current.querySelectorAll('button');
    const selectedButton = buttons[selectedIndex];

    if (selectedButton) {
      selectedButton.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [isOpen, selectedIndex]);

  if (!position) return null;

  return (
    <DropdownContainer
      isOpen={isOpen}
      position={position}
      onClose={onClose}
      dismissOnEscape={true}
      minWidth="220px"
      maxWidth="220px"
      maxHeight="300px"
    >
      <div ref={containerRef}>
        {/* Optional header */}
        {header && <DropdownHeader label={header} />}

        {/* Children (DropdownItems) or skeleton */}
        {children || (
          <DropdownItem
            label="Dropdown Skeleton - Ready to build!"
            onClick={() => {}}
          />
        )}
      </div>
    </DropdownContainer>
  );
};
