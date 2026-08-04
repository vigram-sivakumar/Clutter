import type { SystemIcon } from '@shared/icon';
import type { Folder } from '@core/vault/models/Folder';
import type { Vault } from '@core/vault/models/Vault';
import { reservedFolderIdForName } from '@core/vault/initialize/ReservedResources';

/**
 * Stable identifiers for every system location the sidebar/navigation
 * exposes — the ones backed by a reserved Vault folder (archive, inbox,
 * templates, daily-notes) share their id string with `ReservedFolderId`
 * (ReservedResources.ts) rather than a separately-maintained translation
 * table; the rest (notes, tasks, tags, favorites, search) have no backing
 * folder at all. 'clutter' (ReservedFolderId's fifth member) is
 * deliberately excluded — internal application infrastructure, never a
 * presented location.
 */
export type SystemLocationId =
  | 'notes'
  | 'daily-notes'
  | 'tasks'
  | 'tasks-today'
  | 'tasks-upcoming'
  | 'tasks-completed'
  | 'tasks-all'
  | 'tasks-unscheduled'
  | 'tags'
  | 'favorites'
  | 'workspace'
  | 'search'
  | 'archive'
  | 'inbox'
  | 'templates';

/**
 * A system location's presentation — label and icon only. This is the
 * single source every current surface (sidebar tabs, the Archive footer
 * button, Inbox/Templates shortcuts, the Favorites section header,
 * breadcrumb ancestors for pages inside a reserved folder, the page
 * header when a reserved folder is the active folder) reads from, and
 * the one place a future surface (search, command palette, quick
 * switcher, recent items) should read from too, instead of re-deciding
 * its own icon/label.
 *
 * Deliberately minimal: no description/empty-state field yet — add one
 * only once a real consumer needs it (a data source with no reader is
 * exactly the kind of speculative machinery this codebase avoids
 * elsewhere).
 */
export interface SystemLocationPresentation {
  readonly id: SystemLocationId;
  readonly label: string;
  readonly icon: SystemIcon;
}

export const SYSTEM_LOCATION_PRESENTATION: Readonly<
  Record<SystemLocationId, SystemLocationPresentation>
> = {
  notes: { id: 'notes', label: 'Notes', icon: 'squiggleLine' },
  'daily-notes': { id: 'daily-notes', label: 'Daily Notes', icon: 'calendarToday' },
  tasks: { id: 'tasks', label: 'Tasks', icon: 'squareCheckOutline' },
  'tasks-today': { id: 'tasks-today', label: 'Today', icon: 'squareCheckOutline' },
  'tasks-upcoming': {
    id: 'tasks-upcoming',
    label: 'Upcoming',
    icon: 'squareCheckOutline',
  },
  'tasks-completed': {
    id: 'tasks-completed',
    label: 'Completed',
    icon: 'squareCheckOutline',
  },
  'tasks-all': { id: 'tasks-all', label: 'All Tasks', icon: 'squareCheckOutline' },
  'tasks-unscheduled': {
    id: 'tasks-unscheduled',
    label: 'Unscheduled',
    icon: 'squareCheckOutline',
  },
  tags: { id: 'tags', label: 'Tags', icon: 'tag' },
  favorites: { id: 'favorites', label: 'Favorites', icon: 'favouriteOutline' },
  workspace: { id: 'workspace', label: 'Workspace', icon: 'folder' },
  search: { id: 'search', label: 'Search', icon: 'magnifyingGlass' },
  archive: { id: 'archive', label: 'Archive', icon: 'archive' },
  inbox: { id: 'inbox', label: 'Inbox', icon: 'tray' },
  templates: { id: 'templates', label: 'Templates', icon: 'template' },
};

export function getSystemLocationPresentation(
  id: SystemLocationId
): SystemLocationPresentation {
  return SYSTEM_LOCATION_PRESENTATION[id];
}

/**
 * Which SystemLocationId (if any) a Folder represents — the single place
 * every consumer that has a Folder in hand (breadcrumb ancestors, the
 * page header for a directly-viewed folder, and any future one) resolves
 * this, rather than each re-deriving "is this Archive/Inbox/Templates/
 * Daily Notes" itself. Reuses Vault.isReservedFolder() for the "is this
 * actually reserved, not just named the same thing" check (path/parentId
 * -aware) instead of reimplementing it, and reservedFolderIdForName() for
 * the name→id lookup. 'clutter' is reserved but never a presented
 * location — excluded the same way an unreserved folder is.
 */
export function getSystemLocationForFolder(
  folder: Folder,
  vault: Vault
): SystemLocationId | undefined {
  if (!vault.isReservedFolder(folder)) {
    return undefined;
  }

  const id = reservedFolderIdForName(folder.name);

  return id && id !== 'clutter' ? id : undefined;
}
