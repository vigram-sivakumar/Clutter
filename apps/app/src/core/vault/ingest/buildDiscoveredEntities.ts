import type { Folder, Page } from '../models';
import type { IdGenerator } from '../../shared/identity/IdGenerator';
import type { ScannedDirectory, ScannedPage, VaultScanResult } from './VaultScanResult';
import { FolderBuilder } from './FolderBuilder';
import { PageBuilder } from './PageBuilder';
import { IdentityResolver } from './identity/IdentityResolver';
import { resolveDuplicateId } from './identity/resolveDuplicateId';

export interface DiscoveredEntities {
  readonly folders: readonly Folder[];
  readonly pages: readonly Page[];
  /**
   * Paths whose frontmatter `id` collided with an id already claimed by a
   * different path — a genuine duplicate (see resolveDuplicateId) — and
   * were built with a freshly generated id instead. The caller is
   * responsible for repairing the persisted frontmatter to match (mirrors
   * archive-metadata repair, spec §4); this function never writes to disk.
   */
  readonly reassignedPagePaths: ReadonlySet<string>;
  /** Same as reassignedPagePaths, for folders (their `.folder.md`). */
  readonly reassignedFolderPaths: ReadonlySet<string>;
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
  /** Used to mint a fresh id when a genuine duplicate id is discovered. */
  readonly idGenerator: IdGenerator;
  /**
   * Ids already claimed outside this scan's own batch — the live Vault's
   * current folder/page ids, for the incremental-sync caller. Omitted (or
   * empty) for a full vault scan, where nothing is claimed yet and
   * duplicates can only occur within the batch itself.
   */
  readonly existingFolderIds?: ReadonlySet<string>;
  readonly existingPageIds?: ReadonlySet<string>;
}

/**
 * Builds every Folder/Page discovered by a VaultScanner.scan() result,
 * resolving parentId links from the scan's own directory tree and
 * reassigning a fresh id to any entry whose frontmatter id collides with
 * one already claimed (see resolveDuplicateId) — the original keeps its
 * id, the newcomer gets a new one, exactly as required for a genuinely
 * duplicated file/folder.
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
  const resolvedDirectoriesByPath = new Map<string, ScannedDirectory>();
  const claimedFolderIds = new Set<string>(options.existingFolderIds ?? []);
  const reassignedFolderPaths = new Set<string>();

  for (const directory of scanResult.directories) {
    const identity = identityResolver.resolveFolder(
      directory.frontmatter?.id,
      directory.path
    );
    const resolved = resolveDuplicateId(
      identity.id,
      (id) => claimedFolderIds.has(id),
      options.idGenerator
    );

    claimedFolderIds.add(resolved.id);
    folderIdsByPath.set(directory.path, resolved.id);

    resolvedDirectoriesByPath.set(
      directory.path,
      resolved.wasReassigned
        ? { ...directory, frontmatter: { ...directory.frontmatter, id: resolved.id } }
        : directory
    );

    // The scan root itself is never a navigable Folder when rootIsFolder is
    // false (VaultBuilder's vault-root convention) — nothing is ever built
    // or persisted for it, so a collision there (there won't be one in
    // practice; see resolveDuplicateId) isn't reported as reassigned.
    if (resolved.wasReassigned && (options.rootIsFolder || directory.path !== rootPath)) {
      reassignedFolderPaths.add(directory.path);
    }
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
        directory: resolvedDirectoriesByPath.get(directory.path)!,
        parentId: resolveParentId(directory.parentPath),
      })
    );

  const claimedPageIds = new Set<string>(options.existingPageIds ?? []);
  const reassignedPagePaths = new Set<string>();

  const pages: Page[] = scanResult.pages.map((page) => {
    const identity = identityResolver.resolvePage(page.frontmatter.id, page.path);
    const resolved = resolveDuplicateId(
      identity.id,
      (id) => claimedPageIds.has(id),
      options.idGenerator
    );

    claimedPageIds.add(resolved.id);

    const resolvedPage: ScannedPage = resolved.wasReassigned
      ? { ...page, frontmatter: { ...page.frontmatter, id: resolved.id } }
      : page;

    if (resolved.wasReassigned) {
      reassignedPagePaths.add(page.path);
    }

    return builders.pageBuilder.build({
      parentId: resolveParentId(page.directoryPath),
      page: resolvedPage,
    });
  });

  return { folders, pages, reassignedPagePaths, reassignedFolderPaths };
}
