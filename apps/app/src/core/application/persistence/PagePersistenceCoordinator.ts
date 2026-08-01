import type { Page } from '../../vault/models/Page';
import { Vault } from '../../vault/models/Vault';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';
import { FrontmatterSerializer } from '../../vault/understand/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/understand/FrontmatterParser';
import { PageRebuilder } from '../../vault/build/PageRebuilder';
import { MoveService } from '../move/MoveService';

/**
 * Every disk write for a page — save, archive, restore, and (future kinds
 * added the same way) create/delete/move/rename — is expressed as one of
 * these and enqueued through PagePersistenceCoordinator. This is the only
 * vocabulary any caller uses; there is no other way to reach a write.
 */
export type PersistenceOperation =
  | { readonly kind: 'save'; readonly content: string }
  | { readonly kind: 'archive' }
  | { readonly kind: 'restore' };

export type PersistenceResult =
  | {
      readonly status: 'saved';
      readonly page: Page;
    }
  | {
      readonly status: 'abandoned';
      readonly reason: string;
    };

/**
 * Sole owner of the write -> parse -> rebuild -> vault.replacePage pipeline
 * for page content.
 *
 * Every writer of page content — edit-saves, archive, restore, and any
 * future structural mutation — must go through here. A single per-page queue
 * serializes every write targeting a given page, and each queued operation
 * is handed the Vault's latest committed Page for that id at the moment it
 * actually runs (not whatever the caller captured when it enqueued), so a
 * later operation always builds on the result of an earlier one instead of
 * silently overwriting it.
 *
 * Does NOT know about DocumentSession, DocumentRevision, or SaveCoordinator.
 * Callers are responsible for translating their own vocabulary (a committed
 * revision, an archive request, ...) into a PersistenceOperation.
 */
export class PagePersistenceCoordinator {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly fileSystem: VaultFileSystem,
    private readonly vault: Vault,
    private readonly serializer: FrontmatterSerializer,
    private readonly parser: FrontmatterParser,
    private readonly rebuilder: PageRebuilder,
    private readonly moveService: MoveService
  ) {}

  /**
   * Enqueues a persistence operation for the given page.
   *
   * The operation runs only once every previously enqueued operation for
   * the same page has settled, and is dispatched against the Vault's
   * current Page for that id as of that point in time.
   */
  public enqueue(
    pageId: string,
    operation: PersistenceOperation
  ): Promise<PersistenceResult> {
    const previous = this.queues.get(pageId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => this.runOperation(pageId, operation));

    this.queues.set(pageId, next);

    return next.finally(() => {
      if (this.queues.get(pageId) === next) {
        this.queues.delete(pageId);
      }
    });
  }

  private async runOperation(
    pageId: string,
    operation: PersistenceOperation
  ): Promise<PersistenceResult> {
    const current = this.vault.getPage(pageId);

    if (!current) {
      return {
        status: 'abandoned',
        reason: `Page no longer exists in the vault: ${pageId}`,
      };
    }

    switch (operation.kind) {
      case 'save':
        return this.writeParseRebuildReplace(current, operation.content);
      case 'archive':
        return this.runArchive(current);
      case 'restore':
        return this.runRestore(current);
    }
  }

  private async runArchive(current: Page): Promise<PersistenceResult> {
    if (current.metadata.status === 'archived') {
      throw new Error(`Page is already archived: ${current.id}`);
    }

    const now = new Date().toISOString();
    const destination = this.moveService.resolveArchiveDestination(current);

    const page: Page = {
      ...current,
      path: destination.path,
      parentId: destination.parentId,
      metadata: {
        ...current.metadata,
        status: 'archived',
        archivedAt: now,
        updatedAt: now,
        originalPath: current.path,
        originalParentId: current.parentId,
      },
    };

    await this.moveService.movePage(current, page);

    return this.writeParseRebuildReplace(page, current.source.markdown);
  }

  private async runRestore(current: Page): Promise<PersistenceResult> {
    if (current.metadata.status !== 'archived') {
      throw new Error(`Page is not archived: ${current.id}`);
    }

    const now = new Date().toISOString();
    const destination = this.moveService.resolveRestoreDestination(current);

    const page: Page = {
      ...current,
      path: destination.path,
      parentId: destination.parentId,
      metadata: {
        ...current.metadata,
        status: 'active',
        archivedAt: null,
        originalPath: null,
        originalParentId: null,
        updatedAt: now,
      },
    };

    await this.moveService.movePage(current, page);

    return this.writeParseRebuildReplace(page, current.source.markdown);
  }

  /**
   * Shared by every kind above: serialize the given Page/markdown pair,
   * write it to disk, re-parse what was written, and rebuild the Vault's
   * Page from that. Sync's own metadata-repair write path shares this same
   * shape (see VaultSyncService), so the mechanics of "write, then trust
   * only what a re-read confirms" exist in exactly one place.
   */
  private async writeParseRebuildReplace(
    page: Page,
    markdown: string
  ): Promise<PersistenceResult> {
    const document = this.serializer.serializeDocument(page, markdown);

    await this.fileSystem.writeFile(page.path, document);

    const parsed = this.parser.parse(document);
    const rebuilt = this.rebuilder.rebuild(page, parsed);

    try {
      this.vault.replacePage(rebuilt);
    } catch (error) {
      return {
        status: 'abandoned',
        reason: `Vault rejected the persisted page after a successful write: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    return { status: 'saved', page: rebuilt };
  }
}
