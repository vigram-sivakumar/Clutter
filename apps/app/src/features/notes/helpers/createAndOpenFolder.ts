import type { FolderOperations } from '@core/application/folder/FolderOperations';

/**
 * The folders-grid "Create folder" card's entry point: create, then open
 * the result — the same create-then-open shape duplicateAndOpenPage.ts
 * uses for Duplicate. FolderOperations.create() only persists the new
 * folder and returns its id (there is no folder draft lifecycle, unlike
 * PageOperations — see FolderOperations' own doc comment); navigating to
 * it is this entry point's decision, not the operation's.
 */
export async function createAndOpenFolder(
  folderOperations: FolderOperations,
  name: string,
  parentId: string | null
): Promise<void> {
  const id = await folderOperations.create(name, parentId);
  await folderOperations.open(id);
}
