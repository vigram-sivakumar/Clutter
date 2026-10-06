import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { ResourceOperations } from '@core/application/resource/ResourceOperations';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';

export interface DeleteAllArchivedDeps {
  readonly membershipSelector: MembershipSelector;
  readonly folderOperations: FolderOperations;
  readonly pageOperations: PageOperations;
  readonly resourceOperations: ResourceOperations;
}

/** Whether the Archive holds anything the page would list. */
export function hasArchivedItems(
  { membershipSelector }: Pick<DeleteAllArchivedDeps, 'membershipSelector'>,
  archiveFolderId: string
): boolean {
  return (
    membershipSelector.getVisibleChildFolders(archiveFolderId).length > 0 ||
    membershipSelector.getVisibleChildPages(archiveFolderId).length > 0 ||
    membershipSelector.getArchivedResources().length > 0
  );
}

/**
 * The Archive page's "Delete all": permanently deletes every archived file, note and folder, each
 * through its aggregate's own delete (so each runs the Persistence Gate's delete operation — no
 * second write path). Files go first: a folder's delete takes its contents with it, so deleting
 * files afterwards would find them already gone. Every item is attempted even if one fails; the
 * first failure is rethrown at the end. An empty Archive is a no-op.
 */
export async function deleteAllArchived(
  deps: DeleteAllArchivedDeps,
  archiveFolderId: string
): Promise<void> {
  const { membershipSelector, folderOperations, pageOperations, resourceOperations } = deps;

  const deletions: Array<() => Promise<void>> = [
    ...membershipSelector
      .getArchivedResources()
      .map((resource) => () => resourceOperations.deleteResource(resource.id)),
    ...membershipSelector
      .getVisibleChildPages(archiveFolderId)
      .map((page) => () => pageOperations.delete(page.id)),
    ...membershipSelector
      .getVisibleChildFolders(archiveFolderId)
      .map((folder) => () => folderOperations.delete(folder.id)),
  ];

  let firstError: unknown;
  let failed = false;

  for (const run of deletions) {
    try {
      await run();
    } catch (error) {
      if (!failed) {
        failed = true;
        firstError = error;
      }
    }
  }

  if (failed) {
    throw firstError;
  }
}
