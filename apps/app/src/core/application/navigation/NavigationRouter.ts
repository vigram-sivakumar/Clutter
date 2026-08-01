import type { FolderOperations } from '../folder/FolderOperations';
import type { Vault } from '../../vault/models/Vault';
import type { ReservedFolderId } from '../../vault/initialize/ReservedResources';

/**
 * Translates named, view-level user intents into Workspace state changes
 * and/or VaultQuery reads, for intents that don't correspond to a single
 * PageOperations/FolderOperations call — spec §8.
 *
 * openNote/openDailyNote/openFolder were deleted here in Phase 4 (see
 * ADR-014): their bodies were unconditional single-call forwards to
 * PageOperations.open()/FolderOperations.open(), which ARCHITECTURE_RULES.md
 * rule 9 forbids on any facade. Callers now hold a reference to
 * PageOperations/FolderOperations directly instead of going through this
 * class for those three — which is also why this class no longer depends
 * on PageOperations at all. Does not own navigation state — Workspace
 * remains the source of truth.
 */
export class NavigationRouter {
  private readonly folderOperations: FolderOperations;
  private readonly vault: Vault;

  constructor(folderOperations: FolderOperations, vault: Vault) {
    this.folderOperations = folderOperations;
    this.vault = vault;
  }

  public openArchive(): void {
    this.openReservedFolder('archive');
  }

  public openInbox(): void {
    this.openReservedFolder('inbox');
  }

  public openTemplates(): void {
    this.openReservedFolder('templates');
  }

  // createTask/createTag are NOT deleted alongside the 6 view-intent stubs
  // removed in Phase 4 commit 3 (see ADR-014): unlike a filtered view,
  // removing "create a task/tag" from the UI entirely is a product
  // regression, not just a cleanup. ADR-012 already disposed of these —
  // permanent removal, blocked on TaskOperations/TagOperations existing,
  // no phase assigned — and that disposition is unchanged here.
  public createTask(): void {
    throw new Error('NavigationRouter.createTask() is not implemented.');
  }

  public createTag(): void {
    throw new Error('NavigationRouter.createTag() is not implemented.');
  }

  private openReservedFolder(id: ReservedFolderId): void {
    const folder = this.vault.getReservedFolder(id);

    if (!folder) {
      throw new Error(`Reserved ${id} folder not found in vault`);
    }

    void this.folderOperations.open(folder.id);
  }
}
