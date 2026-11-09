import type { VaultFileSystem } from '../providers/VaultFileSystem';
import type { ResourceArchiveMetadataStore } from '../persistence/ResourceArchiveMetadataStore';
import { confirmFileMissing } from './confirmFileMissing';

/**
 * The startup counterpart of the archive-metadata repairs: drops the `.clutter/resource-archive.json` records of
 * archived files that were deleted or moved away outside the app while it was closed. A record goes only when its
 * file is POSITIVELY confirmed missing (see `confirmFileMissing`); any doubt keeps it. Files are never touched, and
 * the rewrite goes through the store's own queue and atomic write. Best effort: a corrupt or unreadable record file
 * is left exactly as it is and boot carries on.
 */
export async function reconcileResourceArchiveRecords(
  store: ResourceArchiveMetadataStore,
  fileSystem: VaultFileSystem
): Promise<readonly string[]> {
  try {
    const listings = new Map<string, Promise<ReadonlySet<string> | null>>();

    return await store.removeRecordsOfMissingFiles((archivedPath) =>
      confirmFileMissing(fileSystem, archivedPath, listings)
    );
  } catch (error) {
    console.warn('Archive metadata: could not reconcile resource records; leaving them as they are', error);
    return [];
  }
}
