import type { HTMLAttributes } from 'react';

import { Pill, type PillColor } from '../Pill';

/**
 * Figma `SectionSubheader` (node 248:6893): row contains a `Pill` only —
 * `dark-grey` + `small` for the filled pill vs `text` + `small` for the
 * inline pill, optional `dot`. Not a calendar date chip.
 */
export type SubheaderLabelAppearance = 'pill' | 'text';

export interface SubheaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  labelAppearance?: SubheaderLabelAppearance;
  /** Passed through to `Pill` (`dark-grey` + `small` when `labelAppearance` is `pill`). */
  pillColor?: PillColor;
  text?: string;
  dot?: boolean;
  /** When false, hides the label; dot-only is still allowed. */
  showText?: boolean;
}

export function Subheader({
  labelAppearance = 'pill',
  pillColor = 'dark-grey',
  text,
  dot,
  showText,
  className,
  ...divProps
}: SubheaderProps) {
  const cls = ['clutter-subheader', className].filter(Boolean).join(' ');

  const showLabel = showText !== false;
  const labelContent = showLabel ? text : undefined;
  const pillColorResolved =
    labelAppearance === 'text' ? 'text' : pillColor;

  return (
    <div className={cls} {...divProps}>
      <Pill
        color={pillColorResolved}
        size="small"
        dot={Boolean(dot)}
      >
        {labelContent}
      </Pill>
    </div>
  );
}
