import type { DocumentSession } from '../../engine/DocumentSession';
import { Vault } from '../../vault/models/Vault';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';

/**
 * Coordinates page-related application operations.
 *
 * Responsibilities:
 * - Open pages.
 * - Close pages.
 * - Provide access to active document sessions.
 * - Coordinate page-related application operations.
 * - Coordinate workspace navigation with the document engine.
 *
 * Does NOT:
 * - Edit documents.
 * - Construct Markdown or frontmatter directly.
 * - Persist documents.
 * - Generate page content.
 *
 * The application layer orchestrates domain objects. It does not
 * contain the document engine itself.
 */
export class PageApplicationService {
  constructor(
    private readonly workspace: Workspace,
    private readonly vault: Vault,
    private readonly documentRegistry: DocumentRegistry
  ) {}

  /**
   * Opens a page for editing.
   */
  // Future page creation will be introduced here once the application
  // owns the complete create-page workflow.
  public openPage(pageId: string): DocumentSession {
    // Open the document first so workspace state is only updated
    // after the operation succeeds.
    const page = this.vault.getPage(pageId);

    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    const session = this.documentRegistry.open(page);

    this.workspace.openPage(pageId);

    return session;
  }

  /**
   * Returns the active document session for a page if it is already open.
   */
  public getSession(pageId: string): DocumentSession | undefined {
    return this.documentRegistry.get(pageId);
  }

  /**
   * Closes an open page.
   */
  public closePage(pageId: string): void {
    this.workspace.closePage(pageId);
    this.documentRegistry.close(pageId);
  }
}
