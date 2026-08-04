import type { Folder } from '@core/vault/models/Folder';
import { isToday } from '@shared/helpers/time';
import {
  getPageDisplayLabel,
  getPageDisplayLabelStyle,
  type PageDisplayLabelInput,
} from './getPageDisplayLabel';
import { getPageIcon } from './getPageIcon';

/**
 * The minimal shape a page-like entry must satisfy: getPageDisplayLabel's
 * own input plus the one extra field (icon) this composition also needs.
 * EffectivePage satisfies this directly; a durable-only caller can build
 * it from a Vault Page via toPageDisplayLabelInput() plus page.metadata.icon.
 */
export type EntryPresentationPageInput = PageDisplayLabelInput & {
  readonly icon: string | null;
};

function isFolder(
  entry: Folder | EntryPresentationPageInput
): entry is Folder {
  return !('type' in entry);
}

/**
 * The shared title/titleStyle/icon/emoji composition for a Folder-or-page
 * list row — the one place every list-row consumer (today: the sidebar's
 * Folders/Favorites sections and the Collection page) resolves these four
 * fields, so they can't drift or silently omit one (Favorites previously
 * composed this by hand and dropped emoji entirely).
 *
 * Returns a plain inferred shape, not a shared DTO — deliberately not a
 * named exported interface. Each consumer spreads the fields it needs into
 * its own feature-local row model alongside whatever interaction state
 * (selected, onClick, ...) is actually its own to own.
 */
export function buildEntryPresentation(entry: Folder | EntryPresentationPageInput) {
  if (isFolder(entry)) {
    return {
      title: entry.name,
      titleStyle: 'default' as const,
      icon: getPageIcon('folder'),
      emoji: entry.metadata.icon,
    };
  }

  const label = getPageDisplayLabel(entry);

  return {
    title: label.text,
    titleStyle: getPageDisplayLabelStyle(label),
    icon: getPageIcon(entry.type, entry.type === 'daily-note' && isToday(entry.name)),
    emoji: entry.icon,
  };
}
