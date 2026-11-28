import type { FolderOperations } from '@core/application/folder/FolderOperations';

/**
 * Whether a folder may be named this. Not allowed: "/" and ":" (macOS: path separator; Finder shows ":" as
 * "/"), the Windows-reserved \ * ? " < > |, the NUL character, and a leading "." (a hidden folder — which
 * also rules out "." and ".."). Checked before resolving or creating the destination.
 */
function isAllowedFolderName(name: string): boolean {
  return !/[/:\\*?"<>|\0]/.test(name) && !name.startsWith('.');
}

const DISALLOWED_FOLDER_NAME_MESSAGE =
  'A folder name can’t contain / : \\ * ? " < > | or start with a period';

/**
 * The New folder dialog's entry point (sidebar and collection views alike): create, then open
 * the result — the same create-then-open shape duplicateAndOpenPage.ts
 * uses for Duplicate. FolderOperations.create() only persists the new
 * folder and returns its id (there is no folder draft lifecycle, unlike
 * PageOperations — see FolderOperations' own doc comment); navigating to
 * it is this entry point's decision, not the operation's. The optional icon and description are
 * written between create and open, so the folder opens already carrying them.
 */
export async function createAndOpenFolder(
  folderOperations: FolderOperations,
  name: string,
  parent: string | null | (() => string | null | Promise<string | null>),
  metadata: { readonly icon?: string; readonly description?: string } = {}
): Promise<void> {
  if (!isAllowedFolderName(name)) {
    throw new Error(DISALLOWED_FOLDER_NAME_MESSAGE);
  }
  const parentId = typeof parent === 'function' ? await parent() : parent;
  const { icon, description } = metadata;
  const id = await folderOperations.create(name, parentId);

  if (icon !== undefined || description !== undefined) {
    await folderOperations.updateMetadata(id, {
      ...(icon !== undefined ? { icon } : {}),
      ...(description !== undefined ? { description } : {}),
    });
  }

  await folderOperations.open(id);
}
