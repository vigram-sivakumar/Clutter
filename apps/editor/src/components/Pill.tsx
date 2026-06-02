import type { HTMLAttributes } from 'react';

import '../styles/pill.css';

import type { TagPaletteId } from '../design-system/tag-colors';

export type PillSize = 'default' | 'small';

/** Tag palettes plus the border-only outlined variant from Figma. */
export type PillColor = TagPaletteId | 'outlined';

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  label: string;
  color?: PillColor;
  size?: PillSize;
  /** Leading status dot (8px), tinted to match label color. */
  dot?: boolean;
}

export function Pill({
  label,
  color = 'green',
  size = 'default',
  dot = false,
  className,
  ...props
}: PillProps) {
  const cls = [
    'clutter-pill',
    `clutter-pill--${size}`,
    `clutter-pill--${color}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={cls} {...props}>
      {dot && <span className="clutter-pill__dot" aria-hidden />}
      <span className="clutter-pill__label">{label}</span>
    </span>
  );
}
