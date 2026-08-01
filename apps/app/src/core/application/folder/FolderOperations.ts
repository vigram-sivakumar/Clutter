import { Vault } from '../../vault/models/Vault';
import { Workspace } from '../../workspace/Workspace';

/**
 * The same lifecycle ownership as PageOperations, scoped to folders.
 *
 * Does not have create()/move()/rename(): FolderApplicationService never
 * had them, and building them now would require Gate folder-support that
 * doesn't exist yet — the same reasoning PageOperations already applies to
 * move()/rename() (see ADR-012).
 */
export class FolderOperations {
  constructor(
    private readonly vault: Vault,
    private readonly workspace: Workspace
  ) {}

  public async open(folderId: string): Promise<void> {
    const folder = this.vault.getFolder(folderId);

    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    this.workspace.openFolder(folderId);
  }
}
