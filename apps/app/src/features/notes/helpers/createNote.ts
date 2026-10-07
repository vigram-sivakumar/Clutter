import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { PageOperations } from '@core/application/page/PageOperations';

/**
 * The one "New note" action: the Notes sidebar's New row and the sidebar
 * top controls' `+` / New note menu item all call this.
 *
 * Always targets Inbox — never the active folder/collection or the vault
 * root. required → ensure → use, same as NavigationRouter.openReservedFolder:
 * ensureReservedFolder() is the one Inbox resolver (idempotent; recreates it
 * if deleted externally). ADR-017: opens an unpersisted draft, not an
 * immediate Gate write — openDraft() already opens the session/workspace
 * itself, unlike create(), so no composed .open() call is needed here.
 */
export async function createNoteInInbox(
  folderOperations: FolderOperations,
  pageOperations: PageOperations
): Promise<void> {
  const inbox = await folderOperations.ensureReservedFolder('inbox');
  await pageOperations.openDraft({ folderId: inbox.id });
}
