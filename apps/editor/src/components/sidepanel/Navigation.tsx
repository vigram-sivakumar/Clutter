import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Icon as PhosphorIcon, IconProps } from '@phosphor-icons/react';

import { Count } from '../Count';
import { ICON_MEDIUM } from '../../design-system/icons';

export interface SidepanelNavigationProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  icon?: PhosphorIcon;
  /** Defaults to {@link ICON_MEDIUM}. Use for glyphs that read small at 16px (e.g. Phosphor Dot). */
  iconSize?: number;
  iconWeight?: IconProps['weight'];
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
export function SidepanelNavigation({
  label,
  icon,
  iconSize,
  iconWeight = 'regular',
  count,
  className,
  disabled,
  empty = false,
  type = 'button',
  tabIndex,
  ...props
}: SidepanelNavigationProps) {
  const Icon = icon;
  const cls = [
    'clutter-sidepanel-nav',
    empty && 'clutter-sidepanel-nav--empty',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const showCount = count != null && count !== '';
  const size = iconSize ?? ICON_MEDIUM;
  const iconBoxStyle =
    iconSize !== undefined
      ? {
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
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
        <span className="clutter-sidepanel-nav__icon" style={iconBoxStyle} aria-hidden>
          <Icon size={size} weight={iconWeight} />
        </span>
      )}
      <span className="clutter-sidepanel-nav__label">{label}</span>
      {showCount && <Count>{count}</Count>}
    </button>
  );
}
