import type { RefObject } from 'react';
import { AppIcon } from '@shared/icon';
import { SpaceAvatar, type SpaceAvatarValue } from '@components/space-avatar/SpaceAvatar';
import { Overlay } from '@components/overlay/Overlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';

export const DEFAULT_SPACE_AVATAR: SpaceAvatarValue = { type: 'initial' };

export interface ListedSpace {
  path: string;
  name: string;
  avatar?: SpaceAvatarValue;
  missing?: boolean;
}

interface SpaceMenuProps {
  open: boolean;
  onClose(): void;
  anchorRef: RefObject<HTMLElement>;
  side?: 'top' | 'bottom';
  alignment?: 'start' | 'center' | 'end';
  /** Every registered Space, active one included. Omitted: the menu lists just the active Space. */
  spaces?: readonly ListedSpace[];
  activeSpacePath?: string;
  /** The active Space's display title, and its avatar as already drawn for the selector. */
  title: string;
  spaceName?: string;
  activeAvatarView: React.ReactNode;
  resolveImageUrl?(src: string): string | null;
  onSwitchSpace?(path: string): void;
  onNewSpace?(): void;
  /** Presence adds the divider and "Settings" item; absent (inside Settings itself) the menu ends at "New space". */
  onOpenSettings?(): void;
}

/**
 * The Space menu: switch Space, create one, and (from the sidebar footer) open Settings. The footer's selector and
 * the Settings dialog's header both render this one component, so the two menus cannot drift apart.
 */
export function SpaceMenu({
  open,
  onClose,
  anchorRef,
  side = 'top',
  alignment = 'start',
  spaces,
  activeSpacePath,
  title,
  spaceName,
  activeAvatarView,
  resolveImageUrl,
  onSwitchSpace,
  onNewSpace,
  onOpenSettings,
}: SpaceMenuProps) {
  return (
    <Overlay open={open} onClose={onClose} anchorRef={anchorRef} side={side} alignment={alignment}>
      <Menu size="medium">
        {(spaces ?? [{ path: activeSpacePath ?? '', name: title }]).map((space) => {
          const isActive = space.path === activeSpacePath || spaces === undefined;
          return isActive ? (
            <MenuItem
              key={space.path}
              className="space-menu__current"
              leading={activeAvatarView}
              trailing={<AppIcon icon="tick" />}
              aria-current="true"
              title={space.path || undefined}
            >
              <span className="space__title">{spaceName || space.name}</span>
            </MenuItem>
          ) : (
            <MenuItem
              key={space.path}
              className="space-menu__current"
              leading={
                <SpaceAvatar
                  avatar={(space as ListedSpace).avatar ?? DEFAULT_SPACE_AVATAR}
                  folderName={space.name}
                  resolveImageUrl={resolveImageUrl}
                  badge={(space as ListedSpace).missing ? 'error' : undefined}
                  badgeLabel={(space as ListedSpace).missing ? 'Folder not found' : undefined}
                />
              }
              title={space.path}
              disabled={!onSwitchSpace}
              onClick={() => {
                onClose();
                onSwitchSpace?.(space.path);
              }}
            >
              <span className="space__title">{space.name}</span>
            </MenuItem>
          );
        })}
        <MenuItem
          leading={<AppIcon icon="plus" />}
          disabled={!onNewSpace}
          onClick={() => {
            onClose();
            onNewSpace?.();
          }}
        >
          New space
        </MenuItem>
        {onOpenSettings && (
          <>
            <div className="menu__divider" role="separator" />
            <MenuItem
              leading={<AppIcon icon="settings" />}
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
            >
              Settings
            </MenuItem>
          </>
        )}
      </Menu>
    </Overlay>
  );
}
