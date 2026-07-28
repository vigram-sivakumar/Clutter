import './Breadcrumbs.css';
import { BreadcrumbItem } from './BreadcrumbItem';
import { AppIcon, type SystemIcon } from '@shared/icon';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { Overlay } from '@components/overlay/Overlay';
import { useOverlay } from '@components/overlay/hooks/useOverlay';

/**
 * A single entry in a page's ancestry trail.
 *
 * This is domain/view data, not UI props — it knows nothing about how it
 * will be rendered (icon-only, collapsed into an overflow menu, etc.).
 */
export interface Breadcrumb {
  id: string;
  title: string;
  icon?: SystemIcon;
  emoji?: string;
  onClick?: () => void;
}

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
  // Renders root, current & overflow
  const root = items[0]!;
  const current = items.at(-1)!; //Returns last item in the array
  const collapsed = items.slice(1, -1)!;
  const overflow = useOverlay<HTMLButtonElement>();

  return (
    <>
      <div className="breadcrumb">
        <BreadcrumbItem
          id={root.id}
          isIconOnly
          icon={root.icon}
          emoji={root.emoji}
          title={root.title}
          onClick={root.onClick}
        />
        <span className="breadcrumb__slash">
          <AppIcon icon="slash" />
        </span>
        {collapsed.length > 0 && (
          <>
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
