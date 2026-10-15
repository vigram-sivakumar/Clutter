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
  onOpenArchive(): void;
}

const DEFAULT_AVATAR: SpaceAvatarValue = { type: 'initial' };

export function Footer({
  vaultFolderName,
  spaceName,
  avatar = DEFAULT_AVATAR,
  resolveImageUrl,
  onOpenArchive,
}: FooterProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const title = spaceName || vaultFolderName;
  const avatarView = (
    <SpaceAvatar avatar={avatar} folderName={vaultFolderName} resolveImageUrl={resolveImageUrl} />
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
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className="space__title">{title}</span>
      </Entry>
      {/* UI only: the items carry no handlers yet — switching, creating a Space and Settings are not built. */}
      <Overlay
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRef={selectorRef}
        side="top"
        alignment="start"
      >
        <Menu size="medium">
          <MenuItem
            className="space-menu__current"
            leading={avatarView}
            trailing={<AppIcon icon="tick" />}
            aria-current="true"
          >
            <span className="space__title">{title}</span>
          </MenuItem>
          <MenuItem leading={<AppIcon icon="plus" />}>New space</MenuItem>
          <div className="menu__divider" role="separator" />
          <MenuItem leading={<AppIcon icon="settings" />}>Settings</MenuItem>
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
