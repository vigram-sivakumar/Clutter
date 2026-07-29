import { PageTopBar } from '@app/layouts/page/topbar/Page.TopBar';
import type { Breadcrumb } from '@app/layouts/page/breadcrumb/Breadcrumbs';
import { Button } from '@components/button/Button';

import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { Overlay } from '@components/overlay/Overlay';
import { useOverlay } from '@components/overlay/hooks/useOverlay';
// Mock
import { AppIcon } from '@shared/icon';
import { noteTopBarMenu } from '@features/notes/mock/NoteTopBarMenu';

export interface NoteTopBarProps {
  breadcrumbs: Breadcrumb[];
  onArchive?: () => void;
}

export function NoteTopBar({ breadcrumbs, onArchive }: NoteTopBarProps) {
  const overflow = useOverlay<HTMLButtonElement>();

  return (
    <>
      <PageTopBar
        breadcrumbs={breadcrumbs}
        trailing={
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
          </>
        }
      />
      {/* Overlay Menu */}
      <Overlay
        open={overflow.open}
        onClose={overflow.hide}
        anchorRef={overflow.anchorRef}
        side="bottom"
        alignment="end"
      >
        <Menu size="medium">
          {noteTopBarMenu.map((item) => (
            <MenuItem
              key={item.id}
              onClick={() => {
                if (item.id === 'archive') {
                  onArchive?.();
                }

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
