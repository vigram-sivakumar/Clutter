import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';

import { Count } from '../Count';
import { ICON_MEDIUM } from '../../design-system/icons';

export interface SidepanelNavigationProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  icon?: PhosphorIcon;
  /** Optional count / date pill value (e.g. note count). Hidden when omitted or empty. */
  count?: ReactNode;
}

/**
 * Sidepanel list row (Figma: SidepanelNavigation — node 247:5412).
 */
export function SidepanelNavigation({
  label,
  icon,
  count,
  className,
  disabled,
  type = 'button',
  ...props
}: SidepanelNavigationProps) {
  const Icon = icon;
  const cls = ['clutter-sidepanel-nav', className].filter(Boolean).join(' ');
  const showCount = count != null && count !== '';

  return (
    <button type={type} className={cls} disabled={disabled} {...props}>
      {Icon && (
        <span className="clutter-sidepanel-nav__icon" aria-hidden>
          <Icon size={ICON_MEDIUM} />
        </span>
      )}
      <span className="clutter-sidepanel-nav__label">{label}</span>
      {showCount && <Count>{count}</Count>}
    </button>
  );
}
