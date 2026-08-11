import type { Vault } from '../models/Vault';
import type { Page } from '../models/Page';
import type { VaultFileSystemWatcher } from '../providers/VaultFileSystemWatcher';
import type { VaultFileChange } from '../providers/VaultFileSystemWatcher';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { PageBuilder } from '../ingest/PageBuilder';
import { PageRebuilder } from '../ingest/PageRebuilder';
import { FolderBuilder } from '../ingest/FolderBuilder';
import type { DocumentRegistry } from '../../engine/DocumentRegistry';
import { DocumentTransaction } from '../../engine/DocumentTransaction';
import { FrontmatterParser, type ParsedMarkdown } from '../ingest/FrontmatterParser';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { VaultPath } from '../ingest/VaultPath';
import { isClutterInternalPath } from '../initialize/ReservedResources';
import { VaultSyncCoordinator, type SyncKey } from './VaultSyncCoordinator';
import { reconcilePageArchiveMetadata } from './reconcileArchiveMetadata';

export class VaultSyncService {
  private readonly unsubscribe: () => void;
  private readonly vault: Vault;
  private readonly fileSystem: VaultFileSystem;
  private readonly pageBuilder: PageBuilder;
  private readonly pageRebuilder: PageRebuilder;
  private readonly folderBuilder: FolderBuilder;
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
    this.folderBuilder = new FolderBuilder();
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
          this.handleCreated(change.path, change.isDirectory)
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
   * Anchors the sync lane to durable page or folder identity (ADR-024)
   * whenever the target path already resolves to one, so operations that
   * arrive addressed by different paths (e.g. a rename's destination) but
   * concern the same page/folder still serialize against each other once
   * it exists. Falls back to the raw path only while neither can yet be
   * resolved there (a brand-new file/directory, or a rename destination
   * that hasn't landed yet). Pages are checked first: a path can never be
   * both a page's file and a folder's directory, but checking page first
   * matches every other page-vs-folder check in this file (handleDeleted/
   * handleMoved) for consistency, not because of an actual ambiguity.
   */
  private resolveKey(absolutePath: string): SyncKey {
    const page = this.vault.getPageByPath(absolutePath);

    if (page) {
      return { type: 'page', id: page.id };
    }

    const folder = this.vault.getFolderByPath(absolutePath);

    if (folder) {
      return { type: 'folder', id: folder.id };
    }

    return { type: 'path', path: absolutePath };
  }

  private async handleCreated(path: string, isDirectory: boolean): Promise<void> {
    const absolutePath = this.resolvePath(path);

    // Same exclusion VaultScanner applies at startup (ReservedResources'
    // isClutterInternalPath) — Clutter's own application data, never
    // discovered as vault content by either path.
    if (isClutterInternalPath(this.vault.root, absolutePath)) {
      return;
    }

    if (isDirectory) {
      await this.handleFolderCreated(absolutePath);
      return;
    }

    if (!path.endsWith('.md')) {
      return;
    }

    // A folder's own identity file — handleFolderCreated() (or the
    // startup scan) already captures its frontmatter directly. Without
    // this guard, a `.folder.md` arriving as its own filesystem event
    // (e.g. copying a folder in from outside the watched root, alongside
    // its own directory-created event) would be built as a bogus Page
    // once its parent folder is resolvable (ADR-024).
    if (VaultPath.filename(absolutePath) === '.folder.md') {
      return;
    }

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

  /**
   * ADR-024: an externally-created directory becomes a Folder the same
   * way VaultScanner treats one at startup — .folder.md supplies optional
   * frontmatter if present, never required for the directory to count
   * (confirmed: every directory is a Folder regardless of whether it has
   * one). Skips (rather than guesses) when the parent folder isn't yet
   * resolvable, same reasoning handleCreated's page branch already uses.
   */
  private async handleFolderCreated(absolutePath: string): Promise<void> {
    if (this.vault.getFolderByPath(absolutePath)) {
      return;
    }

    const parentId = this.resolveParentId(this.directoryOf(absolutePath));

    if (parentId === undefined) {
      return;
    }

    const folderMetadataPath = `${absolutePath}/.folder.md`;
    let frontmatter: ParsedMarkdown['frontmatter'] | null = null;

    if (await this.fileSystem.exists(folderMetadataPath)) {
      const raw = await this.fileSystem.readFile(folderMetadataPath);
      frontmatter = this.frontmatterParser.parse(raw).frontmatter;
    }

    const folder = this.folderBuilder.build({
      parentId,
      directory: {
        path: absolutePath,
        parentPath: null,
        frontmatter,
      },
    });

    this.vault.addFolder(folder);
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

  /**
   * ADR-024: an externally-deleted folder is reconciled the same way an
   * externally-deleted page always has been — resolve by path, mutate
   * Vault directly, no disk write (the deletion already happened). No
   * archive-metadata repair applies to folders (that's a page-status
   * concept). Vault.removeFolder()'s own cascade (descendant folders and
   * pages) handles everything nested inside — this handler never needs to
   * enumerate descendants itself.
   */
  private handleDeleted(path: string): void {
    const absolutePath = this.resolvePath(path);

    const folder = this.vault.getFolderByPath(absolutePath);

    if (folder) {
      this.vault.removeFolder(folder.id);
      return;
    }

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

    // ADR-024: an external rename and an external move of a folder are the
    // same event (the OS/notify-crate reports one `moved` event for a
    // directory regardless of whether its parent changed — confirmed in
    // the ADR's Phase 1 review) and Vault.moveFolder() doesn't distinguish
    // them either, so this one branch reconciles both. No archive-metadata
    // repair applies to folders. moveFolder()'s own cascade updates every
    // descendant folder/page path — this handler never enumerates them.
    const folder = this.vault.getFolderByPath(absoluteFrom);

    if (folder) {
      const folderDestinationParentId = this.resolveParentId(this.directoryOf(absoluteTo));
      const resolvedFolderParentId =
        folderDestinationParentId === undefined ? folder.parentId : folderDestinationParentId;

      this.vault.moveFolder(folder.id, absoluteTo, resolvedFolderParentId);
      return;
    }

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
    return VaultPath.parentDirectory(absolutePath);
  }

  private resolvePath(relativePath: string): string {
    return `${this.vault.root}/${relativePath}`;
  }
}
