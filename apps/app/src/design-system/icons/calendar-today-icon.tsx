import type { CSSProperties, FC } from 'react';
import { formatDate } from '@shared/helpers/time/';

import CalendarBlankFrame from './svg/calendar-blank.svg?react';

export type CalendarTodayIconProps = {
  /** Local calendar day to show (defaults to today). */
  date?: Date;
  className?: string;
  style?: CSSProperties;
};

/**
 * Figma “Calendar with date” (node 2086:36932): reuses `calendar-blank.svg` frame + live day `<text>`.
 * Stroke and digit use `currentColor` — set `style={{ color: 'var(--icon-secondary)' }}` when you need Figma’s muted treatment.
 */
export const CalendarTodayIcon: FC<CalendarTodayIconProps> = ({
  date,
  className,
  style,
}) => {
  const day = formatDate((date ?? new Date()).toISOString(), 'date');

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      style={style}
      aria-hidden
    >
      <CalendarBlankFrame
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      />
      <text
        x={8}
        y={9.45}
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        fontSize={6}
        fontWeight={600}
        letterSpacing={0.5}
        fontFamily="var(--font-sans, Inter, system-ui, sans-serif)"
      >
        {day}
      </text>
    </svg>
  );
};
