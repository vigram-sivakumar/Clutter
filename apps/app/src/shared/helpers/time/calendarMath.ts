import type { ISODate } from './types';

/** The days in `month` (1–12) of `year`. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one, in local time: no timezone or DST involved.
  return new Date(year, month, 0).getDate();
}

function isoOf(year: number, month: number, day: number): ISODate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function partsOf(date: ISODate): { year: number; month: number; day: number } {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return { year, month, day };
}

/**
 * `date` plus `months` calendar months, the day kept unless the target month is shorter, then the last day of it:
 * Jan 31 + 1 month = Feb 28 (or 29), never March 3. (`math.ts`'s `addMonths` rolls over instead, which is right
 * for nothing a person means by "in a month".) Negative `months` go back.
 */
export function addMonthsClamped(date: ISODate, months: number): ISODate {
  const { year, month, day } = partsOf(date);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12 + 12) % 12 + 1;
  return isoOf(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

/** `date` plus `years` calendar years, clamped like `addMonthsClamped`: Feb 29 + 1 year = Feb 28. */
export function addYearsClamped(date: ISODate, years: number): ISODate {
  return addMonthsClamped(date, years * 12);
}
