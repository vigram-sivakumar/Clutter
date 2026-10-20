import { useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@components/button/Button';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { Overlay } from '@components/overlay/Overlay';
import { AppIcon } from '@shared/icon';
import {
  readFolderItemLimitChoice,
  subscribeFolderItemLimitChoice,
  writeFolderItemLimitChoice,
  type FolderItemLimitChoice,
} from '@shared/helpers/folderItemLimitPreference';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

const OPTIONS: readonly { value: FolderItemLimitChoice; label: string }[] = [
  { value: 5, label: '5 items' },
  { value: 10, label: '10 items' },
  { value: 15, label: '15 items' },
  { value: 20, label: '20 items' },
  { value: 'all', label: 'Show all' },
];

export function FolderItemsSetting() {
  const choice = useSyncExternalStore(
    subscribeFolderItemLimitChoice,
    readFolderItemLimitChoice
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = OPTIONS.find((option) => option.value === choice)?.label;

  return (
    <SettingsEntry
      title="Show"
      description="Choose how many items to show in each folder before showing more"
      trailing={
        <>
          <Button
            ref={triggerRef}
            variant="outline"
            trailing={<AppIcon icon="caretDown" size={12} />}
            isActive={menuOpen}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Show: ${label}`}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {label}
          </Button>
          <Overlay
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            anchorRef={triggerRef}
            side="bottom"
            alignment="end"
          >
            <Menu size="medium">
              {OPTIONS.map((option) => (
                <MenuItem
                  key={option.value}
                  aria-current={option.value === choice || undefined}
                  trailing={
                    option.value === choice ? <AppIcon icon="tick" /> : undefined
                  }
                  onClick={() => {
                    writeFolderItemLimitChoice(option.value);
                    setMenuOpen(false);
                  }}
                >
                  {option.label}
                </MenuItem>
              ))}
            </Menu>
          </Overlay>
        </>
      }
    />
  );
}
