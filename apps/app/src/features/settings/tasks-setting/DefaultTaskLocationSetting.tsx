import { useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@components/button/Button';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { Overlay } from '@components/overlay/Overlay';
import { AppIcon } from '@shared/icon';
import {
  readDefaultTaskLocation,
  subscribeDefaultTaskLocation,
  writeDefaultTaskLocation,
} from '@shared/helpers/defaultTaskLocationPreference';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

const OPTIONS = [
  { value: 'today', label: 'Today’s Daily Note' },
  { value: 'due-date', label: 'Due-date Daily Note' },
  { value: 'inbox', label: 'Inbox' },
] as const;

export function DefaultTaskLocationSetting() {
  const choice = useSyncExternalStore(
    subscribeDefaultTaskLocation,
    readDefaultTaskLocation
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = OPTIONS.find((option) => option.value === choice)?.label;

  return (
    <SettingsEntry
      title="Default location for new tasks"
      description="Tasks without a due date use today’s Daily Note unless Inbox is selected"
      trailing={
        <>
          <Button
            ref={triggerRef}
            variant="outline"
            trailing={<AppIcon icon="caretDown" size={12} />}
            isActive={menuOpen}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Default location for new tasks: ${label}`}
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
                  aria-label={option.label}
                  aria-current={option.value === choice || undefined}
                  trailing={
                    option.value === choice ? (
                      <AppIcon icon="tick" />
                    ) : undefined
                  }
                  onClick={() => {
                    writeDefaultTaskLocation(option.value);
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
