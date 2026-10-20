import { formatDateDisplay } from '@shared/helpers/time/dateDisplay';

import { COMPLETION_ICONS } from '../completionPopup/completionIcons';
import type { RowCompletion } from '../completionPopup/completionRow';
import type { DateSuggestion } from './dateSuggestion';

/**
 * The one property `dateCompletionSource.ts` adds on top of the shared `RowCompletion` — the
 * ISO value stays here, and is the only thing that ever reaches the document (`apply()`).
 */
export interface DateCompletion extends RowCompletion {
  readonly dateSuggestion: DateSuggestion;
}

/**
 * How a Date suggestion reads in the popup: the shared `'long'` date (`4 October 2026`, or `Today` for
 * today), never the raw ISO value.
 */
export function dateRow(suggestion: DateSuggestion): DateCompletion['row'] {
  return {
    iconSvg: COMPLETION_ICONS.calendarBlank,
    title: formatDateDisplay(suggestion.isoDate, 'long'),
  };
}
