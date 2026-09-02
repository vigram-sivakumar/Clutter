import { Fragment } from 'react';

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

  // With 3 or fewer items there's never a gap to collapse — render the
  // trail as-is, one BreadcrumbItem per entry, slash-separated.
  if (items.length <= 3) {
    return (
      <div className="breadcrumb">
        {items.map((item, index) => (
          <Fragment key={item.id}>
            {index > 0 && (
              <span className="breadcrumb__slash">
                <AppIcon icon="slash" />
              </span>
            )}
            <BreadcrumbItem
              id={item.id}
              icon={item.icon}
              emoji={item.emoji}
              title={item.title}
              onClick={item.onClick}
            />
          </Fragment>
        ))}
      </div>
    );
  }

  // 4+ items: root, an overflow menu for everything between, then the
  // last two items.
  const root = items[0]!;
  const current = items.at(-1)!;
  const secondLast = items.at(-2)!;
  const collapsed = items.slice(1, -2);

  return (
    <>
      <div className="breadcrumb">
        <BreadcrumbItem
          id={root.id}
          icon={root.icon}
          emoji={root.emoji}
          title={root.title}
          onClick={root.onClick}
        />

        <span className="breadcrumb__slash">
          <AppIcon icon="slash" />
        </span>
        <BreadcrumbItem
          isIconOnly
          icon={'moreHorizontal'}
          ref={overflow.anchorRef}
          onClick={overflow.toggle}
        />
        <span className="breadcrumb__slash">
          <AppIcon icon="slash" />
        </span>

        <BreadcrumbItem
          id={secondLast.id}
          icon={secondLast.icon}
          emoji={secondLast.emoji}
          title={secondLast.title}
          onClick={secondLast.onClick}
        />

        <span className="breadcrumb__slash">
          <AppIcon icon="slash" />
        </span>

        <BreadcrumbItem
          id={current.id}
          icon={current.icon}
          emoji={current.emoji}
          title={current.title}
          onClick={current.onClick}
        />
      </div>

      <Overlay
        open={overflow.open}
        onClose={overflow.hide}
        anchorRef={overflow.anchorRef}
        side="bottom"
        alignment="start"
      >
        <Menu size="small">
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
