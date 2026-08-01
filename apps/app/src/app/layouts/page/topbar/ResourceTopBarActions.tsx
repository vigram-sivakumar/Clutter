import { Button } from '@components/button/Button';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { Overlay } from '@components/overlay/Overlay';
import { useOverlay } from '@components/overlay/hooks/useOverlay';
import { AppIcon } from '@shared/icon';
import type { SystemIcon } from '@shared/icon';

export interface TopBarMenuItemConfig {
  id: string;
  label: string;
  icon: SystemIcon;
}

export interface ResourceTopBarActionsProps {
  menu: readonly TopBarMenuItemConfig[];
  handlers?: Partial<Record<string, () => void>>;
}

/**
 * Shared overflow-menu top bar actions for any resource type (note,
 * daily note, folder). Each resource passes its own menu config and a
 * handlers map keyed by menu item id — items with no matching handler
 * still render but only close the menu when clicked, exactly as every
 * currently-unwired item already behaves today.
 */
export function ResourceTopBarActions({ menu, handlers }: ResourceTopBarActionsProps) {
  const overflow = useOverlay<HTMLButtonElement>();

  return (
    <>
      <Button size="medium" isIconOnly>
        <AppIcon icon={'favouriteOutline'} />
      </Button>
      <Button size="medium" isIconOnly>
        <AppIcon icon={'widthFill'} />
      </Button>
      <Button
        size="medium"
        isIconOnly
        ref={overflow.anchorRef}
        onClick={overflow.toggle}
      >
        <AppIcon icon={'moreHorizontal'} />
      </Button>
      <Overlay
        open={overflow.open}
        onClose={overflow.hide}
        anchorRef={overflow.anchorRef}
        side="bottom"
        alignment="end"
      >
        <Menu size="medium">
          {menu.map((item) => (
            <MenuItem
              key={item.id}
              onClick={() => {
                handlers?.[item.id]?.();
                overflow.hide();
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
