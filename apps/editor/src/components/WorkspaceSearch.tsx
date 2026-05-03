import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';

import { Avatar } from './Avatar';
import { ICON_MEDIUM, Icons } from '../design-system/icons';

/** Caret glyph frame — matches Figma (8px). */
const CARET_PX = 8;

export interface WorkspaceSearchProps extends Omit<
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

export function WorkspaceSearch({
  name,
  avatarSrc,
  avatarOnly = false,
  open = false,
  onTriggerClick,
  onSearchClick,
  searchLabel = 'Search',
  className,
  ...divProps
}: WorkspaceSearchProps) {
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
      <button
        type="button"
        className="clutter-workspace-search__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onTriggerClick}
      >
        <Avatar name={name} src={avatarSrc} size="medium" />
        {!avatarOnly && (
          <span className="clutter-workspace-search__label-row">
            <span className="clutter-workspace-search__label">{name}</span>
            <span className="clutter-workspace-search__caret" aria-hidden>
              {open ? (
                <Icons.CaretUp size={CARET_PX} weight="bold" />
              ) : (
                <Icons.CaretDown size={CARET_PX} weight="bold" />
              )}
            </span>
          </span>
        )}
      </button>
      {!avatarOnly && (
        <div className="clutter-workspace-search__actions">
          <button
            type="button"
            className="clutter-workspace-search__search-btn"
            aria-label={searchLabel}
            onClick={onSearchClick}
          >
            <Icons.MagnifyingGlass size={ICON_MEDIUM} weight="regular" />
          </button>
        </div>
      )}
    </div>
  );
}
