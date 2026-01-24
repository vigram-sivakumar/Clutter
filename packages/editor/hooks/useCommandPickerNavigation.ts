/**
 * useCommandPickerNavigation - Shared keyboard navigation for command pickers
 *
 * This hook provides keyboard navigation (ArrowUp, ArrowDown, Enter, Tab)
 * and auto-scroll behavior for any command picker interface.
 *
 * Used by:
 * - SlashCommandMenu (slash command picker)
 * - BlockOptionsMenu "Turn into" view (block type picker)
 * - Future: Command Palette
 *
 * CRITICAL: Only activates keyboard listeners when `isActive === true`
 * This prevents global keyboard hijacking when the picker is not visible.
 */

import { useState, useEffect, useRef } from 'react';

export interface UseCommandPickerNavigationOptions {
  /**
   * Whether the picker is currently active and should handle keyboard events
   * CRITICAL: Only set to true when the picker is visible and focused
   */
  isActive: boolean;

  /**
   * Total number of items in the picker list
   */
  itemCount: number;

  /**
   * Callback when an item is selected (via Enter or Tab)
   * @param index - Index of the selected item
   */
  onSelect: (index: number) => void;

  /**
   * Optional: Initial selected index (default: 0)
   */
  initialIndex?: number;

  /**
   * Optional: Container ref for auto-scrolling
   * If provided, will scroll selected item into view
   */
  containerRef?: React.RefObject<HTMLElement>;
}

export interface UseCommandPickerNavigationResult {
  /**
   * Currently selected index
   */
  selectedIndex: number;

  /**
   * Manually set the selected index
   */
  setSelectedIndex: (index: number) => void;

  /**
   * Navigate to next item (wraps to start)
   */
  selectNext: () => void;

  /**
   * Navigate to previous item (wraps to end)
   */
  selectPrevious: () => void;

  /**
   * Select the current item (calls onSelect)
   */
  selectCurrent: () => void;
}

export function useCommandPickerNavigation({
  isActive,
  itemCount,
  onSelect,
  initialIndex = 0,
  containerRef,
}: UseCommandPickerNavigationOptions): UseCommandPickerNavigationResult {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  // Reset index when itemCount changes (e.g., filtering results)
  useEffect(() => {
    if (selectedIndex >= itemCount && itemCount > 0) {
      setSelectedIndex(0);
    }
  }, [itemCount, selectedIndex]);

  // Reset index when becoming active
  useEffect(() => {
    if (isActive) {
      setSelectedIndex(initialIndex);
    }
  }, [isActive, initialIndex]);

  // Navigation functions
  const selectNext = () => {
    setSelectedIndex((prev) => Math.min(prev + 1, itemCount - 1));
  };

  const selectPrevious = () => {
    setSelectedIndex((prev) => Math.max(prev - 1, 0));
  };

  const selectCurrent = () => {
    if (selectedIndex >= 0 && selectedIndex < itemCount) {
      onSelect(selectedIndex);
    }
  };

  // Auto-scroll selected item into view
  // Depends on itemCount so scroll updates when filtering results
  useEffect(() => {
    if (!isActive || !containerRef?.current) return;

    const items = containerRef.current.querySelectorAll('button');
    const selectedItem = items[selectedIndex];

    if (selectedItem) {
      selectedItem.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [isActive, selectedIndex, itemCount, containerRef]);

  // Global keyboard handler (ONLY active when isActive === true)
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Intercept Enter/Arrow keys in capture phase
      if (['Enter', 'ArrowUp', 'ArrowDown', 'Tab'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (event.key === 'Enter') {
          selectCurrent();
        } else if (event.key === 'ArrowDown') {
          selectNext();
        } else if (event.key === 'ArrowUp') {
          selectPrevious();
        } else if (event.key === 'Tab') {
          // Tab selects first item
          onSelect(0);
        }
      }
    };

    // Use capture phase to intercept before structural handlers
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isActive, itemCount, selectedIndex, onSelect]);

  return {
    selectedIndex,
    setSelectedIndex,
    selectNext,
    selectPrevious,
    selectCurrent,
  };
}
