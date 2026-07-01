import type { HTMLAttributes } from 'react';
import './badge.css';
import type { TagPaletteId } from '../../design-system/tag-colors';

export type badgeSize = 'default' | 'small';

/** Tag palettes plus the border-only outlined variant from Figma. */
export type badgeColor = TagPaletteId | 'outlined';

export interface badgeProps extends HTMLAttributes<HTMLSpanElement> {
  label?: string;
  color?: badgeColor;
  size?: badgeSize;
  /** Leading status dot (8px), tinted to match label color. */
  dot?: boolean;
}

export function Badge({
  label,
  color = 'green',
  size = 'default',
  dot = false,
  className,
  ...props
}: badgeProps) {
  const cls = ['badge', `badge--${size}`, `badge--${color}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={cls} {...props}>
      {dot && <span className="badge__dot" aria-hidden />}
      <span className="badge__label">{label}</span>
    </span>
  );
}
