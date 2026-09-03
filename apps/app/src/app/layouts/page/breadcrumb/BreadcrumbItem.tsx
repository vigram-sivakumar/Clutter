import { forwardRef } from 'react';
import { AppIcon, SystemIcon } from '@shared/icon';
import './Breadcrumb.css';

export interface BreadcrumbItemProps {
  id?: string;
  title?: string;
  icon?: SystemIcon;
  emoji?: string;

  isIconOnly?: boolean;
  /**
   * The trailing crumb — whatever the user is already looking at. Renders
   * as a plain label rather than a button, since there is nowhere for it
   * to navigate (buildBreadcrumbs deliberately gives this crumb no
   * onClick). aria-current="page" is the standard breadcrumb equivalent —
   * keeps the crumb readable to assistive tech while dropping the
   * interactive semantics (no hover, no cursor, no button role).
   */
  isCurrentPage?: boolean;
  onClick?: () => void;
}

export const BreadcrumbItem = forwardRef<
  HTMLButtonElement,
  BreadcrumbItemProps
>(function BreadcrumbItem(
  { id, title, icon, emoji, isIconOnly, isCurrentPage, onClick },
  ref
) {
  const className = [
    'breadcrumb-item',
    isIconOnly && 'breadcrumb-item--icon',
    isCurrentPage && 'breadcrumb-item--current',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {icon && <AppIcon icon={icon} emoji={emoji} />}

      {!isIconOnly && <span className="breadcrumb-item--title">{title}</span>}
    </>
  );

  if (isCurrentPage) {
    return (
      <span className={className} id={id} aria-current="page">
        {content}
      </span>
    );
  }

  return (
    <button ref={ref} className={className} id={id} onClick={onClick}>
      {content}
    </button>
  );
});
