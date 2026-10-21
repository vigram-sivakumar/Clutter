import { useRef, useState } from 'react';
import { Button } from '@components/button/Button';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { Overlay } from '@components/overlay/Overlay';
import {
  useHeaderSeparatorMode,
  writeHeaderSeparatorMode,
  type HeaderSeparatorMode,
} from '@app/layouts/page/headerSeparator';
import { AppIcon } from '@shared/icon';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

const OPTIONS: { value: HeaderSeparatorMode; label: string }[] = [
  { value: 'automatic', label: 'Automatic' },
  { value: 'show', label: 'Always show' },
  { value: 'hide', label: 'Always hide' },
];

/** The same dropdown as the Default tab setting: no segmented control exists in the design system. */
export function HeaderSeparatorSetting() {
  const mode = useHeaderSeparatorMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = OPTIONS.find((option) => option.value === mode)?.label;

  return (
    <SettingsEntry
      title="Header separator"
      description="Show a line between a page's header and its content. Automatic shows it when the page has properties"
      trailing={
        <>
          <Button
            ref={triggerRef}
            variant="outline"
            trailing={<AppIcon icon="caretDown" size={12} />}
            isActive={menuOpen}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Header separator: ${label}`}
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
                  aria-current={option.value === mode || undefined}
                  trailing={option.value === mode ? <AppIcon icon="tick" /> : undefined}
                  onClick={() => {
                    writeHeaderSeparatorMode(option.value);
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
