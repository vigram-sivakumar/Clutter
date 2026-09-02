import type { Vault } from '../models/Vault';
import type { Page } from '../models/Page';
import type { Folder } from '../models/Folder';
import type { VaultFileSystemWatcher } from '../providers/VaultFileSystemWatcher';
import type { VaultFileChange } from '../providers/VaultFileSystemWatcher';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { PageBuilder } from '../ingest/PageBuilder';
import { PageRebuilder } from '../ingest/PageRebuilder';
import { FolderBuilder } from '../ingest/FolderBuilder';
import { ResourceBuilder } from '../ingest/ResourceBuilder';
import { VaultScanner } from '../ingest/VaultScanner';
import type { VaultScanResult } from '../ingest/VaultScanResult';
import { buildDiscoveredEntities } from '../ingest/buildDiscoveredEntities';
import { resolveDuplicateId } from '../ingest/identity/resolveDuplicateId';
import type { DocumentRegistry } from '../../engine/DocumentRegistry';
import type { DocumentSession } from '../../engine/DocumentSession';
import { DocumentTransaction } from '../../engine/DocumentTransaction';
import { FrontmatterParser, type ParsedMarkdown } from '../ingest/FrontmatterParser';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { VaultPath } from '../ingest/VaultPath';
import { isClutterInternalPath } from '../initialize/ReservedResources';
import type { IdGenerator } from '../../shared/identity/IdGenerator';
import { VaultSyncCoordinator, type SyncKey } from './VaultSyncCoordinator';
import {
  reconcilePageArchiveMetadata,
  reconcileFolderArchiveMetadata,
} from './reconcileArchiveMetadata';
import { persistSyncedPageDocument } from './persistSyncedPageDocument';

export class VaultSyncService {
  private readonly unsubscribe: () => void;
  private readonly vault: Vault;
  private readonly fileSystem: VaultFileSystem;
  private readonly pageBuilder: PageBuilder;
  private readonly pageRebuilder: PageRebuilder;
  private readonly folderBuilder: FolderBuilder;
  private readonly resourceBuilder: ResourceBuilder;
  private readonly vaultScanner: VaultScanner;
  private readonly documentRegistry: DocumentRegistry;
  private readonly frontmatterParser: FrontmatterParser;
  private readonly frontmatterSerializer: FrontmatterSerializer;
  private readonly idGenerator: IdGenerator;
  private readonly coordinator: VaultSyncCoordinator;

  constructor(
    vault: Vault,
    fileSystem: VaultFileSystem,
    watcher: VaultFileSystemWatcher,
    documentRegistry: DocumentRegistry,
    frontmatterSerializer: FrontmatterSerializer,
    idGenerator: IdGenerator
  ) {
    this.vault = vault;
    this.fileSystem = fileSystem;
    this.pageBuilder = new PageBuilder(vault.root);
    this.pageRebuilder = new PageRebuilder();
    this.folderBuilder = new FolderBuilder();
    this.resourceBuilder = new ResourceBuilder();
    this.vaultScanner = new VaultScanner(fileSystem);
    this.documentRegistry = documentRegistry;
    this.frontmatterParser = new FrontmatterParser();
    this.frontmatterSerializer = frontmatterSerializer;
    this.idGenerator = idGenerator;
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
      await this.reconcileDirectorySubtree(absolutePath);
      return;
    }

    if (!path.endsWith('.md')) {
      return;
    }

    await this.reconcileFileEntity(absolutePath);
  }

  /**
   * The one place any code path answers "given that something changed at
   * this filesystem path, what should Vault (and any open DocumentSession)
   * look like now?" — never trusting which event kind reported it.
   *
   * The filesystem event is treated purely as a signal that a path may have
   * changed, not as authoritative information about what happened: this
   * method always re-derives the answer from current disk state and current
   * Vault state, which is what makes it safe to call redundantly, out of
   * order, or in response to a coalesced/ambiguous event — every caller
   * converges on the same actual-disk-state outcome regardless of how it
   * got here.
   */
  private async reconcilePath(absolutePath: string): Promise<void> {
    if (isClutterInternalPath(this.vault.root, absolutePath)) {
      return;
    }

    // The vault root is directory-shaped by definition — unlike an
    // ordinary folder (see the trackedFolder branch below), there is no
    // meaningful "the root became a file" edge case to guard against, so
    // it always routes straight to reconcileDirectorySubtree(). That
    // function is existence-tolerant (a missing target reconciles as an
    // empty subtree — see its own doc comment), so "root still there" and
    // "root gone entirely" (a full external vault deletion, or a
    // coalesced event that lands on the root path) converge through this
    // one call, with no separate root-deletion code path to keep in sync.
    if (absolutePath === this.vault.root) {
      await this.reconcileDirectorySubtree(absolutePath);
      return;
    }

    const trackedFolder = this.vault.getFolderByPath(absolutePath);

    if (trackedFolder) {
      const diskExists = await this.fileSystem.exists(absolutePath);

      // Same existence-tolerant convergence as the root case: "still a
      // directory" and "gone" (an ordinary folder deletion, a bulk
      // deletion of everything inside it, or this exact folder itself)
      // both go through reconcileDirectorySubtree() — one mechanism, not
      // a manual removeFolder() call that has to be kept in sync with it.
      if (!diskExists || (await this.isDirectoryOnDisk(absolutePath))) {
        await this.reconcileDirectorySubtree(absolutePath);
        return;
      }

      // Rare edge case: a tracked directory was externally replaced by a
      // file at the same path — the stale Folder (and its cascade) can't
      // coexist with the file reconciled below.
      this.vault.removeFolder(trackedFolder.id);
      await this.reconcileFileEntity(absolutePath);
      return;
    }

    const diskExists = await this.fileSystem.exists(absolutePath);

    if (!diskExists) {
      const page = this.vault.getPageByPath(absolutePath);

      if (page) {
        this.vault.removePage(page.id);
      }

      // Nothing on disk, nothing tracked — already converged.
      return;
    }

    const isDirectory = await this.isDirectoryOnDisk(absolutePath);

    if (isDirectory) {
      // A file path became a directory externally (rare edge case) — not
      // yet tracked as a Folder (the branch above already handles that
      // case), so this is its first appearance as a directory. The stale
      // Page can't coexist with the subtree reconciliation below.
      const stalePage = this.vault.getPageByPath(absolutePath);

      if (stalePage) {
        this.vault.removePage(stalePage.id);
      }

      await this.reconcileDirectorySubtree(absolutePath);
      return;
    }

    await this.reconcileFileEntity(absolutePath);
  }

  /**
   * Determines file-vs-directory purely from current disk state — never
   * from which event kind reported the change — by listing the path's
   * parent, the same signal the Rust watcher already stats for `created`
   * events (ADR-024), just derived here for event kinds that don't carry
   * it (`changed`, `deleted`, and reconciliation triggered indirectly via
   * `moved`'s fallback path).
   */
  private async isDirectoryOnDisk(absolutePath: string): Promise<boolean> {
    const parentPath = this.directoryOf(absolutePath);
    const entries = await this.fileSystem.readDirectory(parentPath);
    const entry = entries.find((candidate) => candidate.path === absolutePath);

    return entry?.isDirectory ?? false;
  }

  /**
   * Reconciles a single file path against disk: rereads it, and either
   * rebuilds the already-tracked Page in place or resolves identity for a
   * page new to this path (the same rules `resolveDuplicateId` has always
   * used — a genuine frontmatter-id collision gets a fresh id, everything
   * else preserves the id on disk). Converges any open, non-dirty
   * DocumentSession for the resulting page as part of the same operation
   * (§4/§10 of the reconciliation model) — this is what makes an external
   * edit reach an open editor regardless of whether the watcher reported it
   * as a plain `changed`, or as an unpaired `deleted` followed later by a
   * `created` at the same path.
   */
  private async reconcileFileEntity(absolutePath: string): Promise<void> {
    // A folder's own identity file — reconcileDirectorySubtree() (or the
    // startup scan) already captures its frontmatter directly; it is never
    // itself treated as a Page.
    if (VaultPath.filename(absolutePath) === '.folder.md') {
      return;
    }

    if (!absolutePath.endsWith('.md')) {
      return;
    }

    // Existence-tolerant, the same way reconcileDirectorySubtree() is: the
    // file can have disappeared again between whatever caller decided to
    // reconcile this path and this read (a created-then-immediately-deleted
    // race, or a concurrent external edit-then-delete). Converge exactly
    // as an ordinary deletion would — remove whatever Vault still tracks
    // here, add nothing for content that no longer exists — instead of
    // letting fileSystem.readFile() throw and leaving Vault's state
    // whatever it happened to be when the exception cut this short.
    if (!(await this.fileSystem.exists(absolutePath))) {
      const goneAgainPage = this.vault.getPageByPath(absolutePath);

      if (goneAgainPage) {
        this.vault.removePage(goneAgainPage.id);
      }

      return;
    }

    const fileContent = await this.fileSystem.readFile(absolutePath);
    const parsedMarkdown = this.frontmatterParser.parse(fileContent);

    const existingPage = this.vault.getPageByPath(absolutePath);

    if (existingPage) {
      const rebuiltPage = this.pageRebuilder.rebuild(existingPage, parsedMarkdown);

      this.vault.replacePage(rebuiltPage);
      this.convergeOpenSession(rebuiltPage.id, rebuiltPage.source.markdown);
      await this.reconcileArchiveMetadataForPage(rebuiltPage.id);
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

    const buildPage = (frontmatter: typeof parsedMarkdown.frontmatter) =>
      this.pageBuilder.build({
        parentId,
        page: {
          path: absolutePath,
          directoryPath,
          frontmatter,
          frontmatterAnalysis: parsedMarkdown.frontmatterAnalysis,
          content: parsedMarkdown.body,
          analysis: parsedMarkdown.analysis,
        },
      });

    let page = buildPage(parsedMarkdown.frontmatter);

    // A genuine duplicate: this path is new to the Vault (checked above),
    // so an id collision here can only mean the frontmatter was copied
    // from another file (see resolveDuplicateId) — never a rename/move,
    // which reconciles through updatePagePath/moveFolder instead.
    const resolved = resolveDuplicateId(
      page.id,
      (id) => this.vault.getPage(id) !== undefined,
      this.idGenerator
    );

    if (resolved.wasReassigned) {
      page = buildPage({ ...parsedMarkdown.frontmatter, id: resolved.id });
    }

    this.vault.addPage(page);

    if (resolved.wasReassigned) {
      await persistSyncedPageDocument(
        {
          vault: this.vault,
          fileSystem: this.fileSystem,
          serializer: this.frontmatterSerializer,
          parser: this.frontmatterParser,
          rebuilder: this.pageRebuilder,
        },
        page,
        parsedMarkdown.body
      );
    }

    this.convergeOpenSession(page.id, page.source.markdown);
    await this.reconcileArchiveMetadataForPage(page.id);
  }

  /**
   * Reconciles an entire directory subtree against disk: the shared
   * mechanism behind both "a brand-new folder appeared" (ADR-024) and "a
   * coalesced/ambiguous event landed on a directory that may have gained
   * or lost descendants" (this is the generalization that fixes bulk
   * external deletion — see docs/adr and the Sync architecture notes).
   *
   * Scans the directory's entire subtree (VaultScanner.scan) rather than
   * trusting any single event to describe it — a directory arriving via
   * one `created`/`changed` event (a folder dragged in, a bulk delete
   * coalesced by the OS watcher into one directory-level signal) means its
   * whole contents changed at once, and individual events for its
   * descendants may have already arrived and been dropped, may never
   * arrive at all, or may be redundant with what this scan already
   * discovers. Reading the actual current disk state — the same discovery
   * rules VaultBuilder's initial scan uses, via the shared
   * buildDiscoveredEntities helper — is what makes this reconciliation
   * correct regardless of which events did or didn't fire for descendants
   * (docs/architecture-specification.md §4: Sync reacts to "something
   * changed here," the resulting state is determined by reading disk, not
   * by trusting one event to mean one entity).
   *
   * Always performs both halves of the diff: entities on disk but not yet
   * in Vault are added (or, if already tracked at that exact path, have
   * their content reconciled in place); entities Vault still tracks under
   * this subtree but no longer present on disk are removed. Idempotent by
   * construction — calling this twice in a row against unchanged disk
   * state is a no-op the second time, since both halves of the diff find
   * nothing left to do.
   */
  private async reconcileDirectorySubtree(absolutePath: string): Promise<void> {
    // The vault root itself is never a tracked Folder (VaultBuilder's
    // convention for a full scan: rootIsFolder: false, rootParentId:
    // null) — it has no parent *within* the vault to resolve, unlike a
    // real subfolder. A root-level/coalesced watcher event (resolvePath('')
    // — see that method's doc comment) reconciles here the same way, not
    // through a second mechanism.
    const isVaultRoot = absolutePath === this.vault.root;

    const trackedFolder = isVaultRoot ? undefined : this.vault.getFolderByPath(absolutePath);
    const parentId = isVaultRoot
      ? null
      : trackedFolder
        ? trackedFolder.parentId
        : this.resolveParentId(this.directoryOf(absolutePath));

    if (parentId === undefined) {
      return;
    }

    // Existence-tolerant: VaultScanner.scan() throws for a target that
    // doesn't exist (correct for VaultBuilder's startup scan, where a
    // missing vault root is a genuine error), but here a missing target
    // just means "this subtree is gone" — an external deletion of this
    // folder, a bulk deletion of everything inside it, or the entire vault
    // root disappearing. Substituting an empty scan result lets the same
    // add/remove diff below do the right thing either way: nothing is
    // (re)discovered to add, and every folder/page still tracked at or
    // under `absolutePath` (computed further down from live Vault state,
    // not from this scan) is removed as no longer present on disk. This is
    // what makes this one function the sole convergence mechanism for
    // every directory-shaped path — reconcilePath() never needs its own
    // parallel "manually remove what used to be here" logic.
    const diskExists = await this.fileSystem.exists(absolutePath);
    const scanResult: VaultScanResult = diskExists
      ? await this.vaultScanner.scan(absolutePath)
      : { rootPath: absolutePath, directories: [], pages: [], files: [] };

    const scannedFolderPaths = new Set(scanResult.directories.map((directory) => directory.path));
    const scannedPagePaths = new Set(scanResult.pages.map((page) => page.path));
    const scannedPagesByPath = new Map(scanResult.pages.map((page) => [page.path, page]));

    // Ids already claimed by a path this scan itself will rediscover are
    // excluded from "claimed" — otherwise an unchanged, already-tracked
    // entry would be seen as colliding with itself and be handed a fresh
    // id purely for being rescanned (the identity trap: buildDiscoveredEntities
    // has no notion of "this is the same entity being seen again," only
    // "is this id already claimed by someone").
    const existingFolderIds = new Set<string>();

    for (const folder of this.vault.folders()) {
      if (!scannedFolderPaths.has(folder.path)) {
        existingFolderIds.add(folder.id);
      }
    }

    const existingPageIds = new Set<string>();

    for (const page of this.vault.pages()) {
      if (!scannedPagePaths.has(page.path)) {
        existingPageIds.add(page.id);
      }
    }

    const { folders, pages, reassignedPagePaths, reassignedFolderPaths } = buildDiscoveredEntities(
      scanResult,
      {
        rootIsFolder: !isVaultRoot,
        rootParentId: parentId,
        idGenerator: this.idGenerator,
        existingFolderIds,
        existingPageIds,
      },
      {
        folderBuilder: this.folderBuilder,
        pageBuilder: this.pageBuilder,
        resourceBuilder: this.resourceBuilder,
      }
    );

    for (const folder of folders) {
      // Already tracked (the common case for an already-known folder being
      // rescanned) — nothing to add. A folder some other event already
      // added mid-scan is skipped the same way, as a race guard.
      if (this.vault.getFolder(folder.id) || this.vault.getFolderByPath(folder.path)) {
        continue;
      }

      this.vault.addFolder(folder);
    }

    for (const page of pages) {
      const existingPage = this.vault.getPageByPath(page.path);

      if (existingPage) {
        // Already tracked at this exact path — reconcile its content in
        // place from the same scan data, rather than re-adding it (which
        // would also be where the identity trap above would otherwise
        // bite). Picks up an in-place content edit discovered incidentally
        // by a subtree scan, and converges any open session for it.
        const scannedPage = scannedPagesByPath.get(page.path)!;
        const parsedMarkdown: ParsedMarkdown = {
          frontmatter: scannedPage.frontmatter as ParsedMarkdown['frontmatter'],
          frontmatterAnalysis: scannedPage.frontmatterAnalysis,
          body: scannedPage.content,
          analysis: scannedPage.analysis,
        };
        const rebuiltPage = this.pageRebuilder.rebuild(existingPage, parsedMarkdown);

        this.vault.replacePage(rebuiltPage);
        this.convergeOpenSession(rebuiltPage.id, rebuiltPage.source.markdown);
        continue;
      }

      if (this.vault.getPage(page.id)) {
        continue;
      }

      this.vault.addPage(page);
      this.convergeOpenSession(page.id, page.source.markdown);
    }

    // A genuine duplicate page id within the subtree was already built
    // with a fresh id above; repair its persisted frontmatter to match, the
    // same shared write-parse-rebuild-replace helper archive-metadata
    // repair uses (Ingest itself stays read-only w.r.t. disk).
    for (const path of reassignedPagePaths) {
      const page = this.vault.getPageByPath(path);

      if (!page) {
        continue;
      }

      await persistSyncedPageDocument(
        {
          vault: this.vault,
          fileSystem: this.fileSystem,
          serializer: this.frontmatterSerializer,
          parser: this.frontmatterParser,
          rebuilder: this.pageRebuilder,
        },
        page,
        page.source.markdown
      );
    }

    // A genuine duplicate folder id: repair its .folder.md the same way —
    // one physical folder, one unique id, surviving a future rescan. Only
    // written when a .folder.md already exists (the collision is only
    // possible when one does — see resolveDuplicateId's doc comment: a
    // path-derived id can't collide with anything); never manufactures a
    // .folder.md for a folder that never had one.
    for (const path of reassignedFolderPaths) {
      const folder = this.vault.getFolderByPath(path);
      const folderMetadataPath = `${path}/.folder.md`;

      if (!folder || !(await this.fileSystem.exists(folderMetadataPath))) {
        continue;
      }

      await this.fileSystem.writeFile(
        folderMetadataPath,
        this.frontmatterSerializer.serializeFolderDocument(folder)
      );
    }

    // Removal half of the diff: anything Vault still tracks under this
    // subtree that the scan didn't rediscover no longer exists on disk.
    // Folders are removed first — Vault.removeFolder() cascades its own
    // descendants, so many stale pages are already gone by the time the
    // page loop below reaches them (guarded, not assumed).
    const subtreeFolders = [...this.vault.folders()].filter(
      (folder) => folder.path === absolutePath || VaultPath.isDescendantOf(folder.path, absolutePath)
    );

    for (const folder of subtreeFolders) {
      if (!this.vault.getFolder(folder.id)) {
        continue;
      }

      if (!scannedFolderPaths.has(folder.path)) {
        this.vault.removeFolder(folder.id);
      }
    }

    const subtreePages = [...this.vault.pages()].filter((page) =>
      VaultPath.isDescendantOf(page.path, absolutePath)
    );

    for (const page of subtreePages) {
      if (!this.vault.getPage(page.id)) {
        continue;
      }

      if (!scannedPagePaths.has(page.path)) {
        this.vault.removePage(page.id);
      }
    }
  }

  /**
   * A `.folder.md` changed in place (path unchanged) — e.g. its `status`
   * field was hand-edited to `archived` without the folder actually moving
   * into Archive/. handleMoved's folder branch already reconciles this
   * invariant when the path changes; this mirrors it for the no-move case,
   * which was previously dropped entirely (handleChanged had no folder
   * branch at all). Only `status` needs to come from the fresh read —
   * evaluateArchiveMetadataRepair only ever inspects `path`/`metadata.status`,
   * and reconcileFolderArchiveMetadata/correctFolderArchiveMetadata compute
   * the rest of the correction (archivedAt/originalPath/originalParentId)
   * themselves.
   */
  private async handleFolderMetadataChanged(absolutePath: string): Promise<void> {
    const folder = this.vault.getFolderByPath(this.directoryOf(absolutePath));

    if (!folder) {
      return;
    }

    // .folder.md can have disappeared again between the watcher event and
    // this read (e.g. raced by a folder-delete cascade) — converge as a
    // no-op instead of letting readFile() throw ENOENT, mirroring
    // reconcileFileEntity's existence guard above.
    if (!(await this.fileSystem.exists(absolutePath))) {
      return;
    }

    const fileContent = await this.fileSystem.readFile(absolutePath);
    const { frontmatter } = this.frontmatterParser.parse(fileContent);
    const status = frontmatter.status === 'archived' ? 'archived' : 'active';

    if (status === folder.metadata.status) {
      return;
    }

    const candidateFolder: Folder = {
      ...folder,
      metadata: { ...folder.metadata, status },
    };

    await reconcileFolderArchiveMetadata(
      {
        vault: this.vault,
        fileSystem: this.fileSystem,
        serializer: this.frontmatterSerializer,
      },
      candidateFolder
    );
  }

  private async handleChanged(path: string): Promise<void> {
    const absolutePath = this.resolvePath(path);

    if (VaultPath.filename(absolutePath) === '.folder.md') {
      await this.handleFolderMetadataChanged(absolutePath);
      return;
    }

    await this.reconcilePath(absolutePath);
  }

  /**
   * Commits an externally-synced revision into an open session and
   * immediately marks it saved, since it already reflects what's on disk
   * — there is nothing pending to persist. Without this, DocumentSession's
   * isDirty (`currentRevision !== savedRevision`) flips true after the
   * first external commit and never resets on its own, so the `!isDirty`
   * guard every one of this file's three commit call sites uses would
   * then block every subsequent external change to the same open page
   * until an unrelated local save happened to run. This is the one place
   * that pairing happens, shared by all three call sites rather than
   * repeated at each.
   */
  private applyExternalRevision(session: DocumentSession, markdown: string): void {
    const revision = session.commit(new DocumentTransaction(markdown));
    session.markSaved(revision);
  }

  /**
   * DocumentSession convergence as part of reconciliation, not a per-caller
   * afterthought: every place in this file that determines a page's
   * effective external content (a plain edit, a subtree scan picking up a
   * changed file, or a page rebuilt from a delete-then-create sequence)
   * calls this one method instead of separately looking up the session and
   * re-deriving the dirty guard. This is what makes session convergence
   * happen regardless of which watcher event sequence produced the new
   * content — a `changed`, an unpaired `deleted` followed by `created`, or
   * a directory-level rescan all end up here the same way.
   */
  private convergeOpenSession(pageId: string, markdown: string): void {
    const session = this.documentRegistry.get(pageId);

    if (session && !session.isDirty) {
      this.applyExternalRevision(session, markdown);
    }
  }

  /**
   * A `deleted` event is only a signal that this path may no longer exist —
   * reconcilePath() re-checks disk itself rather than assuming the event is
   * complete or accurate. This is what makes a directory-level `changed`
   * event that actually represents a deletion (a coalesced/ambiguous
   * watcher signal — see docs/architecture-specification.md §4) converge to
   * the same correct outcome as an ordinary per-path `deleted` event:
   * either way, reconcilePath finds nothing on disk and removes whatever
   * Vault still tracks there, cascading through Vault.removeFolder() for a
   * folder without this handler ever needing to enumerate descendants
   * itself.
   */
  private async handleDeleted(path: string): Promise<void> {
    const absolutePath = this.resolvePath(path);

    await this.reconcilePath(absolutePath);
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
    // them either, so this one branch reconciles both.
    //
    // ADR-026's Sync amendment: archive-metadata repair now applies to
    // folders too (an archived folder dragged out of Archive/ externally
    // must clear its own status immediately, mirroring the page branch
    // below exactly) — evaluated against the *candidate* destination
    // folder before any Vault commit, same single-mutation guarantee the
    // page branch already has, for the same reason (a subscriber must
    // never observe a "moved but still archived" intermediate state). A
    // move that doesn't need repair (the common case — an active folder,
    // or an already-archived folder moved within Archive/) falls through
    // to the original, cheaper single-notify moveFolder() path. Only the
    // moved folder's own metadata is ever touched — moveFolder()'s/
    // correctFolderArchiveMetadata()'s shared cascade updates every
    // descendant folder/page path but never their metadata; this handler
    // never enumerates them.
    const folder = this.vault.getFolderByPath(absoluteFrom);

    if (folder) {
      // The rename pairing only tells us a move was reported — it doesn't
      // guarantee the destination still holds what it did when the OS
      // paired the event (a further rapid move, or a delete, can land
      // before this handler runs). Committing moveFolder() against a
      // destination that isn't real would desync Vault from disk with no
      // event left to correct it. Fall back to reconciling both endpoints
      // against current disk/Vault state instead of trusting the stale
      // pairing — the same convergence mechanism an ordinary deleted/
      // changed event for either path would use.
      if (!(await this.fileSystem.exists(absoluteTo))) {
        await this.reconcilePath(absoluteFrom);
        await this.reconcilePath(absoluteTo);
        return;
      }

      const folderDestinationParentId = this.resolveParentId(this.directoryOf(absoluteTo));
      const resolvedFolderParentId =
        folderDestinationParentId === undefined ? folder.parentId : folderDestinationParentId;

      const candidateFolder: Folder = {
        ...folder,
        path: absoluteTo,
        parentId: resolvedFolderParentId,
      };

      const reconciledFolder = await reconcileFolderArchiveMetadata(
        {
          vault: this.vault,
          fileSystem: this.fileSystem,
          serializer: this.frontmatterSerializer,
        },
        candidateFolder
      );

      if (!reconciledFolder) {
        this.vault.moveFolder(folder.id, absoluteTo, resolvedFolderParentId);
      }

      return;
    }

    const page = this.vault.getPageByPath(absoluteFrom);

    if (!page) {
      // The 'from' half never resolved to a tracked page. An atomic save
      // (write a fresh file, then rename it over the real path — one of
      // several equivalent event patterns a save can produce, alongside a
      // plain 'changed' or a delete-then-create pair) produces exactly
      // this shape: the Rust watcher's rename pairing correlates the
      // temporary path's disappearance with the real path's
      // (re)appearance into one `moved` event, but that temporary path was
      // never vault content, so `page` above is never found. Previously
      // this fell through and the event was silently dropped — an
      // external content or frontmatter edit saved this way would never
      // reach the Vault. Reconcile the destination directly instead, the
      // same way an ordinary event would: a tracked page already at that
      // path means this was an in-place content replace; otherwise it's
      // new content arriving under a name Sync hasn't seen yet. Neither
      // branch depends on what produced the event — only on the Vault's
      // and disk's current state at the two paths involved, which is
      // exactly reconcilePath()'s contract.
      await this.reconcilePath(absoluteTo);

      return;
    }

    // Same fallback as the folder branch above: don't commit
    // updatePagePath() (or an archive-metadata repair, which would read
    // the destination file) against a path that no longer holds what the
    // watcher's rename pairing reported.
    if (!(await this.fileSystem.exists(absoluteTo))) {
      await this.reconcilePath(absoluteFrom);
      await this.reconcilePath(absoluteTo);
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

    this.convergeOpenSession(reconciled.id, reconciled.source.markdown);
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

    this.convergeOpenSession(rebuiltPage.id, rebuiltPage.source.markdown);
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

  /**
   * The one relative -> absolute conversion boundary every event handler
   * goes through (§4 of the reconciliation model). An empty relative path
   * is the vault root itself — the shape a coalesced watcher event for the
   * whole vault arrives as (Rust's relative_path() strips the root prefix,
   * leaving nothing). Without this guard, `${vault.root}/${''}` produces a
   * trailing slash that never equals any real directory entry's path (they
   * are built as `${dir}/${name}`, never with a trailing slash) — silently
   * misclassifying the root as a file and stopping reconciliation before
   * reconcileDirectorySubtree() ever runs. Every non-empty relative path
   * behaves exactly as before.
   */
  private resolvePath(relativePath: string): string {
    return relativePath === '' ? this.vault.root : `${this.vault.root}/${relativePath}`;
  }
}
