import './Breadcrumb.css';
import { Button } from '@components/button/Button';
import { AppIcon, type SystemIcon } from '@shared/icon';

export interface BreadcrumbProps {
  variant?: 'origin' | 'overflow' | 'current';
  id?: string;
  title?: string;
  icon?: SystemIcon;
  emoji?: string;
  onClick?: () => void;
}

/**
 * Renders a single breadcrumb.
 */
export function Breadcrumb({
  id,
  title,
  variant = 'current',
  icon,
  emoji,
  onClick,
}: BreadcrumbProps) {
  if (variant === 'origin') {
    return (
      <Button
        id={id}
        isIconOnly
        variant="ghost"
        size="medium"
        onClick={onClick}
      >
        {icon && <AppIcon icon={icon} emoji={emoji} />}
      </Button>
    );
  }

  if (variant === 'overflow') {
    return (
      <Button
        id={id}
        isIconOnly
        variant="ghost"
        size="medium"
        onClick={onClick}
      >
        <AppIcon icon="moreHorizontal" />
      </Button>
    );
  }

  return (
    <Button id={id} variant="ghost" size="medium" onClick={onClick}>
      {icon && <AppIcon icon={icon} emoji={emoji} />}
      {title}
    </Button>
  );
}
