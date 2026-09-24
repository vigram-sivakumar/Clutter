import { useRef, useState } from 'react';
import { Button } from '@components/button/Button';
import { Overlay } from '@components/overlay/Overlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';
import { AppIcon } from '@shared/icon';
import type { SystemIcon } from '@shared/icon';

import type { CollectionViewMode } from './CollectionBody';

export interface CollectionViewMenuProps {
  viewMode: CollectionViewMode;
  onChange: (mode: CollectionViewMode) => void;
}

const VIEW_ITEMS: ReadonlyArray<{ mode: CollectionViewMode; label: string; icon: SystemIcon }> = [
  { mode: 'list', label: 'List', icon: 'multiLine' },
  { mode: 'table', label: 'Table', icon: 'table' },
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
        </Menu>
      </Overlay>
    </>
  );
}
