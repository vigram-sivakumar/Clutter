import type { Page } from '../models/Page';
import { Vault } from '../models/Vault';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { PageRebuilder } from '../ingest/PageRebuilder';
import { PageBuilder } from '../ingest/PageBuilder';
import type { ScannedPage } from '../ingest/VaultScanResult';
import { VaultPath } from '../ingest/VaultPath';
import { MoveService } from './MoveService';

/**
 * Every disk write for a page — save, create, archive, restore, delete,
 * move, and (a future kind added the same way) rename — is expressed as
 * one of these and enqueued through PagePersistenceCoordinator. This is
 * the only vocabulary any caller uses; there is no other way to reach a
 * write.
 */
export type PersistenceOperation =
  | { readonly kind: 'save'; readonly content: string }
  | {
      readonly kind: 'create';
      readonly path: string;
      readonly parentId: string | null;
      readonly content: string;
    }
  | { readonly kind: 'archive' }
  | { readonly kind: 'restore' }
  | { readonly kind: 'delete' }
  | { readonly kind: 'move'; readonly destinationFolderId: string };

export type PersistenceResult =
  | {
      readonly status: 'saved';
      readonly page: Page;
    }
  | {
      readonly status: 'deleted';
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

  // Constructed once here, for this Gate's own lifetime — a separate,
  // stateless PageBuilder instance from the one VaultBuilder owns for the
  // initial scan, since the two serve genuinely different lifecycles (see
  // ADR-011). Not a duplicate construction of the same long-lived purpose.
  private readonly pageBuilder = new PageBuilder();

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
    // 'create' is dispatched before the existing-page guard below, because
    // its usual target does not exist in the Vault yet. It is not exempt
    // from that guard, though (see runCreate's own dequeue-time check,
    // ADR-017 §4) — deferred-persistence callers (a promoted draft's first
    // save) can enqueue a second 'create' for an id the first one already
    // persisted, so 'create' itself resolves the id's current Vault state
    // at dequeue time instead of assuming it, same as every other kind.
    if (operation.kind === 'create') {
      return this.runCreate(pageId, operation);
    }

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
      case 'delete':
        return this.runDelete(current);
      case 'move':
        return this.runMove(current, operation.destinationFolderId);
    }
  }

  /**
   * Unlike save/archive/restore, a pure move changes neither file content
   * nor frontmatter — there is nothing to re-serialize or re-parse, so this
   * does not go through writeParseRebuildReplace. movePage already updates
   * the Vault's path index internally.
   */
  private async runMove(
    current: Page,
    destinationFolderId: string
  ): Promise<PersistenceResult> {
    const destination = this.moveService.resolveMoveDestination(
      current,
      destinationFolderId
    );

    const updated: Page = {
      ...current,
      path: destination.path,
      parentId: destination.parentId,
    };

    await this.moveService.movePage(current, updated);

    return { status: 'saved', page: this.vault.getPage(current.id)! };
  }

  private async runDelete(current: Page): Promise<PersistenceResult> {
    await this.fileSystem.deleteFile(current.path);
    // Only possible caller of removePage for an app-initiated deletion is
    // this dispatch, reached only after the existing-page guard above, so
    // there is no double-delete race for removePage to reject here — the
    // per-page queue already prevents a second delete for the same id from
    // reaching this point concurrently.
    this.vault.removePage(current.id);

    return { status: 'deleted' };
  }

  private async runCreate(
    pageId: string,
    operation: {
      readonly kind: 'create';
      readonly path: string;
      readonly parentId: string | null;
      readonly content: string;
    }
  ): Promise<PersistenceResult> {
    // Dequeue-time existence check (ADR-017 §4 concurrency correction): a
    // second 'create' enqueued for the same id — possible once persistence
    // can be deferred past a single synchronous call, e.g. two rapid saves
    // on the same still-unpersisted draft — must not write a second file or
    // call Vault.addPage a second time. If the id was already persisted by
    // an earlier operation in this same per-page queue, treat this as the
    // save it actually is against the page's real, already-established
    // path, via the same helper 'save' already uses. This is the only
    // guard 'create' needed; every other kind already had its own.
    const existing = this.vault.getPage(pageId);

    if (existing) {
      // 'create's content is always a full serialized document (frontmatter
      // + body, per PageCreator/PageFactory) — not the body-only markdown
      // writeParseRebuildReplace (shared with 'save') expects. Parse it
      // first to recover just the body.
      const { body } = this.parser.parse(operation.content);
      return this.writeParseRebuildReplace(existing, body);
    }

    await this.fileSystem.writeFile(operation.path, operation.content);

    // Reuses the same parse pipeline VaultScanner/DocumentLoader use during
    // scan — ParsedMarkdown's fields are structurally identical to
    // ScannedPage's, minus path/directoryPath, so this is not a hand-rolled
    // extraction, it's the existing one.
    const parsed = this.parser.parse(operation.content);
    const scannedPage: ScannedPage = {
      path: operation.path,
      directoryPath: VaultPath.parentDirectory(operation.path),
      frontmatter: parsed.frontmatter,
      frontmatterAnalysis: parsed.frontmatterAnalysis,
      content: parsed.body,
      analysis: parsed.analysis,
    };

    const built = this.pageBuilder.build({
      parentId: operation.parentId,
      page: scannedPage,
    });

    try {
      this.vault.addPage(built);
    } catch (error) {
      return {
        status: 'abandoned',
        reason: `Vault rejected the created page after a successful write: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    return { status: 'saved', page: built };
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
