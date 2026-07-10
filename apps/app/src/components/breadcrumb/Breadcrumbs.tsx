import './Breadcrumbs.css';
import { BreadcrumbItem, BreadcrumbItemProps } from './BreadcrumbItem';
import { AppIcon } from '@shared/icon';
import { useState } from 'react';

interface BreadcrumbsProp {
  items: BreadcrumbItemProps[];
}

export function Breadcrumbs({ items }: BreadcrumbsProp) {
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
        title={current.title}
        onClick={() => {}}
      />
    );
  }
  // Renders root, current & overflow
  const root = items[0]!;
  const current = items.at(-1)!; //Returns last item in the array
  const collapsed = items.slice(1, -1)!;
  const [isOverflowOpen, setIsOverflowIsOpen] = useState(false);

  return (
    <div className="breadcrumb">
      <BreadcrumbItem
        id={root.id}
        isIconOnly
        icon={root.icon}
        emoji={root.emoji}
        title={root.title}
        onClick={() => {}}
      />
      <span className="breadcrumb__slash">
        <AppIcon icon="slash" />
      </span>
      {collapsed.length > 0 && (
        <>
          <div
            className="breadcrumb-overflow"
            onMouseEnter={() => setIsOverflowIsOpen(true)}
            onMouseLeave={() => setIsOverflowIsOpen(false)}
          >
            <BreadcrumbItem
              id={root.id}
              isIconOnly
              icon={'moreHorizontal'}
              onClick={() => {}}
            />
            {isOverflowOpen && (
              <div className="breadcrumb-overflow__menu">
                {collapsed.map((item) => (
                  <BreadcrumbItem
                    id={item.id}
                    icon={item.icon}
                    emoji={item.emoji}
                    title={item.title}
                    onClick={() => {}}
                  />
                ))}
              </div>
            )}
          </div>
          <span className="breadcrumb__slash">
            <AppIcon icon="slash" />
          </span>
        </>
      )}
      <BreadcrumbItem
        id={root.id}
        icon={current.icon}
        emoji={current.emoji}
        title={current.title}
        onClick={() => {}}
      />
    </div>
  );
}
