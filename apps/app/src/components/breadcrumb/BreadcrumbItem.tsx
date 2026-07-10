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

export function BreadcrumbItem({
  id,
  title,
  icon,
  emoji,
  isIconOnly,
  onClick,
}: BreadcrumbItemProps) {
  return (
    <button
      className={`breadcrumb-item ${isIconOnly ? 'breadcrumb-item--icon' : ''}`}
      id={id}
      onClick={onClick}
    >
      {icon && <AppIcon icon={icon} emoji={emoji} />}

      {!isIconOnly && <span className="breadcrumb-item--title">{title}</span>}
    </button>
  );
}
