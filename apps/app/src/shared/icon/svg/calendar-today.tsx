import type { FC, SVGProps } from 'react';
import { formatDate } from '@shared/helpers/time/';

export type CalendarTodayIconProps = SVGProps<SVGSVGElement> & {
  /** Local calendar day to show (defaults to today). */
  date?: Date;
};

/**
 * Figma “Calendar with date” (node 2086:36932): reuses `calendar-blank.svg` frame + live day `<text>`.
 * Stroke and digit use `currentColor` — set `style={{ color: 'var(--icon-secondary)' }}` when you need Figma’s muted treatment.
 */
export const CalendarTodayIcon: FC<CalendarTodayIconProps> = ({
  date,
  ...svgProps
}) => {
  const day = formatDate((date ?? new Date()).toISOString(), 'date');

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="none"
      {...svgProps}
      aria-hidden
    >
      <path
        d="M5 2V1M5 2H11M5 2C3.34315 2 2 3.34315 2 5V11C2 12.6569 3.34315 14 5 14H11C12.6569 14 14 12.6569 14 11V5C14 3.34315 12.6569 2 11 2M11 2V1M4.75 4.5H11.25"
        stroke="currentColor"
        strokeLinecap="round"
      />
      <text
        x={8}
        y={9.45}
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        fontSize={6}
        fontWeight={600}
        letterSpacing={0}
        fontFamily="var(--font-sans, Inter, system-ui, sans-serif)"
      >
        {day}
      </text>
    </svg>
  );
};
