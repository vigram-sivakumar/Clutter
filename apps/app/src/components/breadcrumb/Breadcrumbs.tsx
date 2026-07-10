import './Breadcrumbs.css';
import { BreadcrumbItem, BreadcrumbItemProps } from './BreadcrumbItem';
import { AppIcon } from '@shared/icon';
import { useState, useRef } from 'react';
import { Overlay } from '@shared/overlay/Overlay';

interface BreadcrumbsProps {
  items: BreadcrumbItemProps[];
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
        icon={current.icon}
        emoji={current.emoji}
      />
    );
  }
  // Renders root, current & overflow
  const root = items[0]!;
  const current = items.at(-1)!; //Returns last item in the array
  const collapsed = items.slice(1, -1)!;
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const closeOverflow = () => setIsOverflowOpen(false);
  const overflowButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="breadcrumb">
      <BreadcrumbItem
        id={root.id}
        isIconOnly
        icon={root.icon}
        emoji={root.emoji}
        title={root.title}
      />
      <span className="breadcrumb__slash">
        <AppIcon icon="slash" />
      </span>
      {collapsed.length > 0 && (
        <>
          <div className="breadcrumb-overflow">
            <BreadcrumbItem
              ref={overflowButtonRef}
              isIconOnly
              icon={'moreHorizontal'}
              onClick={() => setIsOverflowOpen((prev) => !prev)}
            />
            <Overlay
              open={isOverflowOpen}
              anchorRef={overflowButtonRef}
              placement="top-end"
              onClose={closeOverflow}
            >
              <div className="breadcrumb-overflow__menu">
                {collapsed.map((item) => (
                  <BreadcrumbItem
                    key={item.id}
                    icon={item.icon}
                    emoji={item.emoji}
                    title={item.title}
                  />
                ))}
              </div>
            </Overlay>
          </div>
          <span className="breadcrumb__slash">
            <AppIcon icon="slash" />
          </span>
        </>
      )}
      <BreadcrumbItem
        id={current.id}
        icon={current.icon}
        emoji={current.emoji}
        title={current.title}
      />
    </div>
  );
}
