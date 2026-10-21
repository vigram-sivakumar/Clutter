import { useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@components/button/Button';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { Overlay } from '@components/overlay/Overlay';
import { AppIcon } from '@shared/icon';
import {
  readDateFormatChoice,
  subscribeDateFormatChoice,
  writeDateFormatChoice,
  type DateFormatChoice,
} from '@shared/helpers/time/dateFormatPreference';
import { formatDateFormatExample } from '@shared/helpers/time/dateDisplay';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

interface DateFormatOption {
  readonly value: DateFormatChoice;
  readonly label: string;
}

const OPTIONS: readonly DateFormatOption[] = [
  { value: 'relative', label: 'Relative' },
  { value: 'full', label: 'Full date' },
  { value: 'short', label: 'Short date' },
  { value: 'weekday', label: 'Date with day' },
  { value: 'mdy', label: 'Month/Day/Year' },
  { value: 'dmy', label: 'Day/Month/Year' },
  { value: 'ymd', label: 'Year/Month/Day' },
];

/**
 * What a row, and the button, shows for a format: its own example date — except Relative, whose example ("Today")
 * would read as a date rather than the format, so it is called what it is.
 */
function displayFor(format: DateFormatChoice): string {
  return format === 'relative' ? 'Relative' : formatDateFormatExample(format);
}

export function DateFormatSetting() {
  const choice = useSyncExternalStore(
    subscribeDateFormatChoice,
    readDateFormatChoice
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = OPTIONS.find((option) => option.value === choice)?.label;

  return (
    <SettingsEntry
      title="Date format"
      description="Choose how dates are displayed throughout Clutter"
      trailing={
        <>
          <Button
            ref={triggerRef}
            variant="outline"
            trailing={<AppIcon icon="caretDown" size={12} />}
            isActive={menuOpen}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Date format: ${label}`}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {displayFor(choice)}
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
                    writeDateFormatChoice(option.value);
                    setMenuOpen(false);
                  }}
                >
                  {displayFor(option.value)}
                </MenuItem>
              ))}
            </Menu>
          </Overlay>
        </>
      }
    />
  );
}
