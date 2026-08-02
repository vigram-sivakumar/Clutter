import { Vault } from '../../vault/models/Vault';

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
    const parentPath = this.resolveParentPath(parentId);
    const baseName = name.trim() || 'Untitled Folder';

    let candidateName = baseName;
    let suffix = 1;

    while (this.vault.getFolderByPath(`${parentPath}/${candidateName}`)) {
      suffix += 1;
      candidateName = `${baseName} ${suffix}`;
    }

    return {
      path: `${parentPath}/${candidateName}`,
      parentId,
    };
  }

  private resolveParentPath(parentId: string | null): string {
    if (parentId === null) {
      return this.vault.root;
    }

    const folder = this.vault.getFolder(parentId);

    if (!folder) {
      throw new Error(`Folder not found: ${parentId}`);
    }

    return folder.path;
  }
}
