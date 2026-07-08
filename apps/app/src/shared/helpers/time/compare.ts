import { toDate } from '@shared/helpers/time/helpers/toDate';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import type { ISODate } from '@shared/helpers/time/types';

/**
 * Returns today's date.
 */
function getToday() {
  return new Date();
}

/**
 * Checks whether the date is today.
 */
export function isToday(date: ISODate) {
  return isSame(date, toISODate(getToday()));
}

/**
 * Checks whether the date is yesterday.
 */
export function isYesterday(date: ISODate) {
  const yesterday = getToday();

  yesterday.setDate(yesterday.getDate() - 1);

  return isSame(date, toISODate(yesterday));
}

/**
 * Checks whether the date is tomorrow.
 */
export function isTomorrow(date: ISODate) {
  const tomorrow = getToday();

  tomorrow.setDate(tomorrow.getDate() + 1);

  return isSame(date, toISODate(tomorrow));
}

/**
 * Checks whether the date is in the current month.
 */
export function isCurrentMonth(date: ISODate) {
  const currentDate = toDate(date);
  const today = getToday();

  return (
    currentDate.getFullYear() === today.getFullYear() &&
    currentDate.getMonth() === today.getMonth()
  );
}

/**
 * Checks whether the date is in the current year.
 */
export function isCurrentYear(date: ISODate) {
  const currentDate = toDate(date);
  const today = getToday();

  return currentDate.getFullYear() === today.getFullYear();
}

/**
 * Checks whether the date is in the past.
 */
export function isPast(date: ISODate) {
  const currentDate = toDate(date);
  const today = getToday();

  currentDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return currentDate < today;
}

/**
 * Checks whether the date is in the future.
 */
export function isFuture(date: ISODate) {
  const currentDate = toDate(date);
  const today = getToday();

  currentDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return currentDate > today;
}

/**
 * Checks whether two dates are the same.
 */
export function isSame(first: ISODate, second: ISODate) {
  const firstDate = toDate(first);
  const secondDate = toDate(second);

  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}

/**
 * Checks whether the first date is before the second.
 */
export function isBefore(first: ISODate, second: ISODate) {
  const firstDate = toDate(first);
  const secondDate = toDate(second);

  firstDate.setHours(0, 0, 0, 0);
  secondDate.setHours(0, 0, 0, 0);

  return firstDate < secondDate;
}

/**
 * Checks whether the first date is after the second.
 */
export function isAfter(first: ISODate, second: ISODate) {
  const firstDate = toDate(first);
  const secondDate = toDate(second);

  firstDate.setHours(0, 0, 0, 0);
  secondDate.setHours(0, 0, 0, 0);

  return firstDate > secondDate;
}
