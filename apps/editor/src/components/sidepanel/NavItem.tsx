import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Count } from '../Count';
import { ICON_MEDIUM, ICON_WRAPPER_SIZE, type ClutterIcon } from '../../design-system/icons';

export interface NavItemProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  icon?: ClutterIcon;
  /** Defaults to {@link ICON_MEDIUM}. Use for glyphs that read small at 16px. */
  iconSize?: number;
  /** Optional count / date pill value (e.g. note count). Hidden when omitted or empty. */
  count?: ReactNode;
  /**
   * Empty row: icon uses tertiary color. Prefer this over `disabled` — disabled applies a separate
   * muted treatment; empty vs not-empty is the only nav distinction in Figma.
   */
  empty?: boolean;
}

/**
 * Sidepanel list row (Figma: SidepanelNavigation — node 247:5412).
 */
export function NavItem({
  label,
  icon,
  iconSize,
  count,
  className,
  disabled,
  empty = false,
  type = 'button',
  tabIndex,
  ...props
}: NavItemProps) {
  const Icon = icon;
  const cls = [
    'clutter-sidepanel-nav',
    empty && 'clutter-sidepanel-nav--empty',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const showCount = count != null && count !== '';
  const glyphSize = iconSize ?? ICON_MEDIUM;
  const wrapperPx =
    iconSize !== undefined
      ? Math.max(glyphSize, ICON_WRAPPER_SIZE)
      : undefined;
  const iconWrapStyle =
    wrapperPx !== undefined
      ? {
          width: wrapperPx,
          height: wrapperPx,
          minWidth: wrapperPx,
          minHeight: wrapperPx,
        }
      : undefined;

  return (
    <button
      type={type}
      className={cls}
      disabled={disabled}
      {...props}
      tabIndex={tabIndex}
    >
      {Icon && (
        <span
          className="clutter-sidepanel-nav__icon-wrap"
          style={iconWrapStyle}
          aria-hidden
        >
          <Icon size={glyphSize} />
        </span>
      )}
      <span className="clutter-sidepanel-nav__label">{label}</span>
      {showCount && <Count>{count}</Count>}
    </button>
  );
}
