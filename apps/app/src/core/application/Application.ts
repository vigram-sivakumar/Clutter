import { Workspace } from '../workspace/Workspace';
import { Vault } from '../vault/models/Vault';
import { PageApplicationService } from './page/PageService';

/**
 * Composition root for the application layer.
 *
 * Owns the long-lived application services and shared runtime state.
 *
 * Responsibilities:
 * - Own the active Vault.
 * - Own the active Workspace.
 * - Construct application services.
 * - Provide a single entry point for the UI.
 *
 * Does NOT:
 * - Render UI.
 * - Store document content.
 * - Implement document editing.
 */
export class Application {
  public readonly workspace: Workspace;
  public readonly pageService: PageApplicationService;

  constructor(public readonly vault: Vault) {
    this.workspace = new Workspace();
    this.pageService = new PageApplicationService(this.workspace, vault);
  }
}
