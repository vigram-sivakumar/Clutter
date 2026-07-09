import './Breadcrumb.css';
import { Button } from '@components/button/Button';
import { Icons } from '@design-system/icons';

export interface BreadcrumbProps {
  variant?: 'origin' | 'overflow' | 'current';
  id?: string;
  title?: string;
  icon?: typeof Icons.Note;
  onClick?: () => void;
}

/**
 * Renders a single breadcrumb.
 */
export function Breadcrumb({
  id,
  title,
  variant = 'current',
  icon: Icon,
  onClick,
}: BreadcrumbProps) {
  if (variant === 'origin') {
    return (
      <Button id={id} isIconOnly variant="ghost" onClick={onClick}>
        {Icon && <Icon />}
      </Button>
    );
  }

  if (variant === 'overflow') {
    return (
      <Button id={id} isIconOnly variant="ghost" onClick={onClick}>
        <Icons.MoreHorizontal />
      </Button>
    );
  }

  return (
    <Button id={id} variant="ghost" onClick={onClick}>
      {Icon && <Icon />}
      {title}
    </Button>
  );
}
