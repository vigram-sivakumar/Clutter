import './Breadcrumbs.css';
import { BreadcrumbItem } from './BreadcrumbItem';
import { AppIcon } from '@shared/icon';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { Overlay } from '@components/overlay/Overlay';
import { useOverlay } from '@components/overlay/hooks/useOverlay';

import type { Breadcrumb } from '@core/presentation/Breadcrumb';

export type { Breadcrumb };

export interface BreadcrumbsProps {
  items: Breadcrumb[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const overflow = useOverlay<HTMLButtonElement>();

  if (items.length === 0) {
    return null;
  }

  // Current page only — no ancestors to collapse.
  if (items.length === 1) {
    const current = items[0]!;

    return (
      <BreadcrumbItem
        id={current.id}
        title={current.title}
        icon={current.icon}
        emoji={current.emoji}
        onClick={current.onClick}
        isCurrentPage
      />
    );
  }

  // 2+ items: every ancestor goes into the overflow menu, only the
  // current page renders inline.
  const current = items.at(-1)!;
  const collapsed = items.slice(0, -1);

  return (
    <>
      <div className="breadcrumb">
        <BreadcrumbItem
          isIconOnly
          icon={'moreHorizontal'}
          ref={overflow.anchorRef}
          onClick={overflow.toggle}
        />
        <span className="breadcrumb__slash">
          <AppIcon icon="caretRight" />
        </span>

        <BreadcrumbItem
          id={current.id}
          icon={current.icon}
          emoji={current.emoji}
          title={current.title}
          onClick={current.onClick}
          isCurrentPage
        />
      </div>

      <Overlay
        open={overflow.open}
        onClose={overflow.hide}
        anchorRef={overflow.anchorRef}
        side="bottom"
        alignment="start"
      >
        <Menu size="medium">
          {collapsed.map((item) => (
            <MenuItem
              key={item.id}
              onClick={() => {
                item.onClick?.();
                overflow.hide();
              }}
              leading={
                item.icon ? (
                  <AppIcon icon={item.icon} emoji={item.emoji} />
                ) : undefined
              }
            >
              {item.title}
            </MenuItem>
          ))}
        </Menu>
      </Overlay>
    </>
  );
}
