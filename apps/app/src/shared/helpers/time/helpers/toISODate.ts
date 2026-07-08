import type { ISODate } from '../types';

/**
 * Converts a Date object to an ISO date.
 */
export function toISODate(date: Date): ISODate {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
