/**
 * ISO local date.
 *
 * Example:
 * 2026-07-08
 */
export type ISODate = string;

/**
 * Supported date formats.
 */
export type DateFormat =
  | 'date' // 12
  | 'monthShort' // Jan
  | 'monthLong' // January
  | 'monthYear' // Jan 2027
  | 'longDate' // 12 January 2027
  | 'weekday'; // Monday, 12 January 2027
