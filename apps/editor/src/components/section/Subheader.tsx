import type { HTMLAttributes } from 'react';

import { Badge } from '../Badge';

export type SubheaderLabelAppearance = 'badge' | 'text';

export interface SubheaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /**
   * Figma `SectionGroupHeader` type "Badge" vs "Text":
   * pill label vs plain muted label.
   */
  labelAppearance?: SubheaderLabelAppearance;
  /** Passed to inner `Badge`. */
  text?: string;
  dot?: boolean;
  caretLeft?: boolean;
  caretRight?: boolean;
  showText?: boolean;
}

export function Subheader({
  labelAppearance = 'badge',
  text,
  dot,
  caretLeft,
  caretRight,
  showText,
  className,
  ...divProps
}: SubheaderProps) {
  const cls = ['clutter-subheader', className].filter(Boolean).join(' ');

  return (
    <div className={cls} {...divProps}>
      <Badge
        appearance={labelAppearance === 'text' ? 'plain' : 'filled'}
        text={text}
        dot={dot}
        caretLeft={caretLeft}
        caretRight={caretRight}
        showText={showText}
      />
    </div>
  );
}
