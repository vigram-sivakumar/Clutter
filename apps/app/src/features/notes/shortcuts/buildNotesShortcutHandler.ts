import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { PageOperations } from '@core/application/page/PageOperations';

import type { NotesShortcutId } from './notesShortcuts.config';

export function buildNotesShortcutHandler(
  navigation: NavigationRouter,
  pageOperations: PageOperations,
  folderOperations: FolderOperations
): (id: NotesShortcutId) => void {
  return (id) => {
    switch (id) {
      case 'new-note':
        // Always targets Inbox — never the active folder/collection or the
        // vault root. required → ensure → use, same as
        // NavigationRouter.openReservedFolder: ensureReservedFolder() is the
        // one Inbox resolver (idempotent; recreates it if deleted externally).
        // ADR-017: opens an unpersisted draft, not an immediate Gate
        // write — openDraft() already opens the session/workspace itself,
        // unlike create(), so no composed .open() call is needed here.
        void folderOperations
          .ensureReservedFolder('inbox')
          .then((inbox) => pageOperations.openDraft({ folderId: inbox.id }))
          .catch(() => {});
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
