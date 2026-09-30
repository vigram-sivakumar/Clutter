import type { SystemIcon } from '@shared/icon';
import type { Folder } from '@core/vault/models/Folder';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
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
  | 'tasks-overdue'
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
  | 'templates'
  | 'assets';

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
  /**
   * Icon to use when this location is presented as a breadcrumb ancestor /
   * collection context, if it differs from `icon` (the tab/shortcut icon
   * used everywhere else). Only Daily Notes needs this: its tab icon is
   * the calendar-with-date, matching what an individual Daily Note page
   * itself uses (getPageIcon), but as a breadcrumb ancestor it represents
   * the whole collection, not one specific day — a plain calendar
   * communicates that distinction (collection vs. document) the same way
   * every other reserved folder's ancestor icon already does implicitly
   * (their tab and ancestor icons happen to already be the same icon).
   * Falls back to `icon` when unset — most locations need no override.
   */
  readonly collectionIcon?: SystemIcon;
}

export const SYSTEM_LOCATION_PRESENTATION: Readonly<
  Record<SystemLocationId, SystemLocationPresentation>
> = {
  notes: { id: 'notes', label: 'Notes', icon: 'note' },
  'daily-notes': {
    id: 'daily-notes',
    label: 'Daily Notes',
    icon: 'calendarToday',
    collectionIcon: 'calendarDots',
  },
  tasks: { id: 'tasks', label: 'Tasks', icon: 'squareCheckOutline' },
  'tasks-today': {
    id: 'tasks-today',
    label: 'Today',
    icon: 'squareCheckOutline',
  },
  'tasks-overdue': {
    id: 'tasks-overdue',
    label: 'Overdue',
    icon: 'squareCheckOutline',
  },
  'tasks-upcoming': {
    id: 'tasks-upcoming',
    label: 'Upcoming',
    icon: 'squareCheckOutline',
  },
  'tasks-completed': {
    id: 'tasks-completed',
    label: 'Done',
    icon: 'tick',
  },
  'tasks-all': {
    id: 'tasks-all',
    label: 'All Tasks',
    icon: 'squareCheckOutline',
  },
  'tasks-unscheduled': {
    id: 'tasks-unscheduled',
    label: 'Unscheduled',
    icon: 'clock',
  },
  tags: { id: 'tags', label: 'Tags', icon: 'tag' },
  favorites: { id: 'favorites', label: 'Favorites', icon: 'favouriteOutline' },
  workspace: { id: 'workspace', label: 'Workspace', icon: 'folder' },
  search: { id: 'search', label: 'Search', icon: 'magnifyingGlass' },
  archive: { id: 'archive', label: 'Archive', icon: 'archive' },
  inbox: { id: 'inbox', label: 'Inbox', icon: 'tray' },
  templates: { id: 'templates', label: 'Templates', icon: 'template' },
  assets: { id: 'assets', label: 'Assets', icon: 'layers' },
};

/**
 * FEATURE FLAG — the reserved/system-location icon in the Page/collection
 * header is implemented but not yet ready to expose; flip to `true` to
 * enable it. This is the single place the flag is read: every caller asks
 * `getSystemLocationPresentation(id, 'page-header')` and gets the correct
 * answer for whichever location it has, folder-backed or not, rather than
 * each call site re-deciding whether to honor the flag. Remove this flag
 * (and the `SHOW_RESERVED_FOLDER_ICON ? ... : undefined` branch below)
 * once ready to ship.
 */
const SHOW_RESERVED_FOLDER_ICON = false;

/**
 * The subset of a system location's presentation appropriate for the
 * Page/collection header surface — label always, icon only when the
 * header is allowed to show one. Kept separate from
 * `SystemLocationPresentation` (rather than reusing it with an optional
 * `icon`) so every other caller of `getSystemLocationPresentation` keeps
 * its existing, always-present `icon` untouched.
 */
export interface PageHeaderLocationPresentation {
  readonly label: string;
  readonly icon?: SystemIcon;
}

export type SystemLocationSurface = 'page-header';

/**
 * What a location fundamentally is (id/label/icon/collectionIcon) is a
 * separate question from whether a given UI surface is allowed to expose
 * that icon right now — this function answers the first question by
 * default, called with no `surface` argument, exactly as every existing
 * caller (sidebar tabs, shortcuts, breadcrumb ancestors, the Archive
 * footer button) already does and keeps doing.
 *
 * Passing `surface: 'page-header'` answers the second question instead:
 * it returns the label plus whichever icon (a folder-backed location's
 * `collectionIcon`, falling back to `icon`, exactly like a breadcrumb
 * ancestor already prefers) the Page/collection header may show for this
 * location — or no icon at all while `SHOW_RESERVED_FOLDER_ICON` is
 * `false`. This is the one place that decision is made; a `PageHost`
 * branch never re-derives it or checks the flag itself, so no branch can
 * accidentally bypass it, and it applies identically to a folder-backed
 * reserved location (Archive, Inbox, Templates, Daily Notes) and a
 * non-folder one (Today, Tags, Workspace, ...) alike.
 */
export function getSystemLocationPresentation(
  id: SystemLocationId
): SystemLocationPresentation;
export function getSystemLocationPresentation(
  id: SystemLocationId,
  surface: SystemLocationSurface
): PageHeaderLocationPresentation;
export function getSystemLocationPresentation(
  id: SystemLocationId,
  surface?: SystemLocationSurface
): SystemLocationPresentation | PageHeaderLocationPresentation {
  const presentation = SYSTEM_LOCATION_PRESENTATION[id];

  if (surface !== 'page-header') {
    return presentation;
  }

  return {
    label: presentation.label,
    icon: SHOW_RESERVED_FOLDER_ICON
      ? (presentation.collectionIcon ?? presentation.icon)
      : undefined,
  };
}

/**
 * Which SystemLocationId (if any) a Folder represents — the single place
 * every consumer that has a Folder in hand (breadcrumb ancestors, the
 * page header for a directly-viewed folder, and any future one) resolves
 * this, rather than each re-deriving "is this Archive/Inbox/Templates/
 * Daily Notes" itself. Reuses MembershipSelector.isSystemFolder() (ADR-023)
 * for the "is this actually reserved, not just named the same thing"
 * check (path/parentId-aware) instead of reimplementing it or calling
 * Vault.isReservedFolder() directly — MembershipSelector is the single
 * owning classification layer every system-folder question routes
 * through — and reservedFolderIdForName() for the name→id lookup.
 * 'clutter' is reserved but never a presented location — excluded the
 * same way an unreserved folder is.
 */
export function getSystemLocationForFolder(
  folder: Folder,
  membershipSelector: MembershipSelector
): SystemLocationId | undefined {
  if (!membershipSelector.isSystemFolder(folder)) {
    return undefined;
  }

  const id = reservedFolderIdForName(folder.name);

  return id && id !== 'clutter' ? id : undefined;
}
