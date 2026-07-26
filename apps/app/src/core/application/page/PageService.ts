import type { DocumentSession } from '../../engine/DocumentSession';
import { Vault } from '../../vault/models/Vault';
import { Workspace } from '../../workspace/Workspace';

/**
 * Coordinates page-related application operations.
 *
 * Responsibilities:
 * - Open pages.
 * - Close pages.
 * - Provide access to active document sessions.
 * - Coordinate future page commands.
 * - Coordinate workspace navigation with the document engine.
 *
 * Does NOT:
 * - Edit documents.
 * - Persist documents.
 *
 * The application layer orchestrates domain objects. It does not
 * contain the document engine itself.
 */
export class PageApplicationService {
  constructor(
    private readonly workspace: Workspace,
    private readonly vault: Vault
  ) {}

  /**
   * Opens a page for editing.
   */
  public openPage(pageId: string): DocumentSession {
    // Open the document first so workspace state is only updated
    // after the operation succeeds.
    const session = this.vault.openPage(pageId);

    this.workspace.openPage(pageId);

    return session;
  }

  /**
   * Returns the active document session for a page if it is already open.
   */
  public getSession(pageId: string): DocumentSession | undefined {
    console.log('[PageService] Opening page:', pageId);
    return this.vault.getOpenPage(pageId);
  }

  /**
   * Closes an open page.
   */
  public closePage(pageId: string): void {
    this.workspace.closePage(pageId);
    this.vault.closePage(pageId);
  }
}
