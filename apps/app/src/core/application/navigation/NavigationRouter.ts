import type { FolderOperations } from '../folder/FolderOperations';
import type { PageOperations } from '../page/PageOperations';
import type { Vault } from '../../vault/models/Vault';
import type { ReservedFolderId } from '../../vault/initialize/ReservedResources';
import type { ActiveView, Workspace } from '../../workspace/Workspace';

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
 * class for those three. Does not own navigation state — Workspace remains
 * the source of truth (this class owns none of the history stacks either;
 * see back()/forward() below).
 *
 * back()/forward() (ADR-027) reintroduce a PageOperations dependency this
 * class lost in Phase 4 — not a regression of that finding, since neither
 * method is a bare forward: both combine a Workspace stack read, a Vault
 * existence check, and a facade call, which is exactly the "compound
 * intent" shape ADR-005 already scoped this class for.
 */
export class NavigationRouter {
  private readonly folderOperations: FolderOperations;
  private readonly pageOperations: PageOperations;
  private readonly vault: Vault;
  private readonly workspace: Workspace;

  constructor(
    folderOperations: FolderOperations,
    pageOperations: PageOperations,
    vault: Vault,
    workspace: Workspace
  ) {
    this.folderOperations = folderOperations;
    this.pageOperations = pageOperations;
    this.vault = vault;
    this.workspace = workspace;
  }

  /**
   * Navigates to the previous entry in history (ADR-027), skipping past
   * any entry whose target no longer exists in the Vault rather than
   * invoking any fallback policy (that's a different concern — see
   * PageOperations.delete()/Application.openFallbackPage(), ADR-025,
   * which this method never calls). A no-op when there's nothing left to
   * go back to.
   */
  public back(): void {
    while (this.workspace.canNavigateBack) {
      const entry = this.workspace.peekBack();

      if (!entry) {
        return;
      }

      if (!this.stillExists(entry)) {
        this.workspace.discardBackEntry();
        continue;
      }

      this.workspace.popBackForReplay();
      this.commit(entry);
      return;
    }
  }

  /**
   * Symmetric counterpart to back(). See its doc comment.
   */
  public forward(): void {
    while (this.workspace.canNavigateForward) {
      const entry = this.workspace.peekForward();

      if (!entry) {
        return;
      }

      if (!this.stillExists(entry)) {
        this.workspace.discardForwardEntry();
        continue;
      }

      this.workspace.popForwardForReplay();
      this.commit(entry);
      return;
    }
  }

  /**
   * A plain Vault read, not a fallback decision — used only to decide
   * whether to keep walking the stack past a stale entry. Renamed or
   * archived pages/folders are not stale by this check: rename changes
   * path/title, archive changes status/folder, neither removes the Vault
   * entry, so back()/forward() reopen them showing their current state,
   * same as opening them from anywhere else would.
   *
   * A page entry is also not stale if it's a live draft (ADR-017) — a
   * draft has no Vault entry by design, so the Vault check alone would
   * always discard it. Folders have no draft concept, so they stay
   * Vault-only.
   */
  private stillExists(entry: ActiveView): boolean {
    if (entry.type === 'page') {
      return (
        this.vault.getPage(entry.id) !== undefined ||
        this.pageOperations.getDraft(entry.id) !== undefined
      );
    }

    if (entry.type === 'folder') {
      return this.vault.getFolder(entry.id) !== undefined;
    }

    // Filtered views have no id to go stale — an empty result set is a
    // normal, already-handled render state, not a missing-resource case.
    return true;
  }

  /**
   * Reactivates a validated history entry through the same path a normal
   * open would use (session creation, outgoing-page flush), with
   * recordHistory:false so replaying history is never itself recorded
   * (ADR-027).
   */
  private commit(entry: ActiveView): void {
    if (entry.type === 'page') {
      void this.pageOperations.open(entry.id, { recordHistory: false });
    } else if (entry.type === 'folder') {
      void this.folderOperations.open(entry.id, { recordHistory: false });
    } else {
      this.workspace.openFilteredView(entry.view, { recordHistory: false });
    }
  }

  public openArchive(): void {
    void this.openReservedFolder('archive');
  }

  public openInbox(): void {
    void this.openReservedFolder('inbox');
  }

  public openTemplates(): void {
    void this.openReservedFolder('templates');
  }

  /**
   * Shows the root-level folders+notes collection view (ADR-022) — a
   * filtered-view intent, not a folder open: root has no backing Folder
   * (ReservedFolderId has no root/workspace member), so this sets
   * Workspace's activeView directly rather than going through
   * FolderOperations.open, which requires a real Vault Folder to exist.
   */
  public openWorkspace(): void {
    this.workspace.openFilteredView({ kind: 'workspace' });
  }

  /**
   * Shows the favorites collection view (ADR-022) — same reasoning as
   * openWorkspace(): Favorites is a cross-cutting query (any favorited
   * folder/page anywhere), not one folder's children, so it has no
   * backing Folder to open either.
   */
  public openFavorites(): void {
    this.workspace.openFilteredView({ kind: 'favorites' });
  }

  /**
   * Shows the Today tasks collection view (Phase 2E) — incomplete tasks
   * due today plus the completed-today accordion, the same filtered-view
   * shape as openWorkspace()/openFavorites(). Not folder-backed, same
   * reasoning as those two.
   */
  public openTasksToday(): void {
    this.workspace.openFilteredView({ kind: 'tasks-today' });
  }

  /**
   * Shows the Upcoming tasks collection view (Phase 2E) — overdue, future,
   * and unscheduled incomplete tasks, in that order.
   */
  public openTasksUpcoming(): void {
    this.workspace.openFilteredView({ kind: 'tasks-upcoming' });
  }

  /**
   * Shows the Completed tasks collection view — every completed task
   * regardless of completion date, newest first.
   */
  public openTasksCompleted(): void {
    this.workspace.openFilteredView({ kind: 'tasks-completed' });
  }

  /**
   * Shows every task, incomplete and completed alike.
   */
  public openAllTasks(): void {
    this.workspace.openFilteredView({ kind: 'tasks-all' });
  }

  /**
   * Shows every incomplete task with no due date.
   */
  public openTasksUnscheduled(): void {
    this.workspace.openFilteredView({ kind: 'tasks-unscheduled' });
  }

  /**
   * Shows the collection of notes/daily notes referencing one tag —
   * query-defined membership like the other filtered views above, not a
   * folder-backed or entity-open like openFolder/PageOperations.open. Tag
   * has no Vault id of its own; name is its only identity.
   */
  public openTag(name: string): void {
    this.workspace.openFilteredView({ kind: 'tag', tagName: name });
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

  /**
   * required → ensure → use: reserved folders (Archive, Inbox, Templates)
   * are definitions, not guaranteed-to-exist state (see
   * ReservedResources.ts's own header comment). Opening one is the point
   * at which the feature actually requires it, so this ensures it via the
   * existing FolderOperations.ensureReservedFolder() primitive — recreating
   * it on disk and in Vault if it was deleted externally — before opening
   * it. ensureReservedFolder() is idempotent, so an already-present folder
   * is returned as-is with no duplicate write.
   */
  private async openReservedFolder(id: ReservedFolderId): Promise<void> {
    const folder = await this.folderOperations.ensureReservedFolder(id);
    await this.folderOperations.open(folder.id);
  }
}
