import type { FolderApplicationService } from '../folder/FolderApplicationService';
import type { PageApplicationService } from '../page/PageApplicationService';
import type { Vault } from '../../vault/models/Vault';
import type { ReservedFolderId } from '../../vault/initialize/ReservedResources';

/**
 * Intention-based navigation API for the UI.
 *
 * Phase 1: thin façade over PageApplicationService and FolderApplicationService.
 * Does not own navigation state — Workspace remains the source of truth.
 */
export class NavigationService {
  private readonly pageService: PageApplicationService;
  private readonly folderService: FolderApplicationService;
  private readonly vault: Vault;

  constructor(
    pageService: PageApplicationService,
    folderService: FolderApplicationService,
    vault: Vault
  ) {
    this.pageService = pageService;
    this.folderService = folderService;
    this.vault = vault;
  }

  public openNote(pageId: string): void {
    this.pageService.openPage(pageId);
  }

  public openDailyNote(pageId: string): void {
    this.pageService.openPage(pageId);
  }

  public openFolder(folderId: string): void {
    this.folderService.openFolder(folderId);
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

  public createNote(): void {
    throw new Error('NavigationService.createNote() is not implemented.');
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

    this.folderService.openFolder(folder.id);
  }
}
