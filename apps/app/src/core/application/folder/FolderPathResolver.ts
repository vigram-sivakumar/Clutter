import { Vault } from '../../vault/models/Vault';
import { resolveCollisionFreeName } from '../../shared/naming/resolveCollisionFreeName';
import { resolveFolderPathOrRoot } from '../resolveFolderPathOrRoot';

export interface ResolvedCreateFolderPath {
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
}
