import { getSystemLocale } from '@shared/helpers/time/dateLocale';
import { toDate } from '@shared/helpers/time/helpers/toDate';
import type { DateFormat, ISODate } from '@shared/helpers/time/types';

/**
 * The structural pieces of a calendar — a day number, month names and the year for headings and section
 * titles — in the system locale (or `locale`). Not a way to display a date, and not part of the Date format
 * preference: that is `formatDateDisplay` (`dateDisplay.ts`).
 */
export function formatDate(date: ISODate, format: DateFormat, locale: string = getSystemLocale()) {
  const currentDate = toDate(date);

  switch (format) {
    case 'date':
      return new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(currentDate);

    case 'monthLong':
      return new Intl.DateTimeFormat(locale, { month: 'long' }).format(currentDate);

    case 'monthYear':
      return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(currentDate);

    case 'year':
      return new Intl.DateTimeFormat(locale, { year: 'numeric' }).format(currentDate);
  }
}
