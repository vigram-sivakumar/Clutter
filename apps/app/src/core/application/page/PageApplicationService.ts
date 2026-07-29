import type { DocumentSession } from '../../engine/DocumentSession';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { Vault } from '../../vault/models/Vault';
import { Workspace } from '../../workspace/Workspace';
import { DocumentTransaction } from '../../engine/DocumentTransaction';
import { PersistenceService } from '../persistence/PersistenceService';

/**
 * Coordinates page-related application operations and owns the application-level lifecycle of an open page.
 *
 * Responsibilities:
 * - Open pages/documents and manage their lifecycle.
 * - Coordinate page navigation and document session management.
 * - Validate the page exists before updating the workspace.
 * - Enforce that archived pages are view-only: opening an archived page is
 *   always allowed, but editing one is rejected until it is restored. This
 *   is an application-level policy, not a Vault, persistence, or
 *   DocumentSession rule — none of those layers know what "archived" means.
 *

 * Does NOT:
 * - Edit pages.
 * - Perform filesystem persistence directly.
 * - Generate page content.
 *
 * This service orchestrates domain objects and manages navigation and sessions,
 * but does not own editing or persistence concerns.
 *
 * Persistence is delegated to PersistenceService after the save lifecycle begins.
 */
export class PageApplicationService {
  constructor(
    private readonly workspace: Workspace,
    private readonly vault: Vault,
    private readonly documentRegistry: DocumentRegistry,
    private readonly saveCoordinator: SaveCoordinator,
    private readonly _persistenceService: PersistenceService
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
   * - Begin the save lifecycle through SaveCoordinator.
   * - Delegate persistence to PersistenceService.
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
   * - Validate the page is not archived (archived pages are view-only until
   *   restored; see the class-level note on archived-page editing).
   * - Create a DocumentTransaction containing the proposed Markdown.
   * - Commit the transaction through DocumentSession.
   * - Begin the save lifecycle through SaveCoordinator.
   *
   * Persistence remains the responsibility of PersistenceService after SaveCoordinator begins the save lifecycle.
   * This service coordinates the workflow but never writes directly to the Vault
   * or filesystem.
   *
   * The archived-page check re-reads the page from the Vault rather than
   * trusting the DocumentSession's own snapshot, so a page archived after
   * its session was opened is caught on the very next edit attempt — no
   * separate "was this session's page archived while open" bookkeeping is
   * needed.
   */
  public updateMarkdown(pageId: string, markdown: string): void {
    const session = this.documentRegistry.get(pageId);
    if (!session) {
      throw new Error(`No open document session for page: ${pageId}`);
    }

    const page = this.vault.getPage(pageId);
    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    if (page.metadata.status === 'archived') {
      throw new Error(
        `Cannot edit archived page: ${pageId}. Restore it before editing.`
      );
    }

    const transaction = new DocumentTransaction(markdown);
    session.commit(transaction);

    this.saveCoordinator.beginSave(session);

    const revision = session.currentRevision;

    // Persistence currently completes only the save lifecycle.
    // Filesystem persistence will be introduced incrementally.
    void this._persistenceService.save(session, revision);
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
