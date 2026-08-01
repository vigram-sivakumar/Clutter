import { Vault } from '../../vault/models/Vault';

export interface ResolvedCreatePath {
  readonly path: string;
  readonly parentId: string | null;
}

/**
 * Computes a collision-free destination path for a newly created note.
 *
 * Pure with respect to the filesystem — it only reads the Vault's current
 * page/folder state, never touches disk. PageOperations.create() is the
 * only intended caller.
 */
export class PagePathResolver {
  constructor(private readonly vault: Vault) {}

  resolveCreatePath(folderId: string | null, title: string): ResolvedCreatePath {
    const folderPath = this.resolveFolderPath(folderId);
    const baseName = title.trim() || 'Untitled';

    let candidateName = baseName;
    let suffix = 1;

    while (this.vault.getPageByPath(`${folderPath}/${candidateName}.md`)) {
      suffix += 1;
      candidateName = `${baseName} ${suffix}`;
    }

    return {
      path: `${folderPath}/${candidateName}.md`,
      parentId: folderId,
    };
  }

  private resolveFolderPath(folderId: string | null): string {
    if (folderId === null) {
      return this.vault.root;
    }

    const folder = this.vault.getFolder(folderId);

    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    return folder.path;
  }
}
