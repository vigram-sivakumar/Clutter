/**
 * ISO local date.
 *
 * Example:
 * 2026-07-08
 */
export type ISODate = string;

/**
 * The structural calendar pieces `formatDate` can produce (in the system locale). Displaying a date is `formatDateDisplay`'s job.
 */
export type DateFormat =
  | 'date' // 12
  | 'monthLong' // January
  | 'monthYear' // Jan 2027
  | 'year'; // 2027
