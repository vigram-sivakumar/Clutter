import type { HTMLAttributes, ReactNode } from 'react';

import { ICON_EXTRA_SMALL } from '../design-system/icons';

/** Figma `Pill` color variants (`text` = chrome-less muted label). */
export type PillColor =
  | 'blue'
  | 'green'
  | 'grey'
  | 'indigo'
  | 'orange'
  | 'purple'
  | 'red'
  | 'yellow'
  | 'dark-grey'
  | 'text';

export type PillProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  color?: PillColor;
  /** `Small`: 12px / medium · `default`: 14px / regular (filled hues). */
  size?: 'default' | 'small';
  /** Leading status dot; size from `ICON_EXTRA_SMALL` / `--dot-md` (design-system/icons + main.tsx). */
  dot?: boolean;
  /** Omitted or empty with `dot` only — no label line. */
  children?: ReactNode;
};

function shouldRenderPillLabel(children: ReactNode): boolean {
  if (children == null || children === false) {
    return false;
  }
  if (typeof children === 'string' && children.length === 0) {
    return false;
  }
  return true;
}

const COLOR_MODIFIER: Record<PillColor, string> = {
  blue: 'clutter-pill--blue',
  green: 'clutter-pill--green',
  grey: 'clutter-pill--grey',
  indigo: 'clutter-pill--indigo',
  orange: 'clutter-pill--orange',
  purple: 'clutter-pill--purple',
  red: 'clutter-pill--red',
  yellow: 'clutter-pill--yellow',
  'dark-grey': 'clutter-pill--dark-grey',
  text: 'clutter-pill--inline',
};

export function Pill({
  color = 'green',
  size = 'default',
  dot = false,
  children,
  className,
  ...divProps
}: PillProps) {
  const cls = [
    'clutter-pill',
    size === 'small' && 'clutter-pill--small',
    COLOR_MODIFIER[color],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} {...divProps}>
      {dot && (
        <span className="clutter-pill__dot-wrap" aria-hidden>
          <span
            className="clutter-pill__dot"
            style={{
              width: ICON_EXTRA_SMALL,
              height: ICON_EXTRA_SMALL,
              borderRadius: '50%',
              background: 'currentColor',
              display: 'block',
            }}
          />
        </span>
      )}
      {shouldRenderPillLabel(children) && (
        <p className="clutter-pill__label">{children}</p>
      )}
    </div>
  );
}
