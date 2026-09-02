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
  if (items.length === 0) {
    return null;
  }
  // Current page only
  if (items.length === 1) {
    const current = items[0]!;

    return (
      <BreadcrumbItem
        id={current.id}
        title={current.title}
        icon={current.icon}
        emoji={current.emoji}
        onClick={current.onClick}
      />
    );
  }
  const root = items[0]!;
  const current = items.at(-1)!; //Returns last item in the array
  const overflow = useOverlay<HTMLButtonElement>();

  // First / Last — no room for a distinct secondLast, so root and current
  // are the only two crumbs.
  if (items.length === 2) {
    return (
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
          id={current.id}
          icon={current.icon}
          emoji={current.emoji}
          title={current.title}
          onClick={current.onClick}
        />
      </div>
    );
  }

  // Renders root, current & overflow
  const secondLast = items.at(-2)!;
  const collapsed = items.slice(1, -2)!;

  return (
    <>
      <div className="breadcrumb">
        <BreadcrumbItem
          id={root.id}
          // isIconOnly
          icon={root.icon}
          emoji={root.emoji}
          title={root.title}
          onClick={root.onClick}
        />

        {collapsed.length > 0 && (
          <>
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
          </>
        )}
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

      {/* Overlay Menu */}
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
