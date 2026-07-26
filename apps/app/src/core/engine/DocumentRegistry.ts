import type { Page } from '../vault/models';
import { DocumentSession } from './DocumentSession';
/**
 * Manages the collection of active document sessions.
 *
 * Responsibilities:
 * - Create DocumentSessions.
 * - Return existing sessions for already-open pages.
 * - Ensure only one DocumentSession exists per page.
 * - Attach and detach views.
 * - Dispose inactive sessions.
 *
 * Does NOT:
 * - Edit documents.
 * - Persist documents.
 * - Produce PageFacts.
 * - Manage workspace state.
 *
 * Lifetime:
 * - Owned by the VaultRuntime.
 * - Exists while the vault is open.
 */
export class DocumentRegistry {
  /**
   * Active document sessions indexed by page identity.
   *
   * The registry guarantees at most one active DocumentSession per Page.
   */
  private readonly sessions = new Map<string, DocumentSession>();

  /**
   * Opens a page and returns its authoritative DocumentSession.
   *
   * If the page is already open, the existing session is returned.
   */
  public open(page: Page): DocumentSession {
    const existingSession = this.sessions.get(page.id);

    if (existingSession) {
      return existingSession;
    }

    const session = new DocumentSession(page);

    this.sessions.set(page.id, session);

    return session;
  }

  /**
   * Returns the active session for the specified page.
   *
   * Undefined is returned when the page does not currently have
   * an active document session.
   */
  public get(pageId: string): DocumentSession | undefined {
    return this.sessions.get(pageId);
  }

  /**
   * Returns all active document sessions.
   *
   * The returned collection is read-only.
   */
  public getAll(): readonly DocumentSession[] {
    return [...this.sessions.values()];
  }

  /**
   * Closes the session for the specified page.
   *
   * This removes the session from the registry.
   *
   * View attachment and automatic disposal will be introduced once
   * the view model is implemented.
   *
   * If no session exists, this operation has no effect.
   */
  public close(pageId: string): void {
    this.sessions.delete(pageId);
  }

  /**
   * Returns true if the page currently has an active session.
   */
  public isOpen(pageId: string): boolean {
    return this.sessions.has(pageId);
  }

  /**
   * Removes every active document session.
   *
   * Primarily used when closing a vault.
   */
  public clear(): void {
    this.sessions.clear();
  }

  /**
   * Returns the number of active document sessions.
   */
  public get size(): number {
    return this.sessions.size;
  }
}
