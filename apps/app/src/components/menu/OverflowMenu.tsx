import { useRef } from 'react';
import type { RefObject } from 'react';

import { Button } from '@components/button/Button';
import { ButtonProps } from '@components/button/Button';
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
  triggerRef?: RefObject<HTMLButtonElement>;

  buttonProps?: Omit<
    ButtonProps,
    | 'children'
    | 'ref'
    | 'onClick'
    | 'aria-haspopup'
    | 'aria-expanded'
    | 'isIconOnly'
  >;
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
  buttonProps,
  triggerRef,
}: OverflowMenuProps) {
  // Called unconditionally, before the items.length early return below —
  // a component instance can transition between an empty and non-empty
  // item list across renders (e.g. a draft note's row, once persisted,
  // goes from no capabilities to a real menu without unmounting), and a
  // hook called only on some renders violates the Rules of Hooks.
  const internalAnchorRef = useRef<HTMLButtonElement>(null);
  const anchorRef: RefObject<HTMLButtonElement> =
    triggerRef ?? internalAnchorRef;

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        size={size}
        variant="ghost"
        interaction="subtle"
        isIconOnly
        {...buttonProps}
        ref={anchorRef}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange(!open);
        }}
      >
        <AppIcon icon={'moreVertical'} />
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
              onClick={(event) => {
                // Overlay renders this menu through a DOM portal (to
                // document.body), but React still bubbles the click event
                // through the *React* tree — up through this OverflowMenu
                // into whatever row rendered it (e.g. a sidebar Note/
                // Folder row's own Entry). That row's Entry.handleClick
                // guards against a nested interactive element using a real
                // DOM `closest()` walk, which can never find the row's own
                // DOM node as an ancestor of a portaled element, so it
                // never catches this case. Without stopping propagation
                // here, selecting any menu item (Rename, Duplicate,
                // Delete, ...) would also fire the row's own onClick and
                // open/select it — exactly the trigger button beside this
                // menu already guards against for opening the menu itself.
                event.stopPropagation();
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
