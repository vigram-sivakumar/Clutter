import { LocalVaultProvider } from '../vault/providers/LocalFileSystem';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { DailyNotePath } from './daily-notes/DailyNotePath';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { PagePathResolver } from './page/PagePathResolver';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { VaultBuilder } from '../vault/ingest';
import { VaultScanner } from '../vault/ingest';
import { VaultInitializer } from '../vault/initialize/VaultInitializer';
import { Workspace } from '../workspace/Workspace';
import { Vault } from '../vault/models/Vault';
import { VaultQuery } from '../vault/queries/VaultQuery';
import { PageOperations, SHUTDOWN_FLUSH_TIMEOUT_MS } from './page/PageOperations';
import { EffectivePageState } from './page/EffectivePageState';
import { MembershipSelector } from './membership/MembershipSelector';
import { FolderOperations } from './folder/FolderOperations';
import { TaskOperations } from './task/TaskOperations';
import { TagOperations } from './tags/TagOperations';
import {
  TAG_METADATA_RELATIVE_PATH,
  EMPTY_TAG_METADATA_FILE_CONTENTS,
} from '../vault/initialize/ReservedResources';
import { normalizeTagName, type TagMetadataEntry } from '../vault/models/Tag';
import { FolderPathResolver } from '../vault/persistence/FolderPathResolver';
import { FolderCreator } from './folder/FolderCreator';
import { NavigationRouter } from './navigation/NavigationRouter';
import { DocumentRegistry } from '../engine/DocumentRegistry';
import { SaveCoordinator } from '../engine/SaveCoordinator';
import { PagePersistenceCoordinator } from '../vault/persistence/PagePersistenceCoordinator';
import { FrontmatterSerializer } from '../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../vault/ingest/PageRebuilder';
import { MoveService } from '../vault/persistence/MoveService';
import { VaultEntryDuplicator } from '../vault/persistence/VaultEntryDuplicator';
import { LocalFileSystemWatcher } from '../vault/providers/LocalFileSystemWatcher';
import { VaultSyncService } from '../vault/sync/VaultSyncService';
import { reconcileVaultArchiveMetadata } from '../vault/sync/reconcileArchiveMetadata';
import { persistSyncedPageDocument } from '../vault/sync/persistSyncedPageDocument';
import type { VaultFileSystem } from '../vault/providers/VaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { SelfWriteAwareFileSystem } from '../vault/providers/SelfWriteAwareFileSystem';
import { SelfWriteAwareWatcher } from '../vault/providers/SelfWriteAwareWatcher';
import { attachDevTools } from '@devtools/index';

/**
 * Composition root for the application layer.
 *
 * Owns the long-lived application services and shared runtime state.
 *
 * Two-phase construction: bootstrap(rootPath) constructs Platform + Vault
 * Ingest, scans and builds the Vault, then calls attachVault() internally
 * (not from AppShell — see ADR-014). bootstrap() no longer creates today's
 * note through the Gate (ADR-017 supersedes that part of ADR-014
 * Decision 1), nor scaffolds its directory ahead of the scan (ADR-019
 * retires that too, now that DailyNoteService.ensureFolderChain
 * materializes Daily Note folders at persist time instead): navigation
 * never creates durable knowledge, not even at boot. attachVault() still
 * runs inside bootstrap() regardless, since open() needs pageOperations
 * constructed before its resolve-or-draft call below can run.
 * open() starts the watcher and resolves today's note — the real page if
 * one exists, otherwise an unpersisted draft at its deterministic path,
 * computed here rather than carried from bootstrap() (ADR-019) — the one
 * documented seam a future startup-strategy parameter would extend.
 *
 * Responsibilities:
 * - Own the active Vault.
 * - Own the active Workspace.
 * - Own long-lived runtime services (Workspace, DocumentRegistry, SaveCoordinator, PageOperations, application services like page and folder services).
 * - The composition root owns the lifetime of all runtime services used by the application.
 * - Provide a single entry point for the UI.
 *
 * Does NOT:
 * - Render UI.
 * - Store document content.
 * - Implement document editing.
 */
export class Application {
  public readonly vault: Vault;
  public readonly query: VaultQuery;
  public readonly workspace: Workspace;
  public readonly documentRegistry: DocumentRegistry;
  public readonly saveCoordinator: SaveCoordinator;
  public pageOperations!: PageOperations;
  public folderOperations!: FolderOperations;
  public taskOperations!: TaskOperations;
  public tagOperations!: TagOperations;
  public navigation!: NavigationRouter;
  public vaultSyncService!: VaultSyncService;
  public effectivePageState!: EffectivePageState;
  public membershipSelector!: MembershipSelector;
  private readonly fileSystem: VaultFileSystem;
  private readonly selfWriteRegistry: SelfWriteRegistry;
  private fileSystemWatcher!: LocalFileSystemWatcher;
  private rootPath!: string;
  private closed = false;
  private workspaceVaultReconciliationUnsubscribe!: () => void;

  static async bootstrap(rootPath: string): Promise<Application> {
    // Shared between the write side (SelfWriteAwareFileSystem) and the read
    // side (SelfWriteAwareWatcher) so the filesystem watcher can recognize
    // and drop its own echo of a write this app just made, instead of
    // VaultSyncService re-processing it as a second, duplicate change.
    const selfWriteRegistry = new SelfWriteRegistry();
    const rawFileSystem = new LocalVaultProvider(rootPath);
    const fileSystem = new SelfWriteAwareFileSystem(
      rawFileSystem,
      selfWriteRegistry,
      rootPath
    );

    const initializer = new VaultInitializer(fileSystem);
    await initializer.initialize(rootPath);

    const dailyNotes = new DailyNoteService();

    const scanner = new VaultScanner(fileSystem);
    const scanResult = await scanner.scan(rootPath);

    // Tag presentation metadata (icon today, color later) is read directly
    // here, once, the same way VaultInitializer already reads/writes
    // .clutter/workspace.json — not through VaultScanner (this isn't Page/
    // Folder content) and not through a dedicated loader (one reader, one
    // writer, plain JSON: see TagOperations for why that doesn't warrant
    // its own module). TagBuilder never sees the JSON shape — it only ever
    // receives this already-parsed, already-normalized Map.
    const tagsMetadataPath = `${rootPath}/${TAG_METADATA_RELATIVE_PATH}`;
    const rawTagMetadata = (
      JSON.parse(
        (await fileSystem.exists(tagsMetadataPath))
          ? await fileSystem.readFile(tagsMetadataPath)
          : EMPTY_TAG_METADATA_FILE_CONTENTS
      ).tags ?? {}
    ) as Record<string, TagMetadataEntry>;
    const tagMetadata = new Map<string, TagMetadataEntry>(
      Object.entries(rawTagMetadata).map(([key, value]) => [
        normalizeTagName(key),
        value,
      ])
    );

    const builder = new VaultBuilder(new UuidGenerator());
    const { vault, reassignedPagePaths, reassignedFolderPaths } = builder.build(
      scanResult,
      tagMetadata
    );

    // A genuine duplicate id discovered during the initial scan was already
    // given a fresh id in-memory (VaultBuilder); repair the duplicate
    // file's own persisted frontmatter to match, the same way archive
    // metadata is repaired below — Ingest itself never writes to disk.
    for (const path of reassignedPagePaths) {
      const page = vault.getPageByPath(path);

      if (!page) {
        continue;
      }

      await persistSyncedPageDocument(
        {
          vault,
          fileSystem,
          serializer: new FrontmatterSerializer(),
          parser: new FrontmatterParser(),
          rebuilder: new PageRebuilder(),
        },
        page,
        page.source.markdown
      );
    }

    // Same repair, for a genuine duplicate folder id — written only when a
    // .folder.md already exists (see VaultSyncService's identical guard);
    // never manufactures one for a folder that never had it.
    const folderFrontmatterSerializer = new FrontmatterSerializer();

    for (const path of reassignedFolderPaths) {
      const folder = vault.getFolderByPath(path);
      const folderMetadataPath = `${path}/.folder.md`;

      if (!folder || !(await fileSystem.exists(folderMetadataPath))) {
        continue;
      }

      await fileSystem.writeFile(
        folderMetadataPath,
        folderFrontmatterSerializer.serializeFolderDocument(folder)
      );
    }

    await reconcileVaultArchiveMetadata({
      vault,
      fileSystem,
      serializer: new FrontmatterSerializer(),
      parser: new FrontmatterParser(),
      rebuilder: new PageRebuilder(),
    });

    const application = new Application(vault, fileSystem, selfWriteRegistry);

    application.rootPath = rootPath;

    const pageCreator = new PageCreator(new UuidGenerator(), new PageFactory());

    application.attachVault(vault, pageCreator, dailyNotes, rawFileSystem);

    // ADR-017/ADR-019: today's note is no longer created through the Gate,
    // and no directory is scaffolded for it, here. open() below resolves
    // it — the real page if the scan found one, or an unpersisted draft at
    // its deterministic path otherwise — never a boot-time write.
    // dailyNotes.ensurePage() (the Gate-writing method ADR-017 replaced)
    // and ensureDirectoryForToday() (the scaffolding ADR-019 replaced) are
    // both retired.

    return application;
  }

  constructor(
    vault: Vault,
    fileSystem: VaultFileSystem,
    selfWriteRegistry: SelfWriteRegistry
  ) {
    this.vault = vault;
    // Constructed once, here, per ARCHITECTURE_RULES.md rule 6 — UI reads
    // through this shared instance via props, never by constructing its
    // own VaultQuery(vault) locally.
    this.query = new VaultQuery(vault);
    this.fileSystem = fileSystem;
    this.selfWriteRegistry = selfWriteRegistry;
    this.workspace = new Workspace();
    this.documentRegistry = new DocumentRegistry();
    this.saveCoordinator = new SaveCoordinator();
  }

  /**
   * Constructs every subsystem that needs a live Vault. Called once,
   * internally, at the end of bootstrap() — not by AppShell — since
   * bootstrap() needs the fully-attached Gate before it can ensure today's
   * daily note through it. Kept as its own method, matching the frozen
   * spec's public shape, so the two construction phases stay a named,
   * testable seam rather than one undifferentiated block.
   */
  public attachVault(
    vault: Vault,
    pageCreator: PageCreator,
    dailyNoteService: DailyNoteService,
    // ADR-028: Duplicate's raw filesystem copy must be observed by the
    // watcher, not suppressed as a self-write, so it needs the raw
    // VaultFileSystem — never `this.fileSystem` (the self-write-aware
    // wrapper every other collaborator here writes through). Defaults to
    // `this.fileSystem` only so existing attachVault() call sites in
    // tests, which don't exercise duplicate() and construct Application
    // with a single unwrapped fake, are unaffected.
    rawFileSystem: VaultFileSystem = this.fileSystem
  ): void {
    const moveService = new MoveService(vault, this.fileSystem);
    const duplicator = new VaultEntryDuplicator(rawFileSystem);

    // Single instance shared by PageOperations for both edit-save and
    // structural mutations, so every write to a given page is serialized
    // through the same per-page queue.
    const frontmatterSerializer = new FrontmatterSerializer();
    const persistenceCoordinator = new PagePersistenceCoordinator(
      this.fileSystem,
      vault,
      frontmatterSerializer,
      new FrontmatterParser(),
      new PageRebuilder(),
      moveService
    );

    // Constructed before PageOperations: PageOperations' Daily Note persist
    // path (DailyNoteService.ensureFolderChain) needs a real FolderOperations
    // to materialize missing year/month folders — the same instance
    // NavigationRouter already depends on below, not a second one.
    //
    // prepareNavigation resolves this.pageOperations lazily (via `this`,
    // not a captured local) — FolderOperations is constructed before
    // PageOperations exists, the same construction-order constraint
    // SaveCoordinator's timer callback already works around (M5). The
    // closure itself is a bare forward with no decision in it — the
    // actual "what should happen before navigation" logic lives in
    // PageOperations.flushActivePage(), not here (spec §11's own
    // invariant against business logic in the Composition Root).
    this.folderOperations = new FolderOperations(
      vault,
      this.workspace,
      persistenceCoordinator,
      new FolderPathResolver(vault),
      new FolderCreator(new UuidGenerator()),
      () => this.pageOperations.flushActivePage(),
      this.documentRegistry,
      this.saveCoordinator,
      // ADR-025's fallback hook, shared verbatim with PageOperations below —
      // post-delete-navigation consistency fix: the same closure, not a
      // second implementation of "what's the fallback page."
      () => {
        void this.openFallbackPage();
      },
      duplicator
    );
    this.pageOperations = new PageOperations(
      vault,
      this.workspace,
      this.documentRegistry,
      this.saveCoordinator,
      persistenceCoordinator,
      new PagePathResolver(vault),
      pageCreator,
      this.folderOperations,
      dailyNoteService,
      // ADR-025: same lazy-`this`-closure shape as FolderOperations'
      // prepareNavigation hook above — PageOperations is constructed
      // before openFallbackPage() has any reason to exist as anything but
      // a method on `this`, and the closure itself decides nothing (the
      // fallback-page policy lives entirely in openFallbackPage() below).
      () => {
        void this.openFallbackPage();
      },
      duplicator
    );
    this.navigation = new NavigationRouter(
      this.folderOperations,
      this.pageOperations,
      vault,
      this.workspace
    );
    // Same Gate instance every other facade writes through — a task
    // mutation is just another 'save' kind, never a second write path.
    this.taskOperations = new TaskOperations(vault, persistenceCoordinator);
    // Not Gate-backed, deliberately — tag metadata is presentation
    // configuration (.clutter/tags.json), not Vault domain content, so it
    // is outside the Persistence Gate's scope (ARCHITECTURE_RULES.md rule
    // 2). TagOperations talks to VaultFileSystem directly, same as
    // VaultInitializer already does for .clutter/workspace.json.
    this.tagOperations = new TagOperations(vault, this.fileSystem, this.rootPath);
    // ADR-020: constructed after query/workspace/pageOperations all exist
    // above — the projection reconciling Vault (Durable) with
    // PageOperations/DocumentEditing (Committed) state. No production
    // consumer yet; this milestone only wires its lifecycle.
    this.effectivePageState = new EffectivePageState(
      vault,
      this.query,
      this.pageOperations,
      this.workspace
    );
    // ADR-023: the read-side classification layer — for a page/folder plus
    // a named product concept (Notes, Daily Notes, a system folder,
    // Archive), the one place that decides membership. Constructed after
    // query/effectivePageState, its only inputs. Workspace-folder
    // membership (FolderTree, toCollectionPageModel) is its first migrated
    // consumer (Phase 2 of the ADR's rollout).
    this.membershipSelector = new MembershipSelector(
      vault,
      this.query,
      this.effectivePageState
    );
    this.fileSystemWatcher = new LocalFileSystemWatcher();

    // VaultSyncService subscribes to the self-write-aware wrapper, not the
    // raw watcher, so it never sees an echo of a write PagePersistenceCoordinator
    // just made through the equally-wrapped `fileSystem` above. The raw
    // watcher itself is still what owns the Tauri subscription/start/stop
    // lifecycle below.
    const syncWatcher = new SelfWriteAwareWatcher(
      this.fileSystemWatcher,
      this.selfWriteRegistry
    );
    this.vaultSyncService = new VaultSyncService(
      vault,
      this.fileSystem,
      syncWatcher,
      this.documentRegistry,
      frontmatterSerializer,
      new UuidGenerator()
    );

    // Recovers from an external deletion (Sync's handleDeleted, or any
    // other Vault mutation) removing the page/folder Workspace currently
    // has active — e.g. deleting the open Archive folder, or any other
    // folder/note, out from under the app in Finder. VaultSyncService
    // stays filesystem->Vault only (no Workspace/navigation knowledge) and
    // Workspace stays Vault-oblivious (no Vault dependency); this is the
    // one Application-owned seam that already holds both, reusing the
    // same close()-then-fallback-if-empty shape PageOperations.delete()/
    // FolderOperations.delete() already use, verbatim, keyed only on "does
    // the active id still exist" — no per-folder or Archive-specific
    // branch. Registered last, after every Vault mutation that happens
    // during boot/scan has already settled and before Workspace has any
    // active id (open() runs after attachVault() returns), so it cannot
    // observe a stale id and redirect before a real selection exists.
    this.workspaceVaultReconciliationUnsubscribe = vault.subscribe(() => {
      const { activePageId, activeFolderId } = this.workspace;

      if (activePageId && !vault.getPage(activePageId)) {
        this.workspace.closePage(activePageId);
      } else if (activeFolderId && !vault.getFolder(activeFolderId)) {
        this.workspace.closeFolder(activeFolderId);
      }

      if (!this.workspace.activeView) {
        void this.openFallbackPage();
      }
    });

    // Optional, dev-only: exposes window.__clutter_devtools for e2e tests.
    // No-op unless import.meta.env.DEV && VITE_DEVTOOLS=true (see attachDevTools).
    attachDevTools(this);
  }

  /**
   * Starts the filesystem watcher, then opens the fallback page to decide
   * what shows at boot (see openFallbackPage() below).
   */
  public async open(): Promise<void> {
    await this.fileSystemWatcher.start(this.rootPath);

    void this.openFallbackPage();
  }

  /**
   * The application's fallback-page policy (ADR-025, following up on the
   * seam ADR-019 named): currently always today's Daily Note, opening the
   * real Vault page if one exists, otherwise an unpersisted draft at its
   * deterministic path (ADR-017 §7/Decision item 7). The path is computed
   * here, not cached (ADR-019) — no directory is scaffolded for it ahead
   * of time; PageOperations.openAtPath()'s draft-promotion path
   * materializes the Daily Note's folder chain on first save, via
   * DailyNoteService.ensureFolderChain. Never writes through the Gate
   * itself.
   *
   * Two callers: open() at boot, and PageOperations.delete() (via the
   * constructor-injected callback in attachVault()) when deleting the
   * active page leaves the workspace with no page/folder to fall back to.
   * Neither caller — nor PageOperations itself — knows what the fallback
   * page is; that decision lives only here, matching ADR-019's framing of
   * this as the Composition Root's one documented seam for a future
   * startup-strategy choice (Open Today's Note / Restore Last Session /
   * Open Empty Workspace) — not implemented yet, so today's Daily Note is
   * still the only branch.
   */
  private async openFallbackPage(): Promise<void> {
    const todayNotePath = DailyNotePath.absoluteFrom(this.vault.root, new Date());
    const todayPage = this.vault.getPageByPath(todayNotePath);

    if (todayPage) {
      void this.pageOperations.open(todayPage.id);
      return;
    }

    void this.pageOperations.openAtPath(todayNotePath, {
      type: 'daily-note',
    });
  }

  /**
   * Tears down the runtime graph this composition root created.
   *
   * Flushes every dirty or in-flight page first — while every session is
   * still live — then stops accepting filesystem events so no partially-
   * destroyed service can react to a late-arriving change, then disposes
   * subscriptions, then cancels timers and releases remaining state.
   * flushAll() must run before everything else here, not after: once
   * DocumentRegistry.clear() disposes every session (M1/M4), further
   * commit()/beginSave()/markSaved()/markSaveFailed() calls become inert
   * and there would be nothing left to flush.
   *
   * This is the orderly-shutdown entry point (autosave-execution-model.md
   * §7) — it knows nothing about *why* it's being called (window close,
   * app quit, a future vault-switch flow) or how that event is detected;
   * that's the caller's job (see AppShell.tsx's Tauri close-request
   * handling), kept deliberately outside this class so Application never
   * needs to import a platform/window API.
   *
   * Idempotent: safe to call more than once (React Strict Mode, repeated
   * unmounts, or an eventual vault-switch flow may all call this).
   */
  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    await this.pageOperations.flushAll(SHUTDOWN_FLUSH_TIMEOUT_MS);
    await this.folderOperations.flushAll(SHUTDOWN_FLUSH_TIMEOUT_MS);
    await this.fileSystemWatcher.stop();
    this.vaultSyncService.dispose();
    // Cancel every armed autosave timer before dropping the sessions they
    // belong to — documentRegistry.clear() disposes each session but has
    // no concept of timers, and PageOperations.close()/delete() (the
    // usual place timers are cancelled) is never called for this
    // whole-vault teardown path. Found during M5's pre-implementation
    // audit (autosave-execution-model.md §5's "cleared at the same moment
    // the session is marked Disposed" applies here too, not just to the
    // single-session close() path).
    this.saveCoordinator.cancelAllTimers();
    // ADR-020 §5: must run before documentRegistry.clear() below — the
    // projection holds live DocumentSession subscriptions, and clear()
    // disposes every session, after which further interaction with them
    // is inert. Same ordering constraint flushAll() documents for itself
    // above, applied to a second consumer of the same resource.
    this.effectivePageState.dispose();
    this.workspaceVaultReconciliationUnsubscribe();
    this.documentRegistry.clear();
  }
}
