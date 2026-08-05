import type { Page } from '../models/Page';
import type { PageMetadata } from '../models/PageMetadata';
import { VaultPath } from '../ingest/VaultPath';
import { reservedFolderRelativePath } from '../initialize/ReservedResources';

/**
 * Metadata fields cleared when stale archive state is repaired after an
 * external change moved a page out of Archive/ without updating frontmatter.
 */
export type ArchiveMetadataCorrection = Pick<
  PageMetadata,
  'status' | 'archivedAt' | 'originalPath' | 'originalParentId'
>;

export function isInsideArchiveFolder(
  absolutePath: string,
  vaultRoot: string
): boolean {
  // ReservedResources.ts is the one source of the "Archive" name — no
  // hardcoded path literal here (see MoveService.resolveArchiveDestination
  // for the same fix against the same duplicated literal, found by
  // ADR-023's audit). This function only has a vaultRoot string, not a
  // Vault instance, so it can't call Vault.getReservedFolder() directly —
  // reservedFolderRelativePath() is the string-only equivalent.
  return VaultPath.isDescendantOf(
    absolutePath,
    `${vaultRoot}/${reservedFolderRelativePath('archive')}`
  );
}

/**
 * Repairs stale archive metadata after external filesystem changes.
 *
 * Lifecycle state lives in frontmatter; Archive/ is a storage convention.
 * Folder location alone never implies archived status, and entering Archive/
 * externally never auto-archives. The only automatic repair clears archive
 * metadata when a page with status archived lives outside Archive/.
 */
export function evaluateArchiveMetadataRepair(
  page: Page,
  vaultRoot: string
): ArchiveMetadataCorrection | null {
  const outsideArchive = !isInsideArchiveFolder(page.path, vaultRoot);
  const hasStaleArchiveMetadata = page.metadata.status === 'archived';

  if (outsideArchive && hasStaleArchiveMetadata) {
    return {
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    };
  }

  return null;
}

export function applyArchiveMetadataCorrection(
  page: Page,
  correction: ArchiveMetadataCorrection
): Page {
  return {
    ...page,
    metadata: {
      ...page.metadata,
      ...correction,
    },
  };
}
