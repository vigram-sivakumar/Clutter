import { useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@components/button/Button';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { Overlay } from '@components/overlay/Overlay';
import { AppIcon } from '@shared/icon';
import { DEFAULT_SPACE_SETTINGS, type SpaceSettingsSource } from '../space-settings/SpaceSettingsSource';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

// The note's own layout names are `'above'` and `'side'`; the cover menu on a note calls them Top and Right.
const OPTIONS: readonly { value: 'side' | 'above'; label: string }[] = [
  { value: 'above', label: 'Top' },
  { value: 'side', label: 'Right' },
];

const noopSubscribe = () => () => {};

export function CoverPositionSetting({ source }: { source?: SpaceSettingsSource }) {
  const choice = useSyncExternalStore(
    source?.subscribe ?? noopSubscribe,
    () => source?.getCoverPosition() ?? DEFAULT_SPACE_SETTINGS.coverPosition
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = OPTIONS.find((option) => option.value === choice)?.label;

  return (
    <SettingsEntry
      title="Default cover position"
      description="Choose where cover images appear on notes"
      trailing={
        <>
          <Button
            ref={triggerRef}
            variant="outline"
            trailing={<AppIcon icon="caretDown" size={12} />}
            isActive={menuOpen}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Default cover position: ${label}`}
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
                  trailing={option.value === choice ? <AppIcon icon="tick" /> : undefined}
                  onClick={() => {
                    source?.setCoverPosition(option.value);
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
