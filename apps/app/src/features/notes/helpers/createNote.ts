import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { PageOperations } from '@core/application/page/PageOperations';

/**
 * The one "New note" action: the Notes sidebar's New row and the sidebar
 * top controls' `+` / New note menu item all call this.
 *
 * Creates in the Space's default note location (Settings → Notes → Default
 * note location) — `defaultFolderId`, already checked by its owner to still be
 * a valid destination — and in Inbox when there is none, which is the default.
 * Never the active folder/collection or the vault root: a flow that has a
 * destination of its own (a folder's "+", a collection's New, a template, a
 * tag) does not come through here, so its destination always wins.
 *
 * Inbox: required → ensure → use, same as NavigationRouter.openReservedFolder:
 * ensureReservedFolder() is the one Inbox resolver (idempotent; recreates it
 * if deleted externally). ADR-017: opens an unpersisted draft, not an
 * immediate Gate write — openDraft() already opens the session/workspace
 * itself, unlike create(), so no composed .open() call is needed here.
 */
export async function createNote(
  folderOperations: FolderOperations,
  pageOperations: PageOperations,
  defaultFolderId?: string
): Promise<void> {
  const folderId = defaultFolderId ?? (await folderOperations.ensureReservedFolder('inbox')).id;
  await pageOperations.openDraft({ folderId });
}
