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

/** What a "Delete all" did: how many top-level items it tried, how many could not be deleted, and the first error. */
export interface DeleteAllArchivedResult {
  readonly total: number;
  readonly failed: number;
  readonly firstError?: unknown;
}

/**
 * The user-facing message for a "Delete all" that did not finish, or `null` when everything was deleted.
 * A partial failure says how many were left, not that the whole operation failed.
 */
export function deleteAllFailureMessage({ total, failed }: DeleteAllArchivedResult): string | null {
  if (failed === 0) {
    return null;
  }

  if (failed === total) {
    return total === 1 ? 'Couldn’t delete this item' : 'Couldn’t delete these items';
  }

  return `Couldn’t delete ${failed} of ${total} items`;
}

/**
 * The Archive page's "Delete all": permanently deletes every archived file, note and folder, each
 * through its aggregate's own delete (so each runs the Persistence Gate's delete operation — no
 * second write path). Files go first: a folder's delete takes its contents with it, so deleting
 * files afterwards would find them already gone. Every item is attempted even if one fails; the
 * result says how many failed (and the first error), so the caller can report a partial failure
 * honestly. An empty Archive is a no-op.
 */
export async function deleteAllArchived(
  deps: DeleteAllArchivedDeps,
  archiveFolderId: string
): Promise<DeleteAllArchivedResult> {
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

  let failed = 0;
  let firstError: unknown;

  for (const run of deletions) {
    try {
      await run();
    } catch (error) {
      if (failed === 0) {
        firstError = error;
      }
      failed += 1;
    }
  }

  return failed === 0
    ? { total: deletions.length, failed }
    : { total: deletions.length, failed, firstError };
}
