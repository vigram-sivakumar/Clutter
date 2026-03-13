/**
 * DropdownItem - Comprehensive clickable item for dropdowns
 *
 * Supports multiple layouts and variants:
 * - icon + label
 * - label + icon
 * - icon + label + trailing (icon/element)
 * - icon + label + shortcut
 *
 * Variants: primary, secondary, tertiary (default)
 */

import { ReactNode } from 'react';
import { useTheme } from '../../../hooks/useTheme';
import { sizing } from '../../../tokens/sizing';
import { spacing } from '../../../tokens/spacing';
import { typography } from '../../../tokens/typography';
import { KeyboardShortcut } from '../KeyboardShortcut';

interface DropdownItemProps {
  /** Main label text (optional if children is provided) */
  label?: string;
  /** Optional description (shows below label) */
  description?: string;
  /** Leading icon */
  icon?: ReactNode;
  /** Icon position - left or right of label */
  iconPosition?: 'left' | 'right';
  /** Trailing icon or element (shows on right side) */
  trailing?: ReactNode;
  /** Count badge (shows on right side with sidebar styling) */
  count?: number;
  /** Keyboard shortcut (shows on right side with styling) */
  shortcut?: string;
  /** Visual variant */
  variant?: 'primary' | 'secondary' | 'tertiary';
  /** Selected state (highlights background) */
  isSelected?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Mouse enter handler */
  onMouseEnter?: () => void;
  /** Custom content to replace label/description section (allows any component) */
  children?: ReactNode;
  /** Treat children as compact content (4px padding like icons) instead of text (8px) */
  compact?: boolean;
}

export const DropdownItem = ({
  label,
  description,
  icon,
  iconPosition = 'left',
  trailing,
  count,
  shortcut,
  variant = 'tertiary',
  isSelected = false,
  disabled = false,
  onClick,
  onMouseEnter,
  children,
  compact = false,
}: DropdownItemProps) => {
  const { colors } = useTheme();

  // Height is fixed at 28px
  const height = '28px';

  // Check content types
  const hasLeadingIcon = icon && iconPosition === 'left';
  const hasTrailingIcon = icon && iconPosition === 'right';
  const hasTrailingElement = trailing || count !== undefined || shortcut;
  const hasDescription = !!description;

  // Padding based on content (following Button component pattern)
  // Icons and badges (trailing elements) get 4px, text/content gets 8px
  const getPadding = () => {
    if (hasLeadingIcon && hasTrailingElement) {
      return '0 8px 0 8px'; // Icon left, badge/element right (both compact)
    }
    if (hasLeadingIcon) {
      return '0 8px 0 8px'; // Icon left, text right
    }
    if (hasTrailingIcon || hasTrailingElement) {
      // If compact mode and using children, treat content as compact (4px)
      if (compact && children) {
        return '0 8px 0 8px'; // Compact content left, badge right (both compact)
      }
      return '0 8px 0 16px'; // Text left, icon/badge right
    }
    return `0 ${spacing['6']}`; // Text only
  };

  // Variant styles
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return {
          color: colors.text.inverse,
          backgroundColor: isSelected
            ? colors.background.active
            : colors.background.tertiary,
          hoverBg: colors.background.active,
        };
      case 'secondary':
        return {
          color: colors.text.default,
          backgroundColor: isSelected
            ? colors.background.hover
            : colors.background.secondary,
          hoverBg: colors.background.hover,
        };
      case 'tertiary':
      default:
        return {
          color: colors.text.default,
          backgroundColor: isSelected ? colors.background.hover : 'transparent',
          hoverBg: colors.background.hover,
        };
    }
  };

  const variantStyles = getVariantStyles();

  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        width: '100%',
        height: hasDescription ? 'auto' : height,
        minHeight: hasDescription ? height : 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: spacing['6'],
        padding: getPadding(),
        paddingTop: hasDescription ? spacing['4'] : '0',
        paddingBottom: hasDescription ? spacing['4'] : '0',
        borderRadius: sizing.radius.sm,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        backgroundColor: variantStyles.backgroundColor,
        transition: 'background-color 150ms ease',
        textAlign: 'left',
        scrollMargin: spacing['4'], // Add padding when scrolling into view
      }}
      onMouseEnter={(e) => {
        if (!isSelected && !disabled) {
          (e.currentTarget as HTMLElement).style.backgroundColor =
            variantStyles.hoverBg;
        }
        onMouseEnter?.();
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.backgroundColor =
            variantStyles.backgroundColor;
        }
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={disabled ? undefined : onClick}
    >
      {/* Leading icon */}
      {hasLeadingIcon && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: sizing.icon.sm,
            flexShrink: 0,
            color: variantStyles.color,
          }}
        >
          {icon}
        </div>
      )}

      {/* Label and description container (or custom children) */}
      <div
        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}
      >
        {children ? (
          // Custom content provided
          children
        ) : (
          // Default label/description layout
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: typography.fontSize['14'],
                fontWeight: typography.fontWeight.medium,
                lineHeight: hasDescription
                  ? typography.lineHeight.tight
                  : 'normal',
                color: variantStyles.color,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {label}
            </div>
            {hasDescription && (
              <div
                style={{
                  fontSize: typography.fontSize['12'],
                  color:
                    variant === 'primary'
                      ? colors.text.inverse
                      : colors.text.secondary,
                  opacity: variant === 'primary' ? 0.8 : 1,
                  marginTop: '2px',
                  lineHeight: typography.lineHeight.tight,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {description}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Trailing icon (right side) */}
      {hasTrailingIcon && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: sizing.icon.sm,
            flexShrink: 0,
            color: variantStyles.color,
          }}
        >
          {icon}
        </div>
      )}

      {/* Trailing element (custom element on right) */}
      {trailing && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: variantStyles.color,
          }}
        >
          {trailing}
        </div>
      )}

      {/* Count badge (sidebar-style) */}
      {count !== undefined && (
        <div
          style={
            {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '20px',
              minWidth: '20px',
              fontSize: '12px',
              color: colors.text.tertiary,
              userSelect: 'none',
              WebkitUserSelect: 'none',
              flexShrink: 0,
            } as any
          }
        >
          {count}
        </div>
      )}

      {/* Keyboard shortcut (styled) */}
      {shortcut && <KeyboardShortcut keys={shortcut} />}
    </button>
  );
};
