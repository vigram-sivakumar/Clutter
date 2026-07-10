import { BreadcrumbItem, BreadcrumbItemProps } from './BreadcrumbItem';
import { AppIcon } from '@shared/icon';

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
          <BreadcrumbItem
            id={root.id}
            isIconOnly
            icon={'moreHorizontal'}
            onClick={() => {}}
          />
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
