import type { PageMetadata } from '../models/PageMetadata';
import { VaultPath } from '../ingest/VaultPath';
import { reservedFolderRelativePath } from '../initialize/ReservedResources';

/**
 * Metadata fields cleared when stale archive state is repaired after an
 * external change moved a page (or, per ADR-026's Sync amendment, a
 * folder) out of Archive/ without updating frontmatter. FolderMetadata
 * carries the identical four fields with identical types (confirmed by
 * direct inspection, per ADR-026 §0/§2), so this one type already covers
 * both aggregates — no folder-specific twin.
 */
export type ArchiveMetadataCorrection = Pick<
  PageMetadata,
  'status' | 'archivedAt' | 'originalPath' | 'originalParentId'
>;

/**
 * The minimal shape evaluateArchiveMetadataRepair/applyArchiveMetadataCorrection
 * actually need — both `Page` and `Folder` satisfy this structurally, so one
 * implementation serves both aggregates (ADR-026 §0's "fully shareable, not
 * just similarly-shaped" business logic, now realized for the Sync-repair
 * direction the same way it already was for the archive-write direction).
 */
export interface ArchivableEntity {
  readonly path: string;
  readonly metadata: {
    readonly status: 'active' | 'archived';
  };
}

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
 * Repairs stale archive metadata after external filesystem changes — for a
 * page or, per ADR-026's Sync amendment, a folder; the check only ever
 * reads `path`/`metadata.status`, identical for either aggregate.
 *
 * Lifecycle state lives in frontmatter; Archive/ is a storage convention.
 * Folder location alone never implies archived status, and entering Archive/
 * externally never auto-archives. The only automatic repair clears archive
 * metadata when an entity with status archived lives outside Archive/.
 */
export function evaluateArchiveMetadataRepair<T extends ArchivableEntity>(
  entity: T,
  vaultRoot: string
): ArchiveMetadataCorrection | null {
  const outsideArchive = !isInsideArchiveFolder(entity.path, vaultRoot);
  const hasStaleArchiveMetadata = entity.metadata.status === 'archived';

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

export function applyArchiveMetadataCorrection<T extends ArchivableEntity>(
  entity: T,
  correction: ArchiveMetadataCorrection
): T {
  return {
    ...entity,
    metadata: {
      ...entity.metadata,
      ...correction,
    },
  } as T;
}
