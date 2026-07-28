import type { DocumentSession } from '../../engine/DocumentSession';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { Vault } from '../../vault/models/Vault';
import { Workspace } from '../../workspace/Workspace';
import { DocumentTransaction } from '../../engine/DocumentTransaction';

/**
 * Coordinates page-related application operations and owns the application-level lifecycle of an open page.
 *
 * Responsibilities:
 * - Open pages/documents and manage their lifecycle.
 * - Coordinate page navigation and document session management.
 * - Validate the page exists before updating the workspace.
 *
 * Does NOT:
 * - Edit pages.
 * - Persist pages.
 * - Generate page content.
 *
 * This service orchestrates domain objects and manages navigation and sessions,
 * but does not own editing or persistence concerns.
 */
export class PageApplicationService {
  constructor(
    private readonly workspace: Workspace,
    private readonly vault: Vault,
    private readonly documentRegistry: DocumentRegistry,
    private readonly saveCoordinator: SaveCoordinator
  ) {}

  /**
   * Opens a page and returns its document session.
   */
  public openPage(pageId: string): DocumentSession {
    const page = this.vault.getPage(pageId);
    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }
    const session = this.documentRegistry.open(page);
    this.workspace.openPage(pageId);
    return session;
  }

  /**
   * Gets the document session for a page, if it exists.
   */
  public getSession(pageId: string): DocumentSession | undefined {
    return this.documentRegistry.get(pageId);
  }

  // The SaveCoordinator dependency is intentionally injected before the
  // editing pipeline is implemented so the application dependency graph is
  // established before behavior is added.
  /**
   * Renames an open page.
   *
   * TODO: Implement the editing pipeline.
   *
   * Target flow:
   * - Resolve the existing DocumentSession.
   * - Validate the requested title.
   * - Create a DocumentTransaction.
   * - Commit the transaction through DocumentSession.
   * - Delegate persistence to SaveCoordinator.
   *
   * This service owns the application workflow. It must not write directly to
   * the Vault or filesystem.
   */
  public renamePage(pageId: string, title: string): void {
    void pageId;
    void title;

    throw new Error('Not implemented');
  }

  /**
   * Updates the Markdown content of an open page.
   *
   * This is the first editing command in the application layer.
   *
   * Target flow:
   * - Resolve the existing DocumentSession.
   * - Validate the session exists.
   * - Create a DocumentTransaction containing the proposed Markdown.
   * - Commit the transaction through DocumentSession.
   * - Begin the save lifecycle through SaveCoordinator.
   *
   * Persistence remains the responsibility of SaveCoordinator.
   * This service coordinates the workflow but never writes directly to the Vault
   * or filesystem.
   */
  public updateMarkdown(pageId: string, markdown: string): void {
    const session = this.documentRegistry.get(pageId);
    if (!session) {
      throw new Error(`No open document session for page: ${pageId}`);
    }
    const transaction = new DocumentTransaction(markdown);
    session.commit(transaction);
    this.saveCoordinator.beginSave(session);
    // Persistence is intentionally stubbed; do not call completeSave or write to filesystem/vault.
  }

  /**
   * Closes a page and its document session.
   *
   * Currently, this method closes both the workspace entry and the document session.
   *
   * TODO: Before disposing a session, this method will eventually be responsible for checking
   * whether the associated DocumentSession contains unsaved changes and coordinating any confirmation workflow.
   *
   * The DocumentRegistry intentionally remains a passive lifetime manager and should not decide
   * whether a session is allowed to close.
   */
  public closePage(pageId: string): void {
    this.workspace.closePage(pageId);
    // Session disposal is unconditional today.
    // Future dirty-session confirmation belongs in the application layer before
    // invoking DocumentRegistry.close().
    this.documentRegistry.close(pageId);
  }
}
