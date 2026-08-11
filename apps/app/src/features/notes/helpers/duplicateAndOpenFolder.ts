import type { FolderOperations } from '@core/application/folder/FolderOperations';

/**
 * The topbar's Duplicate entry point for a folder — the folder-scoped
 * counterpart to duplicateAndOpenPage(). See that file's doc comment for
 * why this navigation decision lives here and not in
 * FolderOperations.duplicate() itself.
 */
export async function duplicateAndOpenFolder(
  folderOperations: FolderOperations,
  folderId: string
): Promise<void> {
  const newFolderId = await folderOperations.duplicate(folderId);
  await folderOperations.open(newFolderId);
}
