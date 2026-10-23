import { formatDateReferenceDisplay } from '@shared/helpers/time/dateReference';

import { COMPLETION_ICONS } from '../completionPopup/completionIcons';
import type { RowCompletion } from '../completionPopup/completionRow';
import { suggestionReference, type DateSuggestion } from './dateSuggestion';

/**
 * The one property `dateCompletionSource.ts` adds on top of the shared `RowCompletion` — the suggestion stays
 * here, and its canonical stored text is the only thing that ever reaches the document (`apply()`).
 */
export interface DateCompletion extends RowCompletion {
  readonly dateSuggestion: DateSuggestion;
}

/**
 * How a Date suggestion reads in the popup, in the system's own formats — never a layout of this file's:
 * - a date: a calendar icon and the date as the user's Date format preference writes it (`4 October 2026`, or
 *   `Today` for today);
 * - a time: a clock icon and the day with the time (`Today, 7:00 AM`; the locale's own clock).
 */
export function dateRow(suggestion: DateSuggestion, referenceDate: Date = new Date()): DateCompletion['row'] {
  return {
    iconSvg: suggestion.time ? COMPLETION_ICONS.clock : COMPLETION_ICONS.calendarBlank,
    title: formatDateReferenceDisplay(suggestionReference(suggestion), referenceDate),
  };
}
