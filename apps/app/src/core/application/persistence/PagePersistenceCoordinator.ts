import type { Page } from '../../vault/models/Page';
import { Vault } from '../../vault/models/Vault';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';
import { FrontmatterSerializer } from '../../vault/understand/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/understand/FrontmatterParser';
import { PageRebuilder } from '../../vault/build/PageRebuilder';
import { MoveService } from '../move/MoveService';

/**
 * Describes a single change to persist for a page: the Page whose metadata
 * should be serialized, and the Markdown body to persist alongside it.
 *
 * This is an ordered persistence operation, not a database transaction —
 * it carries no isolation or rollback semantics of its own. Correctness
 * comes entirely from PagePersistenceCoordinator serializing operations
 * per page and handing each one the latest committed Page.
 */
export interface PagePersistenceOperation {
  readonly page: Page;
  readonly markdown: string;
}

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
 * Every writer of page content — edit-saves, archive, rename, and any future
 * structural mutation — must go through here. A single per-page queue
 * serializes every write targeting a given page, and each queued operation
 * is handed the Vault's latest committed Page for that id at the moment it
 * actually runs (not whatever the caller captured when it enqueued), so a
 * later operation always builds on the result of an earlier one instead of
 * silently overwriting it.
 *
 * Does NOT know about DocumentSession, DocumentRevision, or SaveCoordinator.
 * Callers are responsible for translating their own vocabulary (a committed
 * revision, an archive request, ...) into a PagePersistenceOperation.
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
   * the same page has settled, and receives the Vault's current Page for
   * that id as `current` at that point in time.
   */
  public enqueue(
    pageId: string,
    operate: (current: Page) => PagePersistenceOperation
  ): Promise<PersistenceResult> {
    const previous = this.queues.get(pageId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => this.runOperation(pageId, operate));

    this.queues.set(pageId, next);

    return next.finally(() => {
      if (this.queues.get(pageId) === next) {
        this.queues.delete(pageId);
      }
    });
  }

  private async runOperation(
    pageId: string,
    operate: (current: Page) => PagePersistenceOperation
  ): Promise<PersistenceResult> {
    const current = this.vault.getPage(pageId);

    if (!current) {
      return {
        status: 'abandoned',
        reason: `Page no longer exists in the vault: ${pageId}`,
      };
    }

    const { page, markdown } = operate(current);

    if (page.path !== current.path || page.parentId !== current.parentId) {
      await this.moveService.movePage(current, page);
    }

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
