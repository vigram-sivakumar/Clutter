import { useRef, useState } from 'react';
import { Button } from '@components/button/Button';
import { Overlay } from '@components/overlay/Overlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';
import { AppIcon } from '@shared/icon';
import type { SystemIcon } from '@shared/icon';

import type { CollectionViewMode, CollectionPropertyVisibility } from './CollectionBody';

export interface CollectionViewMenuProps {
  viewMode: CollectionViewMode;
  onChange: (mode: CollectionViewMode) => void;
  properties: CollectionPropertyVisibility;
  onPropertiesChange: (next: CollectionPropertyVisibility) => void;
}

const VIEW_ITEMS: ReadonlyArray<{ mode: CollectionViewMode; label: string; icon: SystemIcon }> = [
  { mode: 'list', label: 'List', icon: 'multiLine' },
  { mode: 'table', label: 'Table', icon: 'table' },
];

const PROPERTY_ITEMS: ReadonlyArray<{
  key: keyof CollectionPropertyVisibility;
  label: string;
}> = [
  { key: 'description', label: 'Description' },
  { key: 'lastOpened', label: 'Last opened' },
  { key: 'created', label: 'Created' },
  { key: 'updated', label: 'Updated' },
];

/**
 * The collection List/Table view-mode control — lives beside the page
 * title (PageTitleSection's `actions` slot), not the top bar. Built
 * directly on Overlay/Menu/MenuItem, mirroring ImageOptionsMenu.tsx's own
 * `MODE_ITEMS.map` shape (a small mode-select menu with the current mode
 * indicated via MenuItem's existing `selected` prop — Entry's
 * `entry-selected` treatment) rather than a new menu/selection
 * abstraction. The trigger icon is `configure` (svg/configure.svg).
 */
export function CollectionViewMenu({
  viewMode,
  onChange,
  properties,
  onPropertiesChange,
}: CollectionViewMenuProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button
        className="page-title__button-outline-fill"
        ref={anchorRef}
        size="large"
        variant="outline-fill"
        isIconOnly
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <AppIcon icon="configure" />
      </Button>
      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        side="bottom"
        alignment="end"
      >
        <Menu size="small">
          <MenuGroupTitle>Layout</MenuGroupTitle>
          {VIEW_ITEMS.map(({ mode, label, icon }) => (
            <MenuItem
              key={mode}
              selected={mode === viewMode}
              leading={<AppIcon icon={icon} />}
              onClick={(event) => {
                event.stopPropagation();
                onChange(mode);
                setOpen(false);
              }}
            >
              {label}
            </MenuItem>
          ))}
          <div className="menu__divider" role="separator" />
          <MenuGroupTitle>Properties</MenuGroupTitle>
          {PROPERTY_ITEMS.map(({ key, label }) => {
            const checked = properties[key];
            // Toggling a property doesn't close the menu (unlike a Layout
            // selection) — these are independent on/off preferences a
            // user plausibly sets several of in one sitting, not a
            // single mutually-exclusive choice.
            const toggle = () => onPropertiesChange({ ...properties, [key]: !checked });

            return (
              <MenuItem
                key={key}
                // A tick icon when checked, an empty `.app-icon`-sized
                // span when not — always a non-null `leading` so Entry's
                // own `.entry__leading` wrapper renders at the same fixed
                // width either way (AppIcon's own sizing class, reused
                // rather than inventing a second one), so toggling never
                // shifts the label. Not MenuItem's `selected` prop (that
                // highlights the whole row, Layout's own indicator) —
                // this is a per-row glyph instead, as specified.
                leading={checked ? <AppIcon icon="tick" /> : <span className="app-icon" />}
                onClick={(event) => {
                  event.stopPropagation();
                  toggle();
                }}
              >
                {label}
              </MenuItem>
            );
          })}
        </Menu>
      </Overlay>
    </>
  );
}
