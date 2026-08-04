import type { FolderOperations } from '../folder/FolderOperations';
import type { Vault } from '../../vault/models/Vault';
import type { ReservedFolderId } from '../../vault/initialize/ReservedResources';
import type { Workspace } from '../../workspace/Workspace';

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
  private readonly workspace: Workspace;

  constructor(folderOperations: FolderOperations, vault: Vault, workspace: Workspace) {
    this.folderOperations = folderOperations;
    this.vault = vault;
    this.workspace = workspace;
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

  /**
   * Shows the root-level folders+notes collection view (ADR-022) — a
   * filtered-view intent, not a folder open: root has no backing Folder
   * (ReservedFolderId has no root/workspace member), so this sets
   * Workspace's activeView directly rather than going through
   * FolderOperations.open, which requires a real Vault Folder to exist.
   */
  public openWorkspace(): void {
    this.workspace.openFilteredView('workspace');
  }

  /**
   * Shows the favorites collection view (ADR-022) — same reasoning as
   * openWorkspace(): Favorites is a cross-cutting query (any favorited
   * folder/page anywhere), not one folder's children, so it has no
   * backing Folder to open either.
   */
  public openFavorites(): void {
    this.workspace.openFilteredView('favorites');
  }

  /**
   * Shows the Today tasks collection view (Phase 2E) — incomplete tasks
   * due today plus the completed-today accordion, the same filtered-view
   * shape as openWorkspace()/openFavorites(). Not folder-backed, same
   * reasoning as those two.
   */
  public openTasksToday(): void {
    this.workspace.openFilteredView('tasks-today');
  }

  /**
   * Shows the Upcoming tasks collection view (Phase 2E) — overdue, future,
   * and unscheduled incomplete tasks, in that order.
   */
  public openTasksUpcoming(): void {
    this.workspace.openFilteredView('tasks-upcoming');
  }

  /**
   * Shows the Completed tasks collection view — every completed task
   * regardless of completion date, newest first.
   */
  public openTasksCompleted(): void {
    this.workspace.openFilteredView('tasks-completed');
  }

  /**
   * Shows every task, incomplete and completed alike.
   */
  public openAllTasks(): void {
    this.workspace.openFilteredView('tasks-all');
  }

  /**
   * Shows every incomplete task with no due date.
   */
  public openTasksUnscheduled(): void {
    this.workspace.openFilteredView('tasks-unscheduled');
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
