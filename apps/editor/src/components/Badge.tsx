import type { HTMLAttributes } from 'react';

import { ICON_SMALL, Icons } from '../design-system/icons';

export type BadgeAppearance = 'filled' | 'plain';
export type BadgeTextStyle = 'label' | 'number';

type BadgeBaseProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

type BadgeTextProps = BadgeBaseProps & {
  appearance?: BadgeAppearance;
  /** Text content for the badge. */
  text?: string;
  textStyle?: BadgeTextStyle;
  dot?: boolean;
  caretLeft?: boolean;
  caretRight?: boolean;
  /** When false, hides the text paragraph. */
  showText?: boolean;
  onlyDot?: false;
};

type BadgeOnlyDotProps = BadgeBaseProps & {
  onlyDot: true;
};

export type BadgeProps = BadgeTextProps | BadgeOnlyDotProps;

const DOT_PX = 8;
const DEFAULT_TEXT = 'Badge';
const DEFAULT_NUMBER_TEXT = '19';

export function Badge(props: BadgeProps) {
  const { className, ...divProps } = props;
  const onlyDot = props.onlyDot === true;
  const appearance = onlyDot ? 'filled' : (props.appearance ?? 'filled');
  const textStyle = onlyDot ? 'label' : (props.textStyle ?? 'label');

  const cls = [
    'clutter-badge',
    `clutter-badge--${appearance}`,
    textStyle === 'number' && 'clutter-badge--number',
    onlyDot && 'clutter-badge--dot-only',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const showLeftCaret = !onlyDot && Boolean(props.caretLeft);
  const showRightCaret = !onlyDot && Boolean(props.caretRight);
  const showDot = onlyDot || Boolean(props.dot);
  const text =
    onlyDot || props.showText === false
      ? null
      : (props.text ??
        (textStyle === 'number' ? DEFAULT_NUMBER_TEXT : DEFAULT_TEXT));
  const textClassName =
    textStyle === 'number'
      ? 'clutter-badge__text clutter-badge__text--number'
      : 'clutter-badge__text clutter-badge__text--label';

  return (
    <div className={cls} {...divProps}>
      {showLeftCaret && (
        <span className="clutter-badge__caret" aria-hidden>
          <Icons.CaretLeft size={ICON_SMALL} weight="bold" />
        </span>
      )}
      {showDot && (
        <span className="clutter-badge__dot-wrap" aria-hidden>
          <Icons.Circle
            className="clutter-badge__dot"
            size={DOT_PX}
            weight="fill"
          />
        </span>
      )}
      {text && <p className={textClassName}>{text}</p>}
      {showRightCaret && (
        <span className="clutter-badge__caret" aria-hidden>
          <Icons.CaretRight size={ICON_SMALL} weight="bold" />
        </span>
      )}
    </div>
  );
}
