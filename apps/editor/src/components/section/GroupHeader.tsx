import type { HTMLAttributes } from 'react';

import { Badge } from '../Badge';

export type GroupHeaderLabelAppearance = 'badge' | 'text';

export interface GroupHeaderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /**
   * Figma `SectionGroupHeader` type "Badge" vs "Text":
   * pill label vs plain muted label.
   */
  labelAppearance?: GroupHeaderLabelAppearance;
  /** Passed to inner `Badge`. */
  text?: string;
  dot?: boolean;
  caretLeft?: boolean;
  caretRight?: boolean;
  showText?: boolean;
}

export function GroupHeader({
  labelAppearance = 'badge',
  text,
  dot,
  caretLeft,
  caretRight,
  showText,
  className,
  ...divProps
}: GroupHeaderProps) {
  const cls = ['clutter-section-group-header', className].filter(Boolean).join(' ');

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
