import { toDate } from '@shared/helpers/time/helpers/toDate';
import type { DateFormat, ISODate } from '@shared/helpers/time/types';

const DEFAULT_LOCALE = 'en-IN';

/**
 * Formats a date.
 */
export function formatDate(date: ISODate, format: DateFormat) {
  const currentDate = toDate(date);

  switch (format) {
    case 'date':
      return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
        day: 'numeric',
      }).format(currentDate);

    case 'monthShort':
      return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
        month: 'short',
      }).format(currentDate);
    case 'monthLong':
      return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
        month: 'long',
      }).format(currentDate);

    case 'monthYear':
      return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
        month: 'short',
        year: 'numeric',
      }).format(currentDate);

    case 'longDate':
      return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(currentDate);

    case 'weekday':
      return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(currentDate);
  }
}
