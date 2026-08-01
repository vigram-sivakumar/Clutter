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
import { PageOperations } from './page/PageOperations';
import { FolderOperations } from './folder/FolderOperations';
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
 * Ingest, ensures today's Daily Notes directory exists, scans and builds
 * the Vault, then calls attachVault() internally (not from AppShell, as the
 * frozen spec's literal Startup sequence describes — see ADR-014 for why)
 * so today's daily note can be created through the real Persistence Gate
 * before bootstrap() returns, with no bypass and an accurate parentId.
 * open() starts the watcher and opens today's note.
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
  public readonly workspace: Workspace;
  public readonly documentRegistry: DocumentRegistry;
  public readonly saveCoordinator: SaveCoordinator;
  public pageOperations!: PageOperations;
  public folderOperations!: FolderOperations;
  public navigation!: NavigationRouter;
  public vaultSyncService!: VaultSyncService;
  private readonly fileSystem: VaultFileSystem;
  private readonly selfWriteRegistry: SelfWriteRegistry;
  private persistenceCoordinator!: PagePersistenceCoordinator;
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

    application.attachVault(vault, pageCreator);

    // Now that the real Gate exists, ensure today's note exists through it —
    // no bypass, and an accurate parentId, since the directory ensured
    // above was part of this same scan.
    await dailyNotes.ensurePage(
      todayNotePath,
      vault,
      application.persistenceCoordinator,
      pageCreator
    );

    return application;
  }

  constructor(
    vault: Vault,
    fileSystem: VaultFileSystem,
    selfWriteRegistry: SelfWriteRegistry
  ) {
    this.vault = vault;
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
  public attachVault(vault: Vault, pageCreator: PageCreator): void {
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

    this.persistenceCoordinator = persistenceCoordinator;

    this.pageOperations = new PageOperations(
      vault,
      this.workspace,
      this.documentRegistry,
      this.saveCoordinator,
      persistenceCoordinator,
      new PagePathResolver(vault),
      pageCreator
    );
    this.folderOperations = new FolderOperations(vault, this.workspace);
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
   * Starts the filesystem watcher and opens today's daily note. Everything
   * this needs (the Gate, today's note guaranteed to exist) was already
   * constructed/ensured by bootstrap().
   */
  public async open(): Promise<void> {
    await this.fileSystemWatcher.start(this.rootPath);

    const todayPage = this.vault.getPageByPath(this.todayNotePath);

    if (!todayPage) {
      throw new Error(
        `Failed to resolve today's daily note: ${this.todayNotePath}`
      );
    }

    void this.pageOperations.open(todayPage.id);
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
