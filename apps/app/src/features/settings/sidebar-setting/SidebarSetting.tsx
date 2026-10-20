import { useRef, useState } from 'react';
import { Button } from '@components/button/Button';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { Overlay } from '@components/overlay/Overlay';
import {
  SIDEBAR_TABS,
  type SidebarTab,
} from '@core/application/workspace/WorkspaceSessionStore';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';
import { AppIcon } from '@shared/icon';
import { SettingsEntry } from '../settings-entry/SettingsEntry';
import {
  readDefaultSidebarTab,
  readUseLastSidebarTab,
  writeDefaultSidebarTab,
  writeUseLastSidebarTab,
} from './defaultSidebarTab';

/** The dropdown's value: a specific tab, or "reopen whichever tab the last session ended on". */
type Choice = SidebarTab | 'last-selected';

const OPTIONS: { value: Choice; label: string; tab?: SidebarTab }[] = [
  { value: 'last-selected', label: 'Last selected tab' },
  ...SIDEBAR_TABS.map((tab) => ({
    value: tab,
    label: getSystemLocationPresentation(tab).label,
    tab,
  })),
];

export function SidebarSetting() {
  // The two stored values stay separate, so choosing "Last selected tab" never overwrites the explicit tab.
  const [tab, setTab] = useState<SidebarTab>(readDefaultSidebarTab);
  const [useLast, setUseLast] = useState(readUseLastSidebarTab);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const choice: Choice = useLast ? 'last-selected' : tab;
  const label = OPTIONS.find((option) => option.value === choice)?.label;

  function select(option: (typeof OPTIONS)[number]) {
    if (option.tab) {
      writeDefaultSidebarTab(option.tab);
      setTab(option.tab);
    }
    const last = option.value === 'last-selected';
    writeUseLastSidebarTab(last);
    setUseLast(last);
    setMenuOpen(false);
  }

  return (
    <SettingsEntry
      title="Default tab"
      description="Choose which tab to open when you start Clutter"
      trailing={
        <>
          <Button
            ref={triggerRef}
            variant="outline"
            isActive={menuOpen}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Default tab: ${label}`}
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
                    option.value === choice ? (
                      <AppIcon icon="tick" />
                    ) : undefined
                  }
                  onClick={() => select(option)}
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
