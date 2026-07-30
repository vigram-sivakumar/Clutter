import './CountBadge.css';

export interface CountBadgeProps {
  count?: number | null;
  /** Display cap before showing `{max}+`. Default 99. */
  max?: number;
  className?: string;
}

function normalizeCount(count: number | null | undefined): number {
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    return 0;
  }

  return count;
}

export function formatCount(
  count: number | null | undefined,
  max = 99
): string {
  const value = normalizeCount(count);

  if (value > max) {
    return `${max}+`;
  }

  return String(value);
}

export function CountBadge({ count, max = 99, className }: CountBadgeProps) {
  const value = normalizeCount(count);

  if (value <= 0) {
    return null;
  }

  const label = formatCount(value, max);

  return (
    <span
      className={['clutter-count-badge', className].filter(Boolean).join(' ')}
      aria-label={`${value} items`}
    >
      {label}
    </span>
  );
}
