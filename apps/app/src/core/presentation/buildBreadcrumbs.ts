import type { Vault } from '@core/vault/models/Vault';
import type { Page, PageType } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { isToday } from '@shared/helpers/time';

import type { Breadcrumb } from './Breadcrumb';
import { isNoteUntitled } from './isNoteUntitled';
import { getPageTitlePlaceholder } from './PageDisplayPlaceholders';
import { getPageIcon } from './getPageIcon';
import {
  getSystemLocationForFolder,
  getSystemLocationPresentation,
} from './systemPresentation';

function isPage(entry: Page | Folder): entry is Page {
  return 'type' in entry;
}

// Breadcrumb is a static label with no native "empty value" placeholder
// mechanism (unlike the page header's EditableText) — so, unlike the
// header, an untitled Note's crumb needs the literal placeholder text,
// not an empty string. Folders always have a real, deliberate name; a
// Daily Note's crumb is always its real date (isNoteUntitled — Category
// B's predicate — is deliberately always false for daily-note).
function entryBreadcrumbTitle(entry: Page | Folder): string {
  if (isPage(entry) && isNoteUntitled(entry)) {
    return getPageTitlePlaceholder(entry.type);
  }

  return entry.name;
}

/**
 * Builds the breadcrumb trail for a page or folder.
 *
 * Every entry walks the same parent-folder chain; only the trailing
 * breadcrumb differs based on the entry type.
 */
function getEntryIcon(entry: Page | Folder) {
  if (!isPage(entry)) {
    return getPageIcon('folder');
  }

  return getPageIcon(entry.type, entry.type === 'daily-note' && isToday(entry.name));
}

/** Shared by buildBreadcrumbs and buildBreadcrumbsForDraft — the ancestor
 * chain only ever depends on a starting folderId and the Vault. */
function ancestorBreadcrumbs(
  folderId: string | null,
  vault: Vault,
  membershipSelector: MembershipSelector,
  onOpenFolder: (folderId: string) => void
): Breadcrumb[] {
  const ancestors: Breadcrumb[] = [];
  let current = folderId;

  while (current) {
    const folder = vault.getFolder(current);

    if (!folder) {
      break;
    }

    // A reserved folder (Archive, Inbox, Templates, Daily Notes) in the
    // ancestor chain gets its canonical system-location icon/label
    // instead of the generic folder icon and raw Vault folder name — the
    // same presentation an ordinary folder never has, since it's not one.
    // No emoji override for these: they're fixed, non-customizable system
    // icons, same as Tasks/Tags/Search already are.
    const systemLocation = getSystemLocationForFolder(folder, membershipSelector);
    const presentation = systemLocation
      ? getSystemLocationPresentation(systemLocation)
      : undefined;

    ancestors.unshift({
      id: folder.id,
      title: presentation ? presentation.label : folder.name,
      // collectionIcon (falling back to icon) — an ancestor crumb
      // represents the collection/domain, not a specific document, and
      // for Daily Notes that's a different icon than its sidebar tab uses.
      icon: presentation
        ? (presentation.collectionIcon ?? presentation.icon)
        : getPageIcon('folder'),
      emoji: presentation ? undefined : (folder.metadata.icon ?? undefined),
      onClick: () => onOpenFolder(folder.id),
    });

    current = folder.parentId;
  }

  return ancestors;
}

export function buildBreadcrumbs(
  entry: Page | Folder,
  vault: Vault,
  membershipSelector: MembershipSelector,
  onOpenFolder: (folderId: string) => void
): Breadcrumb[] {
  // Root-level entries have no breadcrumb trail. Breadcrumbs exist to
  // communicate hierarchy, not identity — at the vault root there is no
  // hierarchy to show, and the page header already displays the entry's
  // name, so a root crumb would only restate it. Reads directly off the
  // domain model (parentId), not off the ancestor walk's result, so the
  // policy can't silently drift if the traversal implementation ever
  // changes.
  if (entry.parentId === null) {
    return [];
  }

  const ancestors = ancestorBreadcrumbs(entry.parentId, vault, membershipSelector, onOpenFolder);

  ancestors.push({
    id: entry.id,
    title: entryBreadcrumbTitle(entry),
    icon: getEntryIcon(entry),
    emoji: entry.metadata.icon ?? undefined,
  });

  return ancestors;
}

/**
 * Breadcrumbs for an unpersisted draft (ADR-017) — same ancestor-folder
 * walk as a real page, since a draft's folderId is already known before
 * it exists in the Vault; the trailing crumb has no metadata icon yet
 * (nothing has been persisted to hold one) and no onClick (nothing to
 * navigate to that isn't already the active page).
 */
export function buildBreadcrumbsForDraft(
  draftId: string,
  folderId: string | null,
  title: string,
  type: PageType,
  vault: Vault,
  membershipSelector: MembershipSelector,
  onOpenFolder: (folderId: string) => void
): Breadcrumb[] {
  // Root-level entries have no breadcrumb trail — same policy as
  // buildBreadcrumbs. A draft with no folder is a root entry.
  if (folderId === null) {
    return [];
  }

  const ancestors = ancestorBreadcrumbs(folderId, vault, membershipSelector, onOpenFolder);

  ancestors.push({
    id: draftId,
    title,
    // A Daily Note draft's title is always its date (never user-chosen —
    // ADR-017 §5), so it doubles as the isToday input here, same as a
    // persisted daily-note's `name` does in getEntryIcon above.
    icon: getPageIcon(type, type === 'daily-note' && isToday(title)),
  });

  return ancestors;
}
