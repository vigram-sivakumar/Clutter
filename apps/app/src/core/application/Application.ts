import { LocalVaultProvider } from '../vault/providers/LocalFileSystem';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { PagePathResolver } from './page/PagePathResolver';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { VaultBuilder } from '../vault/build';
import { VaultScanner } from '../vault/discover';
import { VaultInitializer } from '../vault/initialize/VaultInitializer';
import { Workspace } from '../workspace/Workspace';
import { Vault } from '../vault/models/Vault';
import { PageOperations } from './page/PageOperations';
import { FolderApplicationService } from './folder/FolderApplicationService';
import { NavigationService } from './navigation/NavigationService';
import { DocumentRegistry } from '../engine/DocumentRegistry';
import { SaveCoordinator } from '../engine/SaveCoordinator';
import { PagePersistenceCoordinator } from './persistence/PagePersistenceCoordinator';
import { FrontmatterSerializer } from '../vault/understand/FrontmatterSerializer';
import { FrontmatterParser } from '../vault/understand/FrontmatterParser';
import { PageRebuilder } from '../vault/build/PageRebuilder';
import { MoveService } from './move/MoveService';
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
  public readonly workspace: Workspace;
  public readonly documentRegistry: DocumentRegistry;
  public readonly saveCoordinator: SaveCoordinator;
  public readonly pageOperations: PageOperations;
  public readonly folderService: FolderApplicationService;
  public readonly navigation: NavigationService;
  public readonly vaultSyncService: VaultSyncService;
  private readonly fileSystemWatcher: LocalFileSystemWatcher;
  private closed = false;

  static async open(rootPath: string): Promise<Application> {
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

    // Ensure today's landing page exists before scanning the vault.
    //
    // DailyNoteService orchestrates the daily-note workflow while PageCreator
    // owns canonical page construction (ID, timestamps, and Markdown content).
    // This same PageCreator instance is threaded into the instance
    // constructor below and reused by PageOperations.create() — one
    // instance for both the pre-Vault bootstrap and the running app, not
    // two independently-constructed ones.
    const pageCreator = new PageCreator(new UuidGenerator(), new PageFactory());
    const dailyNotes = new DailyNoteService(fileSystem, pageCreator);
    const todayNotePath = await dailyNotes.ensureToday(rootPath);

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

    const application = new Application(
      vault,
      fileSystem,
      selfWriteRegistry,
      pageCreator
    );

    await application.startFileSystemWatcher(rootPath);

    const todayPage = vault.getPageByPath(todayNotePath);

    if (!todayPage) {
      throw new Error(`Failed to resolve today's daily note: ${todayNotePath}`);
    }

    application.navigation.openDailyNote(todayPage.id);

    return application;
  }

  constructor(
    public readonly vault: Vault,
    private readonly fileSystem: VaultFileSystem,
    private readonly selfWriteRegistry: SelfWriteRegistry,
    pageCreator: PageCreator
  ) {
    this.workspace = new Workspace();
    this.documentRegistry = new DocumentRegistry();
    this.saveCoordinator = new SaveCoordinator();

    const moveService = new MoveService(this.vault, this.fileSystem);

    // Single instance shared by PageOperations for both edit-save and
    // structural mutations, so every write to a given page is serialized
    // through the same per-page queue.
    const frontmatterSerializer = new FrontmatterSerializer();
    const persistenceCoordinator = new PagePersistenceCoordinator(
      this.fileSystem,
      this.vault,
      frontmatterSerializer,
      new FrontmatterParser(),
      new PageRebuilder(),
      moveService
    );

    this.pageOperations = new PageOperations(
      vault,
      this.workspace,
      this.documentRegistry,
      this.saveCoordinator,
      persistenceCoordinator,
      new PagePathResolver(vault),
      pageCreator
    );
    this.folderService = new FolderApplicationService(this.workspace, vault);
    this.navigation = new NavigationService(
      this.pageOperations,
      this.folderService,
      vault
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
      frontmatterSerializer
    );
  }

  private async startFileSystemWatcher(rootPath: string): Promise<void> {
    await this.fileSystemWatcher.start(rootPath);
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
