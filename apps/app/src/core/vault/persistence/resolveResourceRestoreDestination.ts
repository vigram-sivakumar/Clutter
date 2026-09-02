import type { Vault } from '../models/Vault';
import type { VaultResource } from '../models/VaultResource';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { VaultPath } from '../ingest/VaultPath';
import { ensureAssetsFolder } from './ensureAssetsFolder';
import type { ResourceArchiveMetadataStore } from './ResourceArchiveMetadataStore';

/**
 * Computes where an archived resource should return to on Restore —
 * the VaultResource counterpart to MoveService.resolveRestoreDestination/
 * FolderPathResolver.resolveRestoreDestination, but a standalone function
 * rather than a MoveService method: unlike every other resolver in this
 * file, restoring a resource needs to read `.clutter/resource-archive.json`
 * (async I/O against ResourceArchiveMetadataStore) and, on the fallback
 * path, ensure the Assets/ folder is registered in Vault (also async).
 * MoveService's constructor is shared by every Page/Folder call site in
 * the app (~70 at last count) — adding a ResourceArchiveMetadataStore
 * dependency there for this one resource-only resolver would force every
 * one of those unrelated call sites to change for a capability none of
 * them use. A standalone function, taking its collaborators as explicit
 * parameters, is the smaller, correctly-scoped alternative — the same
 * reasoning resolveFolderPathOrRoot already applies to a shared resolver
 * that doesn't need to be a class method.
 *
 * Resolution rules (per the approved Resource Restore design):
 * - Case A: an archive record exists for `resource`'s current (archived)
 *   path, and its `originalPath`'s parent folder still exists (or
 *   `originalPath` was directly under the vault root, which always
 *   "exists") -> restore to `originalPath`, unchanged. Mirrors Page/
 *   Folder's own root-is-always-valid treatment exactly (MoveService.
 *   resolveRestoreDestination's `parentDirectory === vault.root` branch) —
 *   a root-level resource is already a fully valid, already-modeled state
 *   (VaultQuery.getRootResources()/VaultResource.parentId: string | null),
 *   so there is no reason to divert this sub-case through Assets/.
 * - Case B: a record exists but that parent folder is gone -> fall back to
 *   Assets/, not the vault root (the one deliberate divergence from Page/
 *   Folder Restore, per the approved design).
 * - Case C: no record exists at all (e.g. the app restarted between
 *   Archive and Restore, or the record was otherwise lost) -> same Assets/
 *   fallback as Case B — this function does not distinguish "record
 *   missing" from "record's folder missing," since both resolve to the
 *   same destination.
 *
 * No collision-free renaming at the resolved destination — Restore never
 * auto-renames, for Page/Folder or here; `Vault.updateResourcePath`'s own
 * collision guard is what makes an occupied destination fail loudly,
 * exactly like MoveService.movePage's collision guard already does for a
 * page/folder restore.
 */
export async function resolveResourceRestoreDestination(
  resource: VaultResource,
  vault: Vault,
  fileSystem: VaultFileSystem,
  resourceArchiveStore: ResourceArchiveMetadataStore
): Promise<{ path: string; parentId: string | null }> {
  const entries = await resourceArchiveStore.read();
  const originalPath = entries.get(resource.path)?.originalPath;

  if (originalPath !== undefined) {
    const parentDirectory = VaultPath.parentDirectory(originalPath);

    if (parentDirectory === vault.root) {
      return { path: originalPath, parentId: null };
    }

    const originalFolder = vault.getFolderByPath(parentDirectory);

    if (originalFolder) {
      return { path: originalPath, parentId: originalFolder.id };
    }
  }

  const assetsFolder = await ensureAssetsFolder(vault, fileSystem);

  return {
    path: `${assetsFolder.path}/${VaultPath.filename(resource.path)}`,
    parentId: assetsFolder.id,
  };
}
