import React, { ReactNode, useState, useRef, useEffect, useMemo } from 'react';
import { ChevronRight, MoreHorizontal } from '../../../../icons';
import { sizing } from '../../../../tokens/sizing';
import { spacing } from '../../../../tokens/spacing';
import { useTheme } from '../../../../hooks/useTheme';
import { TertiaryButton } from '../../../ui-buttons';
import {
  DropdownContainer,
  DropdownItem,
} from '../../../ui-primitives/dropdown';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
  maxWidth?: string;
  isCurrentPage?: boolean; // Special styling for the last item
  isCollapsed?: boolean; // Internal: marks the ••• collapse item
  collapsedItems?: BreadcrumbItem[]; // Internal: items hidden in dropdown
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  separator?: ReactNode; // Default is ChevronRight
}

export const Breadcrumbs = ({ items, separator }: BreadcrumbsProps) => {
  const { colors } = useTheme();
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonWrapperRef = useRef<HTMLDivElement>(null);

  const defaultSeparator = (
    <ChevronRight size={sizing.icon.sm} style={{ flexShrink: 0 }} />
  );

  // Measure parent container width (available space) for responsive behavior
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        // Measure parent's width to know available space
        const parentWidth = entries[0].contentRect.width;
        setContainerWidth(parentWidth);
      }
    });

    // Observe the parent container, not the breadcrumbs container
    if (containerRef.current?.parentElement) {
      observer.observe(containerRef.current.parentElement);
    }

    return () => observer.disconnect();
  }, []);

  // Calculate dropdown position when opening
  const handleDropdownToggle = () => {
    if (!showDropdown && buttonWrapperRef.current) {
      const rect = buttonWrapperRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
    setShowDropdown(!showDropdown);
  };

  // Simple threshold-based hiding - CSS handles all shrinking
  const getHiddenIndices = (): Set<number> => {
    const hidden = new Set<number>();

    if (items.length <= 1) return hidden;

    const currentIndex = items.length - 1;
    const parentIndex = items.length - 2;

    // Ultra narrow: only show current (< 200px)
    if (containerWidth < 200) {
      for (let i = 0; i < currentIndex; i++) {
        hidden.add(i);
      }
      return hidden;
    }

    // Very narrow: show parent + current (< 300px)
    if (containerWidth < 300) {
      for (let i = 0; i < parentIndex; i++) {
        hidden.add(i);
      }
      return hidden;
    }

    // Narrow: show first + parent + current, hide middle (< 450px and more than 3 items)
    if (items.length > 3 && containerWidth < 450) {
      for (let i = 1; i < parentIndex; i++) {
        hidden.add(i);
      }
      return hidden;
    }

    // Medium: progressively hide middle items only for very long paths (> 5 items and < 600px)
    if (items.length > 5 && containerWidth < 600) {
      // Hide items 1, 2, 3... (keep first, parent, current)
      const hideCount = Math.ceil((items.length - 3) / 2);
      for (let i = 1; i <= hideCount && i < parentIndex; i++) {
        hidden.add(i);
      }
    }

    return hidden;
  };

  // Build visible items with collapsed dropdown
  const collapsedItems = useMemo(() => {
    const hidden = getHiddenIndices();

    if (hidden.size === 0) {
      // Show all items - CSS handles shrinking
      return items.map((item) => ({ ...item }));
    }

    const result: BreadcrumbItem[] = [];
    const collapsedGroup: BreadcrumbItem[] = [];

    items.forEach((item, index) => {
      if (hidden.has(index)) {
        collapsedGroup.push(item);
      } else {
        // If we have accumulated collapsed items, add dropdown
        if (collapsedGroup.length > 0) {
          result.push({
            label: '•••',
            isCollapsed: true,
            collapsedItems: [...collapsedGroup],
          } as BreadcrumbItem);
          collapsedGroup.length = 0;
        }
        result.push(item);
      }
    });

    return result;
  }, [items, containerWidth]);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing['4'],
        minWidth: 0, // Enables text truncation
        // No width or flex - take natural width, but measure parent for collapse logic
      }}
    >
      {collapsedItems.map((item, index) => {
        const isLast = index === collapsedItems.length - 1;
        const isCurrentPage =
          item.isCurrentPage !== undefined ? item.isCurrentPage : isLast;

        const textColor = isCurrentPage
          ? colors.text.secondary
          : colors.text.tertiary;
        const separatorColor = colors.text.tertiary;

        return (
          <React.Fragment key={index}>
            {/* Separator */}
            {index > 0 && (
              <div
                style={{
                  color: separatorColor,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {separator || defaultSeparator}
              </div>
            )}

            {/* Collapsed items dropdown */}
            {item.isCollapsed ? (
              <>
                <div ref={buttonWrapperRef}>
                  <TertiaryButton
                    icon={<MoreHorizontal size={16} />}
                    size="xs"
                    active={showDropdown}
                    onClick={handleDropdownToggle}
                  />
                </div>

                {/* Dropdown menu */}
                <DropdownContainer
                  isOpen={showDropdown}
                  position={dropdownPosition}
                  onClose={() => setShowDropdown(false)}
                >
                  {item.collapsedItems?.map((hiddenItem, hiddenIndex) => (
                    <DropdownItem
                      key={hiddenIndex}
                      label={hiddenItem.label}
                      onClick={() => {
                        hiddenItem.onClick?.();
                        setShowDropdown(false);
                      }}
                      variant="tertiary"
                    />
                  ))}
                </DropdownContainer>
              </>
            ) : (
              /* Regular breadcrumb item - CSS handles all shrinking */
              <span
                style={{
                  display: 'inline-block',
                  fontSize: '14px',
                  color: textColor,
                  minWidth: '40px', // ~3-4 characters visible before hiding
                  maxWidth: isLast ? '200px' : '150px',
                  flex: '0 1 auto', // Don't grow, only shrink
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  cursor: item.onClick ? 'pointer' : 'default',
                  transition: 'color 0.15s',
                }}
                onClick={item.onClick}
                onMouseEnter={(e) =>
                  item.onClick &&
                  (e.currentTarget.style.color = colors.text.default)
                }
                onMouseLeave={(e) =>
                  item.onClick && (e.currentTarget.style.color = textColor)
                }
              >
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
