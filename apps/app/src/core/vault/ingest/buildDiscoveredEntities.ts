import type { Folder, Page } from '../models';
import type { VaultScanResult } from './VaultScanResult';
import { FolderBuilder } from './FolderBuilder';
import { PageBuilder } from './PageBuilder';
import { IdentityResolver } from './identity/IdentityResolver';

export interface DiscoveredEntities {
  readonly folders: readonly Folder[];
  readonly pages: readonly Page[];
}

export interface DiscoveredEntitiesOptions {
  /**
   * Whether `scanResult.rootPath` is itself a navigable Folder to build and
   * include in the result. false for a full vault scan (the vault root is
   * never a Folder — VaultBuilder's original convention). true when
   * scanning a subtree rooted at an already-known directory that needs its
   * own Folder entity built alongside its descendants (e.g. a directory
   * Sync just discovered on disk).
   */
  readonly rootIsFolder: boolean;
  /**
   * parentId for `scanResult.rootPath`'s own Folder entity when
   * rootIsFolder is true, and for every entry whose parent is the scanned
   * root when rootIsFolder is false (mirrors the "root has no navigable
   * Folder" convention: its children's parentId is this value directly,
   * never looked up from a Folder that doesn't exist).
   */
  readonly rootParentId: string | null;
}

/**
 * Builds every Folder/Page discovered by a VaultScanner.scan() result,
 * resolving parentId links from the scan's own directory tree.
 *
 * The one implementation both VaultBuilder (initial scan, scoped to the
 * whole vault) and VaultSyncService (incremental scan, scoped to a subtree
 * just discovered on disk) build entities from — per
 * docs/architecture-specification.md §2's identity-resolution determinism
 * invariant, scan and sync must not maintain two different interpretations
 * of the same filesystem shape.
 */
export function buildDiscoveredEntities(
  scanResult: VaultScanResult,
  options: DiscoveredEntitiesOptions,
  builders: { readonly folderBuilder: FolderBuilder; readonly pageBuilder: PageBuilder }
): DiscoveredEntities {
  const identityResolver = new IdentityResolver();
  const { rootPath } = scanResult;
  const folderIdsByPath = new Map<string, string>();

  for (const directory of scanResult.directories) {
    const identity = identityResolver.resolveFolder(
      directory.frontmatter?.id,
      directory.path
    );

    folderIdsByPath.set(directory.path, identity.id);
  }

  const resolveParentId = (parentPath: string | null): string | null => {
    if (parentPath === null) {
      return options.rootParentId;
    }

    if (!options.rootIsFolder && parentPath === rootPath) {
      return options.rootParentId;
    }

    const parentId = folderIdsByPath.get(parentPath);

    if (!parentId) {
      throw new Error(`Missing parent folder "${parentPath}".`);
    }

    return parentId;
  };

  const folders: Folder[] = scanResult.directories
    .filter((directory) => options.rootIsFolder || directory.path !== rootPath)
    .map((directory) =>
      builders.folderBuilder.build({
        directory,
        parentId: resolveParentId(directory.parentPath),
      })
    );

  const pages: Page[] = scanResult.pages.map((page) =>
    builders.pageBuilder.build({
      parentId: resolveParentId(page.directoryPath),
      page,
    })
  );

  return { folders, pages };
}
