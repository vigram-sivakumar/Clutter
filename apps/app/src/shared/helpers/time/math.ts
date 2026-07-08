import { toDate } from '@shared/helpers/time/helpers/toDate';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import type { ISODate } from '@shared/helpers/time/types';

/**
 * Adds days to a date.
 */
export function addDays(date: ISODate, days: number) {
  const currentDate = toDate(date);

  currentDate.setDate(currentDate.getDate() + days);

  return toISODate(currentDate);
}

/**
 * Adds weeks to a date.
 */
export function addWeeks(date: ISODate, weeks: number) {
  return addDays(date, weeks * 7);
}

/**
 * Adds months to a date.
 */
export function addMonths(date: ISODate, months: number) {
  const currentDate = toDate(date);

  currentDate.setMonth(currentDate.getMonth() + months);

  return toISODate(currentDate);
}

/**
 * Returns the start of the week.
 */
export function startOfWeek(date: ISODate) {
  const currentDate = toDate(date);

  currentDate.setDate(currentDate.getDate() - currentDate.getDay());

  return toISODate(currentDate);
}

/**
 * Returns the end of the week.
 */
export function endOfWeek(date: ISODate) {
  const currentDate = toDate(date);

  currentDate.setDate(currentDate.getDate() + (6 - currentDate.getDay()));

  return toISODate(currentDate);
}

/**
 * Returns the start of the month.
 */
export function startOfMonth(date: ISODate) {
  const currentDate = toDate(date);

  currentDate.setDate(1);

  return toISODate(currentDate);
}

/**
 * Returns the end of the month.
 */
export function endOfMonth(date: ISODate) {
  const currentDate = toDate(date);

  currentDate.setMonth(currentDate.getMonth() + 1);
  currentDate.setDate(0);

  return toISODate(currentDate);
}
