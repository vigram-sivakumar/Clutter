import './Footer.css';
import { useRef, useState } from 'react';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';
import { Entry } from '@components/entry/Entry';
import { Overlay } from '@components/overlay/Overlay';
import { useOverlay } from '@components/overlay/hooks/useOverlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import {
  SpaceAvatar,
  type SpaceAvatarValue,
} from '@components/space-avatar/SpaceAvatar';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { SpaceMenu, DEFAULT_SPACE_AVATAR } from './SpaceMenu';
import { useSharedSettingsDialogState } from '@features/settings/SettingsDialogState';

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
  spaces?: readonly {
    path: string;
    name: string;
    avatar?: SpaceAvatarValue;
    missing?: boolean;
  }[];
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

const DEFAULT_AVATAR = DEFAULT_SPACE_AVATAR;

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
  const settingsDialog = useSharedSettingsDialogState();
  const selectorRef = useRef<HTMLDivElement>(null);
  const helpMenu = useOverlay<HTMLButtonElement>();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const title = spaceName || vaultFolderName;
  // Each listed Space shows its own avatar; the open one falls back to its entry's when none is passed.
  const activeAvatar =
    avatar !== DEFAULT_AVATAR
      ? avatar
      : (spaces?.find((space) => space.path === activeSpacePath)?.avatar ??
        avatar);
  const avatarView = (
    <SpaceAvatar
      avatar={activeAvatar}
      folderName={vaultFolderName}
      resolveImageUrl={resolveImageUrl}
    />
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
      <SpaceMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRef={selectorRef}
        spaces={spaces}
        activeSpacePath={activeSpacePath}
        title={title}
        spaceName={spaceName}
        activeAvatarView={avatarView}
        resolveImageUrl={resolveImageUrl}
        onSwitchSpace={onSwitchSpace}
        onNewSpace={onNewSpace}
        onOpenSettings={() => settingsDialog?.setOpen(true)}
      />
      <div className="footer__actions">
        <Button
          ref={helpMenu.anchorRef}
          isIconOnly
          size="medium"
          variant="ghost"
          isActive={helpMenu.open}
          aria-label="Help"
          aria-haspopup="menu"
          aria-expanded={helpMenu.open}
          onClick={helpMenu.toggle}
        >
          <AppIcon icon="question" />
        </Button>
        <Overlay
          open={helpMenu.open}
          onClose={helpMenu.hide}
          anchorRef={helpMenu.anchorRef}
          side="top"
          alignment="start"
        >
          <Menu size="medium">
            <MenuItem
              leading={<AppIcon icon="keyboard" />}
              onClick={() => {
                helpMenu.hide();
                setShortcutsOpen(true);
              }}
            >
              Keyboard shortcuts
            </MenuItem>
            <MenuItem leading={<AppIcon icon="option" />} onClick={helpMenu.hide}>
              Markdown shortcuts
            </MenuItem>
          </Menu>
        </Overlay>
        <Button
          isIconOnly
          size="medium"
          variant="ghost"
          onClick={onOpenArchive}
        >
          <AppIcon icon={getSystemLocationPresentation('archive').icon} />
        </Button>
      </div>
      <KeyboardShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
