import { LocalVaultProvider } from '../vault/providers/LocalFileSystem';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { VaultBuilder } from '../vault/build';
import { VaultScanner } from '../vault/discover';
import { VaultInitializer } from '../vault/initialize/VaultInitializer';
import { Workspace } from '../workspace/Workspace';
import { Vault } from '../vault/models/Vault';
import { PageApplicationService } from './page/PageApplicationService';
import { DocumentRegistry } from '../engine/DocumentRegistry';

/**
 * Composition root for the application layer.
 *
 * Owns the long-lived application services and shared runtime state.
 *
 * Responsibilities:
 * - Own the active Vault.
 * - Own the active Workspace.
 * - Own long-lived runtime services (Workspace, DocumentRegistry, application services).
 * - Own the DocumentRegistry for the lifetime of the application.
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
  public readonly pageService: PageApplicationService;

  static async open(rootPath: string): Promise<Application> {
    const fileSystem = new LocalVaultProvider();

    const initializer = new VaultInitializer(fileSystem);
    await initializer.initialize(rootPath);

    // Ensure today's landing page exists before scanning the vault.
    //
    // DailyNoteService orchestrates the daily-note workflow while PageCreator
    // owns canonical page construction (ID, timestamps, and Markdown content).
    const pageCreator = new PageCreator(new UuidGenerator(), new PageFactory());
    const dailyNotes = new DailyNoteService(fileSystem, pageCreator);
    const todayNotePath = await dailyNotes.ensureToday(rootPath);

    const scanner = new VaultScanner(fileSystem);
    const scanResult = await scanner.scan(rootPath);

    const builder = new VaultBuilder();
    const vault = builder.build(scanResult);

    const application = new Application(vault);

    const todayPage = vault.getPageByPath(todayNotePath);

    if (!todayPage) {
      throw new Error(`Failed to resolve today's daily note: ${todayNotePath}`);
    }

    application.pageService.openPage(todayPage.id);

    return application;
  }

  constructor(public readonly vault: Vault) {
    this.workspace = new Workspace();
    this.documentRegistry = new DocumentRegistry();
    this.pageService = new PageApplicationService(
      this.workspace,
      vault,
      this.documentRegistry
    );
  }
}
