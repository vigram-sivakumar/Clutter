import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { PageOperations } from '@core/application/page/PageOperations';

import { createNote } from '../helpers/createNote';
import type { NotesShortcutId } from './notesShortcuts.config';

export function buildNotesShortcutHandler(
  navigation: NavigationRouter,
  pageOperations: PageOperations,
  folderOperations: FolderOperations,
  /** The Space's default note folder (Settings → Notes), or undefined for Inbox. */
  getDefaultNoteFolderId: () => string | undefined = () => undefined
): (id: NotesShortcutId) => void {
  return (id) => {
    switch (id) {
      case 'new-note':
        // The default note location, Inbox unless chosen otherwise — see createNote.
        void createNote(folderOperations, pageOperations, getDefaultNoteFolderId()).catch(() => {});
        break;
      case 'inbox':
        navigation.openInbox();
        break;
      case 'templates':
        navigation.openTemplates();
        break;
      case 'assets':
        navigation.openAssets();
        break;
      default: {
        const _exhaustive: never = id;
        throw new Error(`Unknown notes shortcut: ${_exhaustive}`);
      }
    }
  };
}
