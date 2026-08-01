import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { PageOperations } from '@core/application/page/PageOperations';

import type { NotesShortcutId } from './notesShortcuts.config';

export function buildNotesShortcutHandler(
  navigation: NavigationRouter,
  pageOperations: PageOperations
): (id: NotesShortcutId) => void {
  return (id) => {
    switch (id) {
      case 'new-note':
        void pageOperations
          .create({ folderId: null })
          .then((newPageId) => pageOperations.open(newPageId));
        break;
      case 'all-notes':
        navigation.openAllNotes();
        break;
      case 'inbox':
        navigation.openInbox();
        break;
      case 'templates':
        navigation.openTemplates();
        break;
      default: {
        const _exhaustive: never = id;
        throw new Error(`Unknown notes shortcut: ${_exhaustive}`);
      }
    }
  };
}
