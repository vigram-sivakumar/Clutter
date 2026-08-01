import type { Vault } from '../models/Vault';
import type { Page } from '../models/Page';
import type { VaultFileSystemWatcher } from '../providers/VaultFileSystemWatcher';
import type { VaultFileChange } from '../providers/VaultFileSystemWatcher';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { PageBuilder } from '../ingest/PageBuilder';
import { PageRebuilder } from '../ingest/PageRebuilder';
import type { DocumentRegistry } from '../../engine/DocumentRegistry';
import { DocumentTransaction } from '../../engine/DocumentTransaction';
import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { VaultSyncCoordinator, type SyncKey } from './VaultSyncCoordinator';
import { reconcilePageArchiveMetadata } from './reconcileArchiveMetadata';

export class VaultSyncService {
  private readonly unsubscribe: () => void;
  private readonly vault: Vault;
  private readonly fileSystem: VaultFileSystem;
  private readonly pageBuilder: PageBuilder;
  private readonly pageRebuilder: PageRebuilder;
  private readonly documentRegistry: DocumentRegistry;
  private readonly frontmatterParser: FrontmatterParser;
  private readonly frontmatterSerializer: FrontmatterSerializer;
  private readonly coordinator: VaultSyncCoordinator;

  constructor(
    vault: Vault,
    fileSystem: VaultFileSystem,
    watcher: VaultFileSystemWatcher,
    documentRegistry: DocumentRegistry,
    frontmatterSerializer: FrontmatterSerializer
  ) {
    this.vault = vault;
    this.fileSystem = fileSystem;
    this.pageBuilder = new PageBuilder();
    this.pageRebuilder = new PageRebuilder();
    this.documentRegistry = documentRegistry;
    this.frontmatterParser = new FrontmatterParser();
    this.frontmatterSerializer = frontmatterSerializer;
    this.coordinator = new VaultSyncCoordinator();
    this.unsubscribe = watcher.subscribe((change) => {
      this.handleChange(change);
    });
  }

  public dispose(): void {
    this.unsubscribe();
  }

  /**
   * Interprets the event and dispatches it through VaultSyncCoordinator so
   * that operations targeting the same page/path never overlap and always
   * run in the order their events arrived. The coordinator only enforces
   * that ordering — it has no idea what a "page" or a "change" is; all
   * event interpretation stays here, unchanged from before this existed.
   */
  private handleChange(change: VaultFileChange): void {
    switch (change.type) {
      case 'created':
        this.dispatch(this.resolvePath(change.path), () =>
          this.handleCreated(change.path)
        );
        break;

      case 'changed':
        this.dispatch(this.resolvePath(change.path), () =>
          this.handleChanged(change.path)
        );
        break;

      case 'deleted':
        this.dispatch(this.resolvePath(change.path), async () =>
          this.handleDeleted(change.path)
        );
        break;

      case 'moved':
        this.dispatch(this.resolvePath(change.fromPath), async () =>
          this.handleMoved(change.fromPath, change.toPath)
        );
        break;
    }
  }

  private dispatch(absolutePath: string, operation: () => Promise<void>): void {
    const key = this.resolveKey(absolutePath);

    void this.coordinator.runExclusive(key, operation).catch((error: unknown) => {
      console.error('VaultSyncService: failed to handle filesystem change', error);
    });
  }

  /**
   * Anchors the sync lane to durable page identity whenever the target path
   * already resolves to a known page, so operations that arrive addressed
   * by different paths (e.g. a rename's destination) but concern the same
   * page still serialize against each other once that page exists. Falls
   * back to the raw path only while no page can yet be resolved there (a
   * brand-new file, or a rename destination that hasn't landed yet).
   */
  private resolveKey(absolutePath: string): SyncKey {
    const page = this.vault.getPageByPath(absolutePath);

    return page ? { type: 'page', id: page.id } : { type: 'path', path: absolutePath };
  }

  private async handleCreated(path: string): Promise<void> {
    if (!path.endsWith('.md')) {
      return;
    }

    const absolutePath = this.resolvePath(path);

    // A duplicate or out-of-order event for a page we already know about.
    if (this.vault.getPageByPath(absolutePath)) {
      return;
    }

    const directoryPath = this.directoryOf(absolutePath);
    const parentId = this.resolveParentId(directoryPath);

    // Folder identity for externally-created folders isn't resolvable yet;
    // skip rather than guess. This mirrors the vault's existing scan-time
    // requirement that every page's parent folder already be known.
    if (parentId === undefined) {
      return;
    }

    const fileContent = await this.fileSystem.readFile(absolutePath);
    const parsedMarkdown = this.frontmatterParser.parse(fileContent);

    const page = this.pageBuilder.build({
      parentId,
      page: {
        path: absolutePath,
        directoryPath,
        frontmatter: parsedMarkdown.frontmatter,
        frontmatterAnalysis: parsedMarkdown.frontmatterAnalysis,
        content: parsedMarkdown.body,
        analysis: parsedMarkdown.analysis,
      },
    });

    this.vault.addPage(page);
    await this.reconcileArchiveMetadataForPage(page.id);
  }

  private async handleChanged(path: string): Promise<void> {
    const absolutePath = this.resolvePath(path);
    const page = this.vault.getPageByPath(absolutePath);

    if (!page) {
      return;
    }

    const fileContent = await this.fileSystem.readFile(absolutePath);
    const parsedMarkdown = this.frontmatterParser.parse(fileContent);
    const rebuiltPage = this.pageRebuilder.rebuild(page, parsedMarkdown);

    this.vault.replacePage(rebuiltPage);

    // Keep the open editor's live revision in sync with external changes.
    // Vault.replacePage() only updates the immutable Vault snapshot; the
    // page's rendered content comes from the DocumentSession's revision.
    // Skip when the session has unsaved local edits to avoid clobbering them.
    const session = this.documentRegistry.get(rebuiltPage.id);

    if (session && !session.isDirty) {
      session.commit(new DocumentTransaction(parsedMarkdown.body));
    }

    await this.reconcileArchiveMetadataForPage(rebuiltPage.id);
  }

  private handleDeleted(path: string): void {
    const absolutePath = this.resolvePath(path);
    const page = this.vault.getPageByPath(absolutePath);

    if (!page) {
      return;
    }

    this.vault.removePage(page.id);
  }

  /**
   * Handles an externally moved/renamed file.
   *
   * A move whose destination requires an archive-metadata repair (e.g.
   * Archive/ -> Projects/ while frontmatter still says `status: archived`)
   * is never applied as two separate Vault mutations. Evaluating the repair
   * against the *candidate* destination page — before anything is committed
   * to the Vault — lets the corrected path, parentId, and metadata land in
   * a single `replacePage()` call, so the Vault (and therefore every
   * subscriber, including the sidebar) only ever observes the final,
   * consistent state. A move that doesn't need repair keeps the original,
   * cheaper single-notify path with no extra read/write.
   */
  private async handleMoved(fromPath: string, toPath: string): Promise<void> {
    const absoluteFrom = this.resolvePath(fromPath);
    const absoluteTo = this.resolvePath(toPath);
    const page = this.vault.getPageByPath(absoluteFrom);

    if (!page) {
      return;
    }

    const directoryPath = this.directoryOf(absoluteTo);
    const parentId = this.resolveParentId(directoryPath);
    const resolvedParentId = parentId === undefined ? page.parentId : parentId;

    const candidatePage: Page = {
      ...page,
      path: absoluteTo,
      parentId: resolvedParentId,
    };

    const reconciled = await reconcilePageArchiveMetadata(
      {
        vault: this.vault,
        fileSystem: this.fileSystem,
        serializer: this.frontmatterSerializer,
        parser: this.frontmatterParser,
        rebuilder: this.pageRebuilder,
      },
      candidatePage
    );

    if (!reconciled) {
      // No archive repair needed: preserve normal move behavior exactly —
      // one Vault mutation, one `page-moved` notification, no extra I/O.
      this.vault.updatePagePath(page.id, absoluteTo, resolvedParentId);
      return;
    }

    const session = this.documentRegistry.get(reconciled.id);

    if (session && !session.isDirty) {
      session.commit(new DocumentTransaction(reconciled.source.markdown));
    }
  }

  private async reconcileArchiveMetadataForPage(pageId: string): Promise<void> {
    const page = this.vault.getPage(pageId);

    if (!page) {
      return;
    }

    const rebuiltPage = await reconcilePageArchiveMetadata(
      {
        vault: this.vault,
        fileSystem: this.fileSystem,
        serializer: this.frontmatterSerializer,
        parser: this.frontmatterParser,
        rebuilder: this.pageRebuilder,
      },
      page
    );

    if (!rebuiltPage) {
      return;
    }

    const session = this.documentRegistry.get(rebuiltPage.id);

    if (session && !session.isDirty) {
      session.commit(new DocumentTransaction(rebuiltPage.source.markdown));
    }
  }

  private resolveParentId(directoryPath: string): string | null | undefined {
    if (directoryPath === this.vault.root) {
      return null;
    }

    for (const folder of this.vault.folders()) {
      if (folder.path === directoryPath) {
        return folder.id;
      }
    }

    return undefined;
  }

  private directoryOf(absolutePath: string): string {
    return absolutePath.slice(0, absolutePath.lastIndexOf('/'));
  }

  private resolvePath(relativePath: string): string {
    return `${this.vault.root}/${relativePath}`;
  }
}
