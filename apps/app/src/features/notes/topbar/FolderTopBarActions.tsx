import { Button } from '@components/button/Button';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { Overlay } from '@components/overlay/Overlay';
import { useOverlay } from '@components/overlay/hooks/useOverlay';
import { AppIcon } from '@shared/icon';

import { folderTopBarMenu } from './folderTopBarMenu.config';

export function FolderTopBarActions() {
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
          {folderTopBarMenu.map((item) => (
            <MenuItem
              key={item.id}
              onClick={overflow.hide}
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
