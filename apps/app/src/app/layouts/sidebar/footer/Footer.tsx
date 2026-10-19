import './Footer.css';
import { useRef, useState } from 'react';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';
import { Entry } from '@components/entry/Entry';
import { SpaceAvatar, type SpaceAvatarValue } from '@components/space-avatar/SpaceAvatar';
import { Overlay } from '@components/overlay/Overlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';

interface FooterProps {
  /** The vault folder's name — source of the `initial` avatar's letter, and the title when `spaceName` is absent. */
  vaultFolderName: string;
  /** The Space's display name; falls back to the folder name. */
  spaceName?: string;
  avatar?: SpaceAvatarValue;
  /**
   * Turns an `image` avatar's `src` into a loadable URL; `null` means there is
   * nothing to load (the initial is shown instead). Defaults to using `src` as-is.
   */
  resolveImageUrl?(src: string): string | null;
  /** Every registered Space, active one included. Omitted: the menu lists just the active Space. */
  spaces?: readonly { path: string; name: string; avatar?: SpaceAvatarValue; missing?: boolean }[];
  /** The active Space's path, matched against `spaces` to mark the current one. */
  activeSpacePath?: string;
  /** Presence makes the other Spaces selectable. */
  onSwitchSpace?(path: string): void;
  /** Presence enables "New space"; absent (no folder picker, e.g. the web runtime) it is disabled. */
  onNewSpace?(): void;
  /** Called as the Space menu opens — the moment to re-check which listed Spaces still exist. */
  onSpacesMenuOpen?(): void;
  onOpenArchive(): void;
}

const DEFAULT_AVATAR: SpaceAvatarValue = { type: 'initial' };

export function Footer({
  vaultFolderName,
  spaceName,
  avatar = DEFAULT_AVATAR,
  resolveImageUrl,
  spaces,
  activeSpacePath,
  onSwitchSpace,
  onNewSpace,
  onSpacesMenuOpen,
  onOpenArchive,
}: FooterProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const title = spaceName || vaultFolderName;
  // Each listed Space shows its own avatar; the open one falls back to its entry's when none is passed.
  const activeAvatar =
    avatar !== DEFAULT_AVATAR ? avatar : (spaces?.find((space) => space.path === activeSpacePath)?.avatar ?? avatar);
  const avatarView = (
    <SpaceAvatar avatar={activeAvatar} folderName={vaultFolderName} resolveImageUrl={resolveImageUrl} />
  );

  return (
    <div className="footer">
      <Entry
        ref={selectorRef}
        className="space-selector truncate"
        leading={avatarView}
        trailing={<AppIcon icon="caretDown" size={12} />}
        forceHover={menuOpen}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => {
          if (!menuOpen) onSpacesMenuOpen?.();
          setMenuOpen((open) => !open);
        }}
      >
        <span className="space__title">{title}</span>
      </Entry>
      <Overlay
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRef={selectorRef}
        side="top"
        alignment="start"
      >
        <Menu size="medium">
          {(spaces ?? [{ path: activeSpacePath ?? '', name: title }]).map((space) => {
            const isActive = space.path === activeSpacePath || spaces === undefined;
            return isActive ? (
              <MenuItem
                key={space.path}
                className="space-menu__current"
                leading={avatarView}
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
                    avatar={space.avatar ?? DEFAULT_AVATAR}
                    folderName={space.name}
                    resolveImageUrl={resolveImageUrl}
                    badge={space.missing ? 'error' : undefined}
                    badgeLabel={space.missing ? 'Folder not found' : undefined}
                  />
                }
                title={space.path}
                disabled={!onSwitchSpace}
                onClick={() => {
                  setMenuOpen(false);
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
              setMenuOpen(false);
              onNewSpace?.();
            }}
          >
            New space
          </MenuItem>
          {/* Settings has no destination yet, so it is shown but not actionable. */}
          <div className="menu__divider" role="separator" />
          <MenuItem leading={<AppIcon icon="settings" />} disabled>
            Settings
          </MenuItem>
        </Menu>
      </Overlay>
      <div className="footer__actions">
        <Button isIconOnly size="medium" variant="ghost" onClick={onOpenArchive}>
          <AppIcon icon={getSystemLocationPresentation('archive').icon} />
        </Button>
      </div>
    </div>
  );
}
