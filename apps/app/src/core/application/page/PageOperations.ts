import type { DocumentSession } from '../../engine/DocumentSession';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { DocumentTransaction } from '../../engine/DocumentTransaction';
import { Vault } from '../../vault/models/Vault';
import { Workspace } from '../../workspace/Workspace';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { PagePathResolver } from './PagePathResolver';
import { PageCreator } from './PageCreator';

export interface CreatePageOptions {
  readonly folderId: string | null;
  readonly title?: string;
}

/**
 * Owns the entire lifecycle of a page as a single capability surface —
 * open, close, save, archive, restore, create, delete, move.
 *
 * Does not have rename(): no backing Persistence Gate operation kind
 * exists yet, and building one without a real caller would be exactly the
 * placeholder machinery this migration exists to avoid (see ADR-012).
 * Does not have draft-promotion logic: this codebase's Page model has no
 * 'draft' status to promote from (see ADR-012).
 */
export class PageOperations {
  constructor(
    private readonly vault: Vault,
    private readonly workspace: Workspace,
    private readonly documentRegistry: DocumentRegistry,
    private readonly saveCoordinator: SaveCoordinator,
    private readonly coordinator: PagePersistenceCoordinator,
    private readonly pathResolver: PagePathResolver,
    private readonly pageCreator: PageCreator
  ) {}

  public async open(pageId: string): Promise<void> {
    const page = this.vault.getPage(pageId);

    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    this.documentRegistry.open(page);
    this.workspace.openPage(pageId);
  }

  public close(pageId: string): void {
    this.workspace.closePage(pageId);
    this.documentRegistry.close(pageId);
  }

  public getSession(pageId: string): DocumentSession | undefined {
    return this.documentRegistry.get(pageId);
  }

  /**
   * Archived pages are view-only: editing one is rejected until it is
   * restored. This is the one business rule this method owns — it re-reads
   * the Vault rather than trusting the session's own snapshot, so a page
   * archived after its session was opened is caught on the very next edit.
   */
  public async save(pageId: string, markdown: string): Promise<void> {
    const session = this.documentRegistry.get(pageId);

    if (!session) {
      throw new Error(`No open document session for page: ${pageId}`);
    }

    const page = this.vault.getPage(pageId);

    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    if (page.metadata.status === 'archived') {
      throw new Error(
        `Cannot edit archived page: ${pageId}. Restore it before editing.`
      );
    }

    session.commit(new DocumentTransaction(markdown));
    this.saveCoordinator.beginSave(session);

    const revision = session.currentRevision;

    if (session.currentRevision !== revision) {
      return;
    }

    try {
      const result = await this.coordinator.enqueue(pageId, {
        kind: 'save',
        content: revision.markdown,
      });

      if (result.status === 'abandoned') {
        this.saveCoordinator.failSave(session, revision);
        return;
      }

      this.saveCoordinator.completeSave(session, revision);
    } catch (error) {
      this.saveCoordinator.failSave(session, revision);
      throw error;
    }
  }

  public async archive(pageId: string): Promise<void> {
    const result = await this.coordinator.enqueue(pageId, { kind: 'archive' });

    if (result.status === 'abandoned') {
      throw new Error(`Page not found: ${pageId}`);
    }
  }

  public async restore(pageId: string): Promise<void> {
    const result = await this.coordinator.enqueue(pageId, { kind: 'restore' });

    if (result.status === 'abandoned') {
      throw new Error(`Page not found: ${pageId}`);
    }
  }

  public async create(options: CreatePageOptions): Promise<string> {
    const destination = this.pathResolver.createNotePath(
      options.folderId,
      options.title ?? 'Untitled'
    );
    const created = this.pageCreator.create('note');

    const result = await this.coordinator.enqueue(created.id, {
      kind: 'create',
      path: destination.path,
      parentId: destination.parentId,
      content: created.content,
    });

    if (result.status === 'abandoned') {
      throw new Error(
        `Failed to create page at ${destination.path}: ${result.reason}`
      );
    }

    this.workspace.openPage(created.id);

    return created.id;
  }

  public async move(pageId: string, destinationFolderId: string): Promise<void> {
    const result = await this.coordinator.enqueue(pageId, {
      kind: 'move',
      destinationFolderId,
    });

    if (result.status === 'abandoned') {
      throw new Error(`Page not found: ${pageId}`);
    }
  }

  /**
   * Closes any open session before enqueueing the disk delete, so no save
   * can complete against a page mid-deletion.
   */
  public async delete(pageId: string): Promise<void> {
    this.documentRegistry.close(pageId);

    const result = await this.coordinator.enqueue(pageId, { kind: 'delete' });

    if (result.status === 'abandoned') {
      throw new Error(`Page not found: ${pageId}`);
    }

    this.workspace.closePage(pageId);
  }
}
