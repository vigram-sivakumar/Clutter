import { LocalVaultProvider } from '../vault/providers/LocalFileSystem';
import { DailyNoteService } from './daily-notes/DailyNoteService';
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
import { PageOperations } from './page/PageOperations';
import { FolderOperations } from './folder/FolderOperations';
import { FolderPathResolver } from './folder/FolderPathResolver';
import { FolderCreator } from './folder/FolderCreator';
import { NavigationRouter } from './navigation/NavigationRouter';
import { DocumentRegistry } from '../engine/DocumentRegistry';
import { SaveCoordinator } from '../engine/SaveCoordinator';
import { PagePersistenceCoordinator } from '../vault/persistence/PagePersistenceCoordinator';
import { FrontmatterSerializer } from '../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../vault/ingest/PageRebuilder';
import { MoveService } from '../vault/persistence/MoveService';
import { LocalFileSystemWatcher } from '../vault/providers/LocalFileSystemWatcher';
import { VaultSyncService } from '../vault/sync/VaultSyncService';
import { reconcileVaultArchiveMetadata } from '../vault/sync/reconcileArchiveMetadata';
import type { VaultFileSystem } from '../vault/providers/VaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { SelfWriteAwareFileSystem } from '../vault/providers/SelfWriteAwareFileSystem';
import { SelfWriteAwareWatcher } from '../vault/providers/SelfWriteAwareWatcher';

/**
 * Composition root for the application layer.
 *
 * Owns the long-lived application services and shared runtime state.
 *
 * Two-phase construction: bootstrap(rootPath) constructs Platform + Vault
 * Ingest, ensures today's Daily Notes directory exists (structural
 * scaffolding only — see DailyNoteService), scans and builds the Vault,
 * then calls attachVault() internally (not from AppShell — see ADR-014).
 * bootstrap() no longer creates today's note through the Gate (ADR-017
 * supersedes that part of ADR-014 Decision 1): navigation never creates
 * durable knowledge, not even at boot. attachVault() still runs inside
 * bootstrap() regardless, since open() needs pageOperations constructed
 * before its resolve-or-draft call below can run.
 * open() starts the watcher and resolves today's note — the real page if
 * one exists, otherwise an unpersisted draft at its deterministic path.
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
  public navigation!: NavigationRouter;
  public vaultSyncService!: VaultSyncService;
  private readonly fileSystem: VaultFileSystem;
  private readonly selfWriteRegistry: SelfWriteRegistry;
  private fileSystemWatcher!: LocalFileSystemWatcher;
  private rootPath!: string;
  private todayNotePath!: string;
  private closed = false;

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

    // Ensure today's Daily Notes year/month directory exists before
    // scanning, so the scan discovers it as a real Folder rather than
    // requiring a synthesized parentId for one that doesn't exist yet.
    // Directory scaffolding only, the same class of pre-Vault operation
    // VaultInitializer already performs above for reserved folders — the
    // note's own content is created below, through the real Gate, once one
    // exists.
    const dailyNotes = new DailyNoteService(fileSystem);
    const todayNotePath = await dailyNotes.ensureDirectoryForToday(rootPath);

    const scanner = new VaultScanner(fileSystem);
    const scanResult = await scanner.scan(rootPath);

    const builder = new VaultBuilder();
    const vault = builder.build(scanResult);

    await reconcileVaultArchiveMetadata({
      vault,
      fileSystem,
      serializer: new FrontmatterSerializer(),
      parser: new FrontmatterParser(),
      rebuilder: new PageRebuilder(),
    });

    const application = new Application(vault, fileSystem, selfWriteRegistry);

    application.rootPath = rootPath;
    application.todayNotePath = todayNotePath;

    const pageCreator = new PageCreator(new UuidGenerator(), new PageFactory());

    application.attachVault(vault, pageCreator, dailyNotes);

    // ADR-017: today's note is no longer created through the Gate here.
    // open() below resolves it — the real page if the scan found one, or
    // an unpersisted draft at todayNotePath otherwise — never a boot-time
    // write. dailyNotes.ensurePage() (the Gate-writing method this
    // replaced) is retired.

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
    dailyNoteService: DailyNoteService
  ): void {
    const moveService = new MoveService(vault, this.fileSystem);

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
    this.folderOperations = new FolderOperations(
      vault,
      this.workspace,
      persistenceCoordinator,
      new FolderPathResolver(vault),
      new FolderCreator(new UuidGenerator())
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
      dailyNoteService
    );
    this.navigation = new NavigationRouter(this.folderOperations, vault);
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
      frontmatterSerializer
    );
  }

  /**
   * Starts the filesystem watcher and resolves today's daily note —
   * opening the real Vault page if the startup scan found one, otherwise
   * opening an unpersisted draft at the deterministic path bootstrap()
   * already ensured a directory for (ADR-017 §7/Decision item 7). Never
   * writes through the Gate itself; PageOperations.openAtPath() decides
   * that, on first save, same as every other draft.
   */
  public async open(): Promise<void> {
    await this.fileSystemWatcher.start(this.rootPath);

    const todayPage = this.vault.getPageByPath(this.todayNotePath);

    if (todayPage) {
      void this.pageOperations.open(todayPage.id);
      return;
    }

    void this.pageOperations.openAtPath(this.todayNotePath, {
      type: 'daily-note',
    });
  }

  /**
   * Tears down the runtime graph this composition root created.
   *
   * Stops accepting filesystem events first so no partially-destroyed
   * service can react to a late-arriving change, then disposes
   * subscriptions, then releases remaining state.
   *
   * Idempotent: safe to call more than once (React Strict Mode, repeated
   * unmounts, or an eventual vault-switch flow may all call this).
   */
  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    await this.fileSystemWatcher.stop();
    this.vaultSyncService.dispose();
    this.documentRegistry.clear();
  }
}
