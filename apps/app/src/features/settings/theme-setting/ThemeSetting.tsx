import { useRef, useState, type RefObject } from 'react';
import { Button } from '@components/button/Button';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { Overlay } from '@components/overlay/Overlay';
import { AppIcon } from '@shared/icon';
import { useTheme, type ThemePreference } from '@design-system/useTheme';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Use system theme' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function ThemeMenu({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement>;
}) {
  const { preference, setPreference } = useTheme();
  return (
    <Overlay
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      side="bottom"
      alignment="end"
    >
      <Menu size="medium">
        {OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            aria-current={option.value === preference || undefined}
            trailing={
              option.value === preference ? <AppIcon icon="tick" /> : undefined
            }
            onClick={() => {
              setPreference(option.value);
              onClose();
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </Overlay>
  );
}

export function ThemeSetting() {
  const { preference } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = OPTIONS.find((option) => option.value === preference)?.label;

  return (
    <SettingsEntry
      title="Theme"
      description="Choose your default theme for Clutter"
      trailing={
        <>
          <Button
            ref={triggerRef}
            variant="outline"
            isActive={menuOpen}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Theme: ${label}`}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {label}
          </Button>
          <ThemeMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            anchorRef={triggerRef}
          />
        </>
      }
    />
  );
}
