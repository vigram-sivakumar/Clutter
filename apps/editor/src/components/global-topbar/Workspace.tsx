import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';

import { Avatar } from '../Avatar';
import { Button } from '../Button';
import { CustomIcons, ICON_SMALL } from '../../design-system/icons';

export interface WorkspaceProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'children'
> {
  /** Workspace title — avatar initials and label text (when not avatar-only). */
  name: string;
  avatarSrc?: string;
  /** Narrow trigger: avatar only (no label row or search control). */
  avatarOnly?: boolean;
  /** Open dropdown — caret up and active chrome (pair with `onTriggerClick`). */
  open?: boolean;
  onTriggerClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick'];
  onSearchClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick'];
  /** Accessible label for the search control. */
  searchLabel?: string;
}

export function Workspace({
  name,
  avatarSrc,
  avatarOnly = false,
  open = false,
  onTriggerClick,
  onSearchClick,
  searchLabel = 'Search',
  className,
  ...divProps
}: WorkspaceProps) {
  const rootCls = [
    'clutter-workspace-search',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={rootCls}
      data-avatar-only={avatarOnly ? 'true' : undefined}
      {...divProps}
    >
      <Button
        type="button"
        variant="ghost"
        className="clutter-workspace-search__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onTriggerClick}
      >
        <Avatar name={name} src={avatarSrc} size="small" />
        {!avatarOnly && (
          <span className="clutter-workspace-search__label-row">
            <span className="clutter-workspace-search__label">{name}</span>
            <span className="clutter-workspace-search__caret" aria-hidden>
              {open ? (
                <CustomIcons.CaretUp size={ICON_SMALL} />
              ) : (
                <CustomIcons.CaretDown size={ICON_SMALL} />
              )}
            </span>
          </span>
        )}
      </Button>
      {!avatarOnly && (
        <div className="clutter-workspace-search__actions">
          <Button
            type="button"
            variant="ghost"
            iconOnly={CustomIcons.MagnifyingGlass}
            className="clutter-workspace-search__search-btn"
            aria-label={searchLabel}
            onClick={onSearchClick}
          />
        </div>
      )}
    </div>
  );
}
