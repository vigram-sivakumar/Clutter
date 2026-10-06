/**
 * Menu-item labels for the archive/delete actions on a resource (Note,
 * Daily Note, Folder) — the single source every sidebar/topbar menu config
 * reads from, so renaming either action is a one-line change here instead
 * of a hunt across each config file. The user-facing name for the Archive is "Trash". Does not cover the Trash page's own
 * title (SystemLocationPresentation in systemPresentation.ts) or the
 * archive/delete confirmation dialogs (ResourceTopBarActions.tsx,
 * Sidebar.Notes.tsx) — those are separate surfaces with their own wording.
 */
export const ARCHIVE_ACTION_LABEL = 'Move to Trash';
export const DELETE_ACTION_LABEL = 'Delete permanently';
export const FAVORITE_ACTION_LABEL = 'Add to Favorites';
export const UNFAVORITE_ACTION_LABEL = 'Remove from Favorites';
