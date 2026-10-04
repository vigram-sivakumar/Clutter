import { formatDailyNotePickerTitle } from '@core/presentation/formatDailyNoteTitle';
import { isToday } from '@shared/helpers/time';

import { COMPLETION_ICONS } from '../completionPopup/completionIcons';
import type { CompletionRowSpec, RowCompletion } from '../completionPopup/completionRow';
import { COMPLETION_SECTIONS } from '../completionPopup/completionSections';
import type { WikiLinkSuggestion } from './wikiLinkSuggestion';

/**
 * The one property `wikiLinkCompletionSource.ts` adds on top of the shared `RowCompletion` — lets
 * `wikiLinkAutocomplete.ts` recover the original suggestion without re-deriving it from `label`.
 */
export interface WikiLinkCompletion extends RowCompletion {
  readonly suggestion: WikiLinkSuggestion;
}

/**
 * How a WikiLink suggestion reads in the popup — the note picker's own rules
 * (`buildCoverNoteItems`): a note shows its name, its emoji or the note icon, and the folder it
 * lives in; a Daily Note shows its short date title with the Daily Note icon and no path (the date
 * says where it belongs). A "create" suggestion shows `Create "name"` with the folder it would be
 * created in; its `path` is the literal typed text, so the display-only split on the last "/"
 * leaves `suggestion.path` itself — what gets inserted and created — untouched.
 */
export function wikiLinkRow(suggestion: WikiLinkSuggestion): Pick<WikiLinkCompletion, 'row' | 'section'> {
  if (suggestion.kind === 'create') {
    const slash = suggestion.path.lastIndexOf('/');
    return {
      row: {
        iconSvg: COMPLETION_ICONS.plus,
        title: `Create "${slash === -1 ? suggestion.path : suggestion.path.slice(slash + 1)}"`,
        path: slash === -1 ? null : suggestion.path.slice(0, slash),
      },
    };
  }

  if (suggestion.dailyNote) {
    return {
      row: {
        iconSvg: isToday(suggestion.title) ? COMPLETION_ICONS.calendarDot : COMPLETION_ICONS.calendarNote,
        title: formatDailyNotePickerTitle(suggestion.title),
      },
      section: COMPLETION_SECTIONS.dailyNotes,
    };
  }

  const row: CompletionRowSpec = {
    iconSvg: COMPLETION_ICONS.note,
    emoji: suggestion.emoji,
    title: suggestion.title,
    // A page found by an alias shows which one — the text that becomes the link's display name.
    titleSuffix: suggestion.alias,
    path: suggestion.breadcrumb,
  };
  return { row, section: COMPLETION_SECTIONS.notes };
}
