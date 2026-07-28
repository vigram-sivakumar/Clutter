import { Vault } from '../../vault/models/Vault';
import { Workspace } from '../../workspace/Workspace';

/**
 * FolderApplicationService coordinates folder-related application operations.
 * It opens folders and validates folders before updating workspace state.
 * This service does not edit or persist folder content.
 */
export class FolderApplicationService {
  private readonly workspace: Workspace;
  private readonly vault: Vault;

  constructor(workspace: Workspace, vault: Vault) {
    this.workspace = workspace;
    this.vault = vault;
  }

  public openFolder(folderId: string): void {
    const folder = this.vault.getFolder(folderId);
    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`);
    }
    this.workspace.openFolder(folderId);
  }
}
