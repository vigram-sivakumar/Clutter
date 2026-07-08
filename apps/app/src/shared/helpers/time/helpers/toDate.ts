import type { ISODate } from '../types';

/**
 * Converts an ISO date to a Date object.
 */
export function toDate(date: ISODate) {
  return new Date(date);
}
