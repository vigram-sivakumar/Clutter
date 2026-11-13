import type { ReactNode } from 'react';
import './CountBadge.css';

export interface CountBadgeProps {
  count?: number | null;
  size?: 'medium' | 'small';
  /** Display cap before showing `{max}+`. Default 99. */
  max?: number;
  className?: string;
  /** Optional presentation of the value (e.g. an animated numeral); count still owns accessibility and visibility. */
  children?: ReactNode;
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

export function CountBadge({
  count,
  size = 'medium',
  max = 99,
  className,
  children,
}: CountBadgeProps) {
  const value = normalizeCount(count);

  if (value <= 0) {
    return null;
  }

  const label = formatCount(value, max);

  return (
    <span
      className={['count-badge', `count-badge--${size}`, className]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${value} items`}
    >
      {children ?? label}
    </span>
  );
}
