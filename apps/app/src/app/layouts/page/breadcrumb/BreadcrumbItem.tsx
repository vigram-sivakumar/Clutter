import { forwardRef } from 'react';
import { AppIcon, SystemIcon } from '@shared/icon';
import './Breadcrumb.css';

export interface BreadcrumbItemProps {
  id?: string;
  title?: string;
  icon?: SystemIcon;
  emoji?: string;

  isIconOnly?: boolean;
  onClick?: () => void;
}

export const BreadcrumbItem = forwardRef<
  HTMLButtonElement,
  BreadcrumbItemProps
>(function BreadcrumbItem(
  { id, title, icon, emoji, isIconOnly, onClick },
  ref
) {
  return (
    <button
      ref={ref}
      className={`breadcrumb-item ${isIconOnly ? 'breadcrumb-item--icon' : ''}`}
      id={id}
      onClick={onClick}
    >
      {icon && <AppIcon icon={icon} emoji={emoji} />}

      {!isIconOnly && <span className="breadcrumb-item--title">{title}</span>}
    </button>
  );
});
