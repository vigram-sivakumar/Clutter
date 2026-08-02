import type { Folder } from '../models';
import type { ScannedDirectory } from './VaultScanResult';
import { IdentityResolver } from './identity/IdentityResolver';
import { VaultPath } from './VaultPath';

export interface BuildFolderInput {
  readonly parentId: string | null;
  readonly directory: ScannedDirectory;
}

/**
 * Pure transformation: a scanned directory (plus its already-resolved
 * parentId) -> a domain Folder, applying the same frontmatter defaults.
 *
 * Mirrors PageBuilder: shared by VaultBuilder's startup scan and
 * PagePersistenceCoordinator's folder-create dispatch, so the defaulting
 * rules for a folder's metadata live in exactly one place.
 */
export class FolderBuilder {
  private readonly identityResolver = new IdentityResolver();

  build(input: BuildFolderInput): Folder {
    const { directory, parentId } = input;
    const frontmatter = directory.frontmatter;

    const identity = this.identityResolver.resolveFolder(
      frontmatter?.id,
      directory.path
    );

    return {
      id: identity.id,
      name: VaultPath.filename(directory.path),
      path: directory.path,
      parentId,

      metadata: {
        icon: frontmatter?.icon ?? null,
        favorite: frontmatter?.favorite ?? false,
        description: frontmatter?.description ?? '',
        cover: frontmatter?.cover ?? null,
        status: frontmatter?.status ?? 'active',
        archivedAt: frontmatter?.archivedAt ?? null,
        originalPath: frontmatter?.originalPath ?? null,
        originalParentId: frontmatter?.originalParentId ?? null,
      },
    };
  }
}
