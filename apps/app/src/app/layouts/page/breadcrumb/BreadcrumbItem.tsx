import { forwardRef } from 'react';
import { AppIcon, SystemIcon } from '@shared/icon';
import { SpaceAvatar } from '@components/space-avatar/SpaceAvatar';
import { useActiveSpaceAvatar } from '@components/space-avatar/ActiveSpaceAvatarContext';
import './Breadcrumb.css';

export interface BreadcrumbItemProps {
  id?: string;
  title?: string;
  icon?: SystemIcon;
  emoji?: string;
  /** This crumb is the Space root — shown with the active Space's avatar instead of `icon`. */
  isSpaceRoot?: boolean;

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
  { id, title, icon, emoji, isSpaceRoot, isIconOnly, isCurrentPage, onClick },
  ref
) {
  const spaceAvatar = useActiveSpaceAvatar();
  const className = [
    'breadcrumb-item',
    isIconOnly && 'breadcrumb-item--icon',
    isCurrentPage && 'breadcrumb-item--current',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {isSpaceRoot && spaceAvatar ? (
        <SpaceAvatar {...spaceAvatar} />
      ) : (
        icon && <AppIcon icon={icon} emoji={emoji} />
      )}

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
