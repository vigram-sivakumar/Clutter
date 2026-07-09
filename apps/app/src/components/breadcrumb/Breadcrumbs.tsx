import { Breadcrumb, type BreadcrumbProps } from './Breadcrumb';

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
      {/* Overflow */}
      {middleItems.length > 0 && (
        // <Breadcrumb variant="overflow" />
        <Breadcrumb variant="overflow" />
      )}
      {/* Current */}
      <Breadcrumb id={last.id} variant="current" {...last} />
    </>
  );
}
