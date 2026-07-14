import './Breadcrumbs.css';
import { BreadcrumbItem, BreadcrumbItemProps } from './BreadcrumbItem';
import { AppIcon } from '@shared/icon';
import { Overlay } from '@components/overlay/Overlay';
import { useOverlay } from '@components/overlay/hooks/useOverlay';

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
  const overflow = useOverlay<HTMLButtonElement>();

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
              isIconOnly
              icon={'moreHorizontal'}
              ref={overflow.anchorRef}
              onClick={overflow.toggle}
            />
            <Overlay
              open={overflow.open}
              onClose={overflow.hide}
              anchorRef={overflow.anchorRef}
              side="bottom"
              alignment="start"
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
