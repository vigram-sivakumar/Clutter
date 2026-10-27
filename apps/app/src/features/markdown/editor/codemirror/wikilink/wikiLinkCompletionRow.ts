import { formatDailyNoteTitle } from '@core/presentation/formatDailyNoteTitle';
import { isToday } from '@shared/helpers/time';
import { systemIconSvg } from '@shared/icon';

import { assetCompletionRow } from '../completionPopup/assetCompletionRow';
import { COMPLETION_ICONS } from '../completionPopup/completionIcons';
import {
  GROUPED_LAYOUT,
  applyListLayout,
  type CompletionListLayout,
  type CompletionRowSpec,
  type RowCompletion,
} from '../completionPopup/completionRow';
import type { TargetFamily } from '../completionPopup/mixedGroups';
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
 * leaves `suggestion.path` itself — what gets inserted and created — untouched. A folder is listed
 * under Folders and an asset under Images or PDFs, each with its own icon, so a folder, a note and
 * a file that share a name are told apart by section as well as by icon.
 */
export function wikiLinkRow(
  suggestion: WikiLinkSuggestion,
  layout: CompletionListLayout = GROUPED_LAYOUT
): Pick<WikiLinkCompletion, 'row' | 'section' | 'limitKey'> {
  return applyListLayout(sectionedWikiLinkRow(suggestion), layout);
}

function sectionedWikiLinkRow(suggestion: WikiLinkSuggestion): Pick<WikiLinkCompletion, 'row' | 'section' | 'limitKey'> {

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

  if (suggestion.kind === 'folder') {
    return {
      row: {
        iconSvg: systemIconSvg(suggestion.icon ?? 'folder'),
        emoji: suggestion.emoji,
        title: suggestion.title,
        path: suggestion.breadcrumb,
      },
      section: COMPLETION_SECTIONS.linkFolders,
    };
  }

  if (suggestion.kind === 'asset') {
    // The one asset row `![[` also uses (thumbnails included), under this popup's own sections.
    return assetCompletionRow(suggestion, {
      images: COMPLETION_SECTIONS.linkImages,
      pdfs: COMPLETION_SECTIONS.linkPdfs,
    });
  }

  if (suggestion.dailyNote) {
    return {
      row: {
        iconSvg: isToday(suggestion.title) ? COMPLETION_ICONS.calendarDot : COMPLETION_ICONS.calendarNote,
        title: formatDailyNoteTitle(suggestion.title),
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

/** Which family a `[[` suggestion belongs to, for the two-group split of a mixed result (`mixedGroups.ts`). */
export function wikiLinkFamily(suggestion: WikiLinkSuggestion): TargetFamily | undefined {
  if (suggestion.kind === 'create') {
    return undefined;
  }

  return suggestion.kind === 'asset' ? 'assets' : 'notes';
}
