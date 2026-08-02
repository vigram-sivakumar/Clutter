import { DocumentSession } from './DocumentSession';
/**
 * Manages the collection of active document sessions.
 *
 * Sessions are identified by an opaque id, with no knowledge of Page or
 * Vault (see ADR-018) — an id need not be backed by a Vault page yet
 * (see ADR-017's draft lifecycle).
 *
 * Responsibilities:
 * - Create DocumentSessions.
 * - Return existing sessions for already-open documents.
 * - Ensure only one DocumentSession exists per id.
 *
 * Does NOT:
 * - Edit documents.
 * - Persist documents.
 * - Produce PageFacts.
 * - Manage workspace state.
 *
 * Lifetime:
 * - Owned by the Application.
 * - Exists for the lifetime of the application.
 */
export class DocumentRegistry {
  /**
   * Active runtime sessions indexed by document id.
   *
   * A page may exist in the Vault without an active session. An id may
   * also have an active session without yet existing in the Vault (a
   * draft). A session is created lazily when the document is opened.
   */
  private readonly sessions = new Map<string, DocumentSession>();

  /**
   * Opens a document and returns its authoritative DocumentSession.
   *
   * If the id is already open, the existing session is returned and
   * `initialContent` is ignored.
   */
  public open(id: string, initialContent: string): DocumentSession {
    const existingSession = this.sessions.get(id);

    if (existingSession) {
      return existingSession;
    }

    const session = new DocumentSession(id, initialContent);

    this.sessions.set(id, session);

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
