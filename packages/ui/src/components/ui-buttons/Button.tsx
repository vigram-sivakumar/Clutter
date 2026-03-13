import {
  ReactNode,
  MouseEvent,
  cloneElement,
  isValidElement,
  CSSProperties,
  useEffect,
  useRef,
} from 'react';
import { useTheme } from '../../hooks/useTheme';
import { sizing } from '../../tokens/sizing';
import { radius } from '../../tokens/radius';
import { KeyboardShortcut } from '../ui-primitives/KeyboardShortcut';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'filled';
  size?: 'xs' | 'small' | 'medium' | 'large';
  icon?: ReactNode;
  iconSize?: number;
  iconPosition?: 'left' | 'right';
  children?: ReactNode;
  shortcut?: string;
  onClick?: (_e: MouseEvent<HTMLButtonElement>) => void;
  onMouseDown?: (_e: MouseEvent<HTMLButtonElement>) => void;
  danger?: boolean;
  subtle?: boolean;
  active?: boolean;
  onBackground?: 'default' | 'secondary' | 'tertiary'; // For filled variant context
  fullWidth?: boolean; // Control whether button fills width or hugs content
  withBackground?: boolean; // Add background color to secondary variant
  noBorder?: boolean; // Remove border from button
  disabled?: boolean; // Disabled state
  disabledNoFade?: boolean; // Keep full opacity when disabled (no fade effect)
  fontSize?: string; // Custom font size
  gap?: string; // Custom gap between icon and label
  noHoverBackground?: boolean; // Disable hover background color
}

export const Button = ({
  variant = 'tertiary',
  size = 'medium',
  icon,
  iconSize = sizing.icon.sm,
  iconPosition = 'left',
  children,
  shortcut,
  onClick,
  onMouseDown,
  danger = false,
  subtle = false,
  active = false,
  onBackground = 'secondary', // Default context for filled variant
  fullWidth = false,
  withBackground = false,
  noBorder = false,
  disabled = false,
  disabledNoFade = false,
  fontSize = '14px',
  gap,
  noHoverBackground = false,
}: ButtonProps) => {
  const { colors } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const sizeMap = {
    xs: '20px',
    small: '24px',
    medium: '28px',
    large: '40px',
  };

  const buttonHeight = sizeMap[size];
  const isIconOnly = icon && !children;
  const isTextOnly = !icon && children;

  // Clone icon with size if it's a valid React element
  const iconElement =
    icon && isValidElement(icon)
      ? cloneElement(icon, { size: iconSize } as any)
      : icon;

  // Padding based on content type and size
  const getPadding = () => {
    if (isIconOnly) return '0'; // Icon-only buttons are square with no padding
    if (isTextOnly) return '0 6px'; // Symmetric padding for text-only
    // Icon + text - adjust based on icon position
    if (iconPosition === 'right') {
      return '0 6px 0 8px'; // Less padding on right (icon side), more on left
    }
    return '0 8px 0 6px'; // Less padding on left (icon side), more on right
  };

  // Base styles
  const baseStyles: CSSProperties = {
    padding: getPadding(),
    height: buttonHeight,
    minWidth: isIconOnly ? buttonHeight : 'auto',
    width: fullWidth ? '100%' : 'auto',
    fontSize: fontSize,
    fontWeight: variant === 'primary' ? 500 : 400,
    border: 'none',
    borderRadius: radius['6'],
    cursor: disabled ? 'not-allowed' : 'pointer',
    // Don't reduce opacity for disabled primary buttons (they use secondary background instead)
    opacity: disabled && !disabledNoFade && variant !== 'primary' ? 0.4 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: isIconOnly ? 'center' : 'flex-start',
    gap: gap || '4px',
    textTransform: 'capitalize', // Automatically capitalize button labels
    transition:
      'background-color 150ms cubic-bezier(0.2, 0, 0, 1), color 150ms cubic-bezier(0.2, 0, 0, 1), opacity 150ms cubic-bezier(0.2, 0, 0, 1), border-color 150ms cubic-bezier(0.2, 0, 0, 1)',
    boxSizing: 'border-box',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  } as any;

  // Variant-specific styles
  const getVariantStyles = (): CSSProperties => {
    switch (variant) {
      case 'primary':
        return {
          color: disabled
            ? colors.text.tertiary
            : danger
              ? colors.button.danger.text // Red text on subtle background
              : colors.button.primary.text,
          background: disabled
            ? colors.background.secondary
            : danger
              ? colors.button.danger.background // Subtle red background
              : colors.button.primary.background,
          border: 'none',
        };
      case 'secondary': {
        const getSecondaryBackground = () => {
          // Danger buttons always get the subtle red background
          if (danger) return colors.button.danger.background;
          if (!withBackground) return 'transparent';
          if (onBackground === 'default') return colors.background.secondary;
          if (onBackground === 'secondary') return colors.background.tertiary;
          return colors.background.tertiary;
        };
        return {
          color: danger ? colors.button.danger.text : colors.text.secondary,
          background: getSecondaryBackground(),
          border: noBorder
            ? 'none'
            : `1px solid ${danger ? colors.button.danger.text : colors.border.default}`,
        };
      }
      case 'filled': {
        // OVERLAY STRATEGY: Filled buttons have surface backgrounds, use overlay on hover
        // Base color adapts to container context (background.secondary/tertiary)
        const getFilledBackground = () => {
          // Danger filled uses subtle rgba background (matches menu items)
          if (danger) return colors.button.danger.background;
          if (onBackground === 'default') return colors.background.secondary;
          if (onBackground === 'secondary') return colors.background.tertiary;
          return colors.background.tertiary;
        };
        return {
          // Danger filled buttons use red text on subtle red background (matches menu style)
          color: danger ? colors.button.danger.text : colors.text.secondary,
          background: getFilledBackground(),
          border: 'none',
        };
      }
      case 'tertiary':
      default:
        return {
          color: active
            ? colors.text.default
            : subtle
              ? colors.text.tertiary
              : colors.text.secondary,
          background: active ? colors.background.tertiary : 'transparent',
          border: 'none',
        };
    }
  };

  const variantStyles = getVariantStyles();

  // Clear inline hover styles when button becomes disabled
  useEffect(() => {
    if (disabled && buttonRef.current) {
      // Reset to default variant styles
      buttonRef.current.style.backgroundColor =
        variantStyles.background as string;
      buttonRef.current.style.color = variantStyles.color as string;
      if (variant === 'secondary' && !noBorder) {
        buttonRef.current.style.borderColor = danger
          ? colors.button.danger.text
          : colors.border.default;
      }
    }
  }, [
    disabled,
    variantStyles.background,
    variantStyles.color,
    variant,
    noBorder,
    danger,
    colors.button.danger.text,
    colors.border.default,
  ]);

  // Hover styles - DESIGN SYSTEM COMPLIANT
  // PRIMARY buttons → shade ladder (brand-owned solid colors)
  // FILLED buttons → overlay strategy (surface-owned backgrounds)
  // SECONDARY/TERTIARY ghost buttons → overlay strategy (transparent backgrounds)
  const handleMouseEnter = (e: MouseEvent<HTMLButtonElement>) => {
    const target = e.currentTarget;

    // If noHoverBackground is true, only change text color
    if (noHoverBackground) {
      if (variant === 'tertiary' && !active) {
        target.style.color = colors.text.default;
      }
      return;
    }

    switch (variant) {
      case 'primary':
        // OVERLAY STRATEGY: Primary danger uses subtle hover
        if (danger) {
          target.style.backgroundColor = colors.button.danger.backgroundHover;
        } else {
          target.style.backgroundColor = colors.button.primary.backgroundHover;
        }
        break;
      case 'secondary':
        if (danger) {
          // Danger secondary uses rgba hover
          target.style.backgroundColor = colors.button.danger.backgroundHover;
        } else if (withBackground) {
          // OVERLAY STRATEGY: Secondary with background uses medium overlay for stronger hover
          target.style.backgroundColor = colors.overlay.medium;
        } else {
          // OVERLAY STRATEGY: Ghost secondary uses soft overlay
          target.style.backgroundColor = colors.overlay.soft;
        }
        // Do NOT animate border color or text color (keep consistent with other variants)
        break;
      case 'filled':
        // OVERLAY STRATEGY: Filled buttons use overlay on top of surface colors
        if (danger) {
          // Danger filled uses subtle rgba hover (matches menu items)
          target.style.backgroundColor = colors.button.danger.backgroundHover;
        } else {
          target.style.backgroundColor = colors.overlay.soft;
        }
        break;
      case 'tertiary':
      default:
        // OVERLAY STRATEGY: Always use overlay for tertiary
        if (!active) {
          target.style.backgroundColor = colors.overlay.soft;
        }
        break;
    }
  };

  const handleMouseLeave = (e: MouseEvent<HTMLButtonElement>) => {
    const target = e.currentTarget;
    switch (variant) {
      case 'primary':
        // OVERLAY STRATEGY: Primary danger returns to subtle base
        target.style.backgroundColor = danger
          ? colors.button.danger.background
          : colors.button.primary.background;
        break;
      case 'secondary': {
        const getSecondaryBg = () => {
          // Danger buttons always get the subtle red background
          if (danger) return colors.button.danger.background;
          // Non-danger buttons: transparent if no background, or use the specified background
          if (!withBackground) return 'transparent';
          if (onBackground === 'default') return colors.background.secondary;
          if (onBackground === 'secondary') return colors.background.tertiary;
          return colors.background.tertiary;
        };
        target.style.backgroundColor = getSecondaryBg();
        // Text color stays constant (no change on hover/leave)
        break;
      }
      case 'filled': {
        // OVERLAY STRATEGY: Return to base color
        const getFilledBackground = () => {
          // Danger filled uses subtle rgba background (matches menu items)
          if (danger) return colors.button.danger.background;
          if (onBackground === 'default') return colors.background.secondary;
          if (onBackground === 'secondary') return colors.background.tertiary;
          return colors.background.tertiary;
        };
        target.style.backgroundColor = getFilledBackground();
        break;
      }
      case 'tertiary':
      default:
        // OVERLAY STRATEGY: Return to transparent
        if (!active) {
          target.style.backgroundColor = 'transparent';
        } else {
          target.style.backgroundColor = colors.background.tertiary;
        }
        break;
    }
  };

  const handleMouseDown = (e: MouseEvent<HTMLButtonElement>) => {
    // Prevent button from stealing focus (important for floating toolbars)
    e.preventDefault();

    if (onMouseDown) {
      onMouseDown(e);
    }

    const target = e.currentTarget;

    switch (variant) {
      case 'primary':
        // OVERLAY STRATEGY: Primary danger uses subtle active
        if (danger) {
          target.style.backgroundColor = colors.button.danger.backgroundHover;
        } else {
          target.style.backgroundColor = colors.button.primary.backgroundActive;
        }
        break;
      case 'secondary':
        if (danger) {
          // Danger secondary uses even darker rgba on active
          target.style.backgroundColor = colors.button.danger.backgroundHover; // Keep same as hover for consistency
        } else if (withBackground) {
          // OVERLAY STRATEGY: Secondary with background uses strong overlay for active
          target.style.backgroundColor = colors.overlay.strong;
        } else {
          // OVERLAY STRATEGY: Ghost secondary uses medium overlay for active
          target.style.backgroundColor = colors.overlay.medium;
        }
        break;
      case 'filled':
        // OVERLAY STRATEGY: Use medium overlay for active
        if (danger) {
          // Danger filled keeps subtle rgba on active (matches menu items)
          target.style.backgroundColor = colors.button.danger.backgroundHover;
        } else {
          target.style.backgroundColor = colors.overlay.medium;
        }
        break;
      case 'tertiary':
        // OVERLAY STRATEGY: Use medium overlay for active
        if (!active) {
          target.style.backgroundColor = colors.overlay.medium;
        }
        break;
    }
  };

  const handleMouseUp = (e: MouseEvent<HTMLButtonElement>) => {
    const target = e.currentTarget;

    switch (variant) {
      case 'primary':
        // OVERLAY STRATEGY: Primary danger returns to subtle hover
        if (danger) {
          target.style.backgroundColor = colors.button.danger.backgroundHover;
        } else {
          target.style.backgroundColor = colors.button.primary.backgroundHover;
        }
        break;
      case 'secondary':
        if (danger) {
          target.style.backgroundColor = colors.button.danger.backgroundHover;
        } else if (withBackground) {
          // OVERLAY STRATEGY: Secondary with background returns to medium overlay
          target.style.backgroundColor = colors.overlay.medium;
        } else {
          // OVERLAY STRATEGY: Ghost secondary returns to soft overlay
          target.style.backgroundColor = colors.overlay.soft;
        }
        break;
      case 'filled':
        // OVERLAY STRATEGY: Return to hover state (overlay on surface)
        if (danger) {
          // Danger filled returns to subtle rgba hover (matches menu items)
          target.style.backgroundColor = colors.button.danger.backgroundHover;
        } else {
          target.style.backgroundColor = colors.overlay.soft;
        }
        break;
      case 'tertiary':
        // OVERLAY STRATEGY: Return to soft overlay
        if (!active) {
          target.style.backgroundColor = colors.overlay.soft;
        }
        break;
    }
  };

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick(e);
    }
  };

  return (
    <button
      ref={buttonRef}
      onClick={disabled ? undefined : handleClick}
      onMouseDown={disabled ? undefined : handleMouseDown}
      onMouseUp={disabled ? undefined : handleMouseUp}
      onMouseEnter={disabled ? undefined : handleMouseEnter}
      onMouseLeave={disabled ? undefined : handleMouseLeave}
      disabled={disabled}
      style={{
        ...baseStyles,
        ...variantStyles,
        justifyContent: isIconOnly ? 'center' : 'flex-start',
        paddingRight: shortcut ? '6px' : baseStyles.padding,
      }}
    >
      {iconPosition === 'left' && iconElement}
      {children && (
        <span style={{ flex: shortcut ? 1 : 'none', textAlign: 'left' }}>
          {children}
        </span>
      )}
      {iconPosition === 'right' && iconElement}
      {shortcut && <KeyboardShortcut keys={shortcut} />}
    </button>
  );
};
