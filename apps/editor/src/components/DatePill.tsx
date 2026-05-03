import type { HTMLAttributes } from 'react';

import { DOT_MD, Icons } from '../design-system/icons';

const DEFAULT_NUMBER_TEXT = '19';

type DatePillBaseProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

/**
 * Figma date pill: number chip vs dot-only indicator.
 */
export type DatePillProps =
  | (DatePillBaseProps & {
      variant?: 'number';
      /** Day/count string shown in the chip. */
      text?: string;
      /** When false, hides the number (Figma label off). Default true. */
      showText?: boolean;
    })
  | (DatePillBaseProps & {
      variant: 'dot';
    });

export function DatePill(props: DatePillProps) {
  const { className, ...divProps } = props;
  const isDot = props.variant === 'dot';

  const cls = [
    'clutter-date-pill',
    'clutter-date-pill--filled',
    !isDot && 'clutter-date-pill--number',
    isDot && 'clutter-date-pill--dot-only',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const text =
    isDot || props.showText === false
      ? null
      : props.text ?? DEFAULT_NUMBER_TEXT;

  return (
    <div className={cls} {...divProps}>
      {isDot ? (
        <span className="clutter-date-pill__dot-wrap" aria-hidden>
          <Icons.Circle
            className="clutter-date-pill__dot"
            size={DOT_MD}
            weight="fill"
          />
        </span>
      ) : (
        text && (
          <p className="clutter-date-pill__text clutter-date-pill__text--number">
            {text}
          </p>
        )
      )}
    </div>
  );
}
