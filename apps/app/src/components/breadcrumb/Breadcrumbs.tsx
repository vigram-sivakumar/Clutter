import { Breadcrumb, type BreadcrumbProps } from './Breadcrumb';
import { AppIcon } from '@shared/icon';

interface BreadcrumbsProps {
  items: BreadcrumbProps[];
}

/**
 * Renders the breadcrumb trail.
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  // Current page only.
  if (items.length === 1) {
    return <Breadcrumb variant="current" {...items[0]!} />;
  }

  const first = items[0]!;
  const FirstIcon = first.icon;
  const last = items[items.length - 1]!;
  const middleItems = items.slice(1, -1);

  return (
    <>
      {/* Origin */}

      <Breadcrumb id={first.id} variant="origin" icon={FirstIcon} />
      <span className="breadcrumb__slash">
        <AppIcon icon="slash" />
      </span>
      {/* <IconSlot icon="slash" /> */}
      {/* Overflow */}
      {middleItems.length > 0 && (
        <>
          <Breadcrumb variant="overflow" />
          <span className="breadcrumb__slash">
            <AppIcon icon="slash" />
          </span>
        </>
      )}
      {/* Current */}
      <Breadcrumb id={last.id} variant="current" {...last} />
    </>
  );
}
