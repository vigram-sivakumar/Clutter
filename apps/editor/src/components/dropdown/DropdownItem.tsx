import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { ICON_MEDIUM } from '../../design-system/icons';

const ICON_SIZE = ICON_MEDIUM;

interface DropdownItemProps {
  label?: string;
  description?: string;
  icon?: PhosphorIcon;
  indent?: boolean;
  iconRight?: PhosphorIcon;
  shortcutSlot?: React.ReactNode;
  iconOnly?: PhosphorIcon;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function DropdownItem({
  label,
  description,
  icon,
  indent = false,
  iconRight,
  shortcutSlot,
  iconOnly,
  active = false,
  onClick,
  className,
}: DropdownItemProps) {
  const cls = [
    'clutter-dropdown-item',
    iconOnly && 'clutter-dropdown-item--icon-only',
    active && 'clutter-dropdown-item--active',
    className,
  ].filter(Boolean).join(' ');

  if (iconOnly) {
    const Icon = iconOnly;
    return (
      <button type="button" className={cls} onClick={onClick}>
        <Icon size={ICON_SIZE} />
      </button>
    );
  }

  const Icon = icon;
  const IconRight = iconRight;

  return (
    <button type="button" className={cls} onClick={onClick}>
      {(Icon || indent) && (
        <span className="clutter-dropdown-item__icon">
          {Icon && <Icon size={ICON_SIZE} />}
        </span>
      )}
      <span className="clutter-dropdown-item__body">
        <span className="clutter-dropdown-item__row">
          <span className="clutter-dropdown-item__label">{label}</span>
          {IconRight && (
            <span className="clutter-dropdown-item__icon-right">
              <IconRight size={ICON_SIZE} />
            </span>
          )}
          {shortcutSlot && (
            <span className="clutter-dropdown-item__shortcut">{shortcutSlot}</span>
          )}
        </span>
        {description && (
          <span className="clutter-dropdown-item__description">{description}</span>
        )}
      </span>
    </button>
  );
}
