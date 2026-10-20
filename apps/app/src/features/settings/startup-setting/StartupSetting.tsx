import { useRef, useState } from 'react';
import { Button } from '@components/button/Button';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { Overlay } from '@components/overlay/Overlay';
import { AppIcon } from '@shared/icon';
import type { StartupBehavior } from '@core/application/Application';
import { SettingsEntry } from '../settings-entry/SettingsEntry';
import { readStartupBehavior, writeStartupBehavior } from './startupPreference';

const OPTIONS: { value: StartupBehavior; label: string }[] = [
  { value: 'last-opened-note', label: 'Last opened note' },
  { value: 'todays-note', label: "Today's note" },
];

export function StartupSetting() {
  const [behavior, setBehavior] =
    useState<StartupBehavior>(readStartupBehavior);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = OPTIONS.find((option) => option.value === behavior)?.label;

  return (
    <SettingsEntry
      title="Open on launch"
      description="Choose which note to open when you start Clutter"
      trailing={
        <>
          <Button
            ref={triggerRef}
            variant="outline"
            isActive={menuOpen}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Open on launch: ${label}`}
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
                  aria-current={option.value === behavior || undefined}
                  trailing={
                    option.value === behavior ? (
                      <AppIcon icon="tick" />
                    ) : undefined
                  }
                  onClick={() => {
                    writeStartupBehavior(option.value);
                    setBehavior(option.value);
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
