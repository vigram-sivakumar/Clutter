import type { FolderOperations } from '../folder/FolderOperations';
import type { PageOperations } from '../page/PageOperations';
import type { Vault } from '../../vault/models/Vault';
import type { ReservedFolderId } from '../../vault/initialize/ReservedResources';

/**
 * Intention-based navigation API for the UI.
 *
 * Phase 2: thin façade over PageOperations and FolderOperations.
 * openNote/openDailyNote/openFolder are pure forwards, kept for now —
 * they're deleted (callers repointed directly to PageOperations/
 * FolderOperations) in Phase 4 alongside this class's rename to
 * NavigationRouter (see ADR-012). Does not own navigation state —
 * Workspace remains the source of truth.
 */
export class NavigationService {
  private readonly pageOperations: PageOperations;
  private readonly folderOperations: FolderOperations;
  private readonly vault: Vault;

  constructor(
    pageOperations: PageOperations,
    folderOperations: FolderOperations,
    vault: Vault
  ) {
    this.pageOperations = pageOperations;
    this.folderOperations = folderOperations;
    this.vault = vault;
  }

  public openNote(pageId: string): void {
    void this.pageOperations.open(pageId);
  }

  public openDailyNote(pageId: string): void {
    void this.pageOperations.open(pageId);
  }

  public openFolder(folderId: string): void {
    void this.folderOperations.open(folderId);
  }

  public openArchive(): void {
    this.openReservedFolder('archive');
  }

  public openInbox(): void {
    this.openReservedFolder('inbox');
  }

  public openFavorites(): void {
    throw new Error('NavigationService.openFavorites() is not implemented.');
  }

  public openAllNotes(): void {
    throw new Error('NavigationService.openAllNotes() is not implemented.');
  }

  public openTemplates(): void {
    this.openReservedFolder('templates');
  }

  public createTask(): void {
    throw new Error('NavigationService.createTask() is not implemented.');
  }

  public openAllTasks(): void {
    throw new Error('NavigationService.openAllTasks() is not implemented.');
  }

  public openSomedayTasks(): void {
    throw new Error('NavigationService.openSomedayTasks() is not implemented.');
  }

  public openCompletedTasks(): void {
    throw new Error('NavigationService.openCompletedTasks() is not implemented.');
  }

  public createTag(): void {
    throw new Error('NavigationService.createTag() is not implemented.');
  }

  public openAllTags(): void {
    throw new Error('NavigationService.openAllTags() is not implemented.');
  }

  private openReservedFolder(id: ReservedFolderId): void {
    const folder = this.vault.getReservedFolder(id);

    if (!folder) {
      throw new Error(`Reserved ${id} folder not found in vault`);
    }

    void this.folderOperations.open(folder.id);
  }
}
