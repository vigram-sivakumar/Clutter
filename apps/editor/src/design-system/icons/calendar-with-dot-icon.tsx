import type { CSSProperties, FC } from 'react';

import CalendarBlankFrame from './svg/calendar-blank.svg?react';

export type CalendarWithDotIconProps = {
  size?: number;
  className?: string;
  style?: CSSProperties;
};

/**
 * Figma calendar + event dot: same frame as `calendar-blank.svg`, dot uses `var(--calendar-accent)`
 * via inline style (avoids `fill="var(...)"` on static SVG / root `fill="none"` quirks).
 */
export const CalendarWithDotIcon: FC<CalendarWithDotIconProps> = ({
  size = 16,
  className,
  style,
}) => {
  const mergedStyle: CSSProperties = {
    display: 'block',
    flexShrink: 0,
    ...style,
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="none"
      width={size}
      height={size}
      className={className}
      style={mergedStyle}
      aria-hidden
    >
      <CalendarBlankFrame
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block' }}
        aria-hidden
      />
      <circle cx={8} cy={9} r={1} style={{ fill: 'var(--calendar-accent)' }} />
    </svg>
  );
};
