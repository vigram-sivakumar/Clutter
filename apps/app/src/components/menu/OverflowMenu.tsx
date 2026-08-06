import { useRef } from 'react';

import { Button } from '@components/button/Button';
import { Overlay } from '@components/overlay/Overlay';
import type {
  OverlaySide,
  OverlayAlignment,
} from '@components/overlay/Overlay.types';
import { AppIcon } from '@shared/icon';
import type { SystemIcon } from '@shared/icon';

import { Menu } from './Menu';
import { MenuItem } from './MenuItem';

export interface OverflowMenuItemConfig {
  id: string;
  label: string;
  icon: SystemIcon;
  /** Rendered but non-interactive — never omitted from the menu. */
  disabled?: boolean;
}

export interface OverflowMenuProps {
  items: readonly OverflowMenuItemConfig[];
  open: boolean;
  onOpenChange(open: boolean): void;
  onSelect(id: string): void;
  size?: 'medium' | 'small';
  side?: OverlaySide;
  alignment?: OverlayAlignment;
}

/**
 * The "⋯" trigger button plus its anchored Overlay/Menu — the one place
 * that composes those three primitives into a row-level overflow control.
 * `open` is controlled by the caller so multiple OverflowMenu instances
 * (e.g. one per sidebar row) can share a single "which one is open" owner
 * and guarantee only one is ever open at a time.
 */
export function OverflowMenu({
  items,
  open,
  onOpenChange,
  onSelect,
  size = 'medium',
  side = 'bottom',
  alignment = 'end',
}: OverflowMenuProps) {
  if (items.length === 0) {
    return null;
  }

  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button
        size={size}
        variant="ghost"
        interaction="subtle"
        isIconOnly
        ref={anchorRef}
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange(!open);
        }}
      >
        <AppIcon icon={'moreHorizontal'} />
      </Button>
      <Overlay
        open={open}
        onClose={() => onOpenChange(false)}
        anchorRef={anchorRef}
        side={side}
        alignment={alignment}
      >
        <Menu size={size}>
          {items.map((item) => (
            <MenuItem
              key={item.id}
              disabled={item.disabled}
              onClick={() => {
                onSelect(item.id);
                onOpenChange(false);
              }}
              leading={item.icon ? <AppIcon icon={item.icon} /> : undefined}
            >
              {item.label}
            </MenuItem>
          ))}
        </Menu>
      </Overlay>
    </>
  );
}
