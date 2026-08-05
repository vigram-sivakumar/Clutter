import { Vault } from '../../vault/models/Vault';
import { resolveCollisionFreeName } from '../../shared/naming/resolveCollisionFreeName';
import { resolveFolderPathOrRoot } from './resolveFolderPathOrRoot';

export interface ResolvedCreateFolderPath {
  readonly path: string;
  readonly parentId: string | null;
}

export interface ResolvedRenamePath {
  readonly path: string;
  readonly parentId: string | null;
}

/**
 * Computes a collision-free destination path for a newly created folder.
 *
 * Pure with respect to the filesystem — it only reads the Vault's current
 * folder state, never touches disk. Mirrors PagePathResolver exactly, one
 * aggregate over.
 */
export class FolderPathResolver {
  constructor(private readonly vault: Vault) {}

  createFolderPath(parentId: string | null, name: string): ResolvedCreateFolderPath {
    const parentPath = resolveFolderPathOrRoot(this.vault, parentId);
    const baseName = name.trim() || 'Untitled Folder';

    const candidateName = resolveCollisionFreeName(
      baseName,
      (name) => this.vault.getFolderByPath(`${parentPath}/${name}`) !== undefined
    );

    return {
      path: `${parentPath}/${candidateName}`,
      parentId,
    };
  }

  /**
   * Computes a collision-free destination path for renaming an existing
   * folder in place (ADR-024's interim 'rename-folder' kind — same parent
   * only, never reparents). The folder's own current path is excluded from
   * the collision check, so renaming to the same name (a no-op) resolves
   * to the folder's existing path rather than appending " 2" against
   * itself.
   */
  resolveRenamePath(folderId: string, name: string): ResolvedRenamePath {
    const folder = this.vault.getFolder(folderId);

    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    const parentPath = resolveFolderPathOrRoot(this.vault, folder.parentId);
    const baseName = name.trim() || folder.name;

    const candidateName = resolveCollisionFreeName(baseName, (candidate) => {
      const occupant = this.vault.getFolderByPath(`${parentPath}/${candidate}`);
      return occupant !== undefined && occupant.id !== folderId;
    });

    return {
      path: `${parentPath}/${candidateName}`,
      parentId: folder.parentId,
    };
  }
}
