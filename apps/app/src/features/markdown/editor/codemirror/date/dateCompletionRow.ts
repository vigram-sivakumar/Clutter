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
 * How a Date suggestion reads in the popup: always the full human-readable date
 * (`formatDateDisplay`'s `'shortWeekday'` — the Daily Note title format with an abbreviated
 * weekday, since a row has less room than a page title), never the raw ISO value. A relative
 * keyword (`Today`, `Tomorrow`, `Yesterday`) has no date of its own in its label, so it is shown
 * on the right next to the date it resolved to.
 */
export function dateRow(suggestion: DateSuggestion): DateCompletion['row'] {
  return {
    iconSvg: COMPLETION_ICONS.calendarBlank,
    title: formatDateDisplay(suggestion.isoDate, 'shortWeekday'),
    trailing: /^[A-Za-z]+$/.test(suggestion.label) ? suggestion.label : undefined,
  };
}
