import { Vault } from '../../vault/models/Vault';
import { Workspace } from '../../workspace/Workspace';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from './FolderCreator';

/**
 * The same lifecycle ownership as PageOperations, scoped to folders.
 *
 * create() is eager and immediate-persist, unlike PageOperations' drafts —
 * there is no folder draft lifecycle. The UI is responsible for only
 * calling create() once the user has committed a valid name (see the
 * "New Folder" inline-rename row); this method receives confirmed intent,
 * not a name-in-progress, and persists on the very first call.
 *
 * Does not have move()/rename(): no backing Persistence Gate operation
 * kind exists yet for either — the same reasoning PageOperations already
 * applies to its own move()/rename() (see ADR-012).
 */
export class FolderOperations {
  constructor(
    private readonly vault: Vault,
    private readonly workspace: Workspace,
    private readonly coordinator: PagePersistenceCoordinator,
    private readonly pathResolver: FolderPathResolver,
    private readonly folderCreator: FolderCreator,
    /**
     * Called before this facade changes Workspace's active target — a
     * page-agnostic navigation hook, not a page-specific callback:
     * FolderOperations has no concept of pages or persistence and must
     * not gain one just to flush an outgoing page's autosave
     * (autosave-execution-model.md §2, T5). The Composition Root supplies
     * the actual behavior (today: flush whatever page is active via
     * PageOperations.flushActivePage()) — this class only knows it must
     * call the hook, never what the hook does.
     */
    private readonly prepareNavigation: () => void
  ) {}

  public async open(folderId: string): Promise<void> {
    const folder = this.vault.getFolder(folderId);

    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    this.prepareNavigation();
    this.workspace.openFolder(folderId);
  }

  /**
   * Creates a new folder under parentId (null for the vault root — mirrors
   * PageOperations.create()'s nullable folderId; Folder.parentId is itself
   * string | null, so a facade that couldn't create at the root would be
   * unable to express a state the domain model already allows).
   *
   * Resolves a collision-free path, mints the folder's persisted id, and
   * enqueues the Gate's 'create-folder' operation — directory + .folder.md
   * + Vault registration all happen there, the one write path.
   */
  public async create(name: string, parentId: string | null): Promise<string> {
    const destination = this.pathResolver.createFolderPath(parentId, name);
    const id = this.folderCreator.generateId();
    const content = this.folderCreator.buildContent(id);

    const result = await this.coordinator.enqueue(id, {
      kind: 'create-folder',
      path: destination.path,
      parentId: destination.parentId,
      content,
    });

    if (result.status !== 'folder-created') {
      throw new Error(
        `Failed to create folder at ${destination.path}: ${
          result.status === 'abandoned' ? result.reason : result.status
        }`
      );
    }

    return result.folder.id;
  }
}
