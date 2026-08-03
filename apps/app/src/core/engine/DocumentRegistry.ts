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
   * Marks the session Disposed before removing it from the registry, so
   * anything still holding a reference to it (a scheduled timer, an
   * in-flight save's completion handler) observes a terminal, inert session
   * rather than one silently absent from the registry but still reporting
   * live lifecycle state.
   *
   * If no session exists, this operation has no effect.
   */
  public close(pageId: string): void {
    const session = this.sessions.get(pageId);

    if (!session) {
      return;
    }

    session.markDisposed();
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
   * Primarily used when closing a vault (see Application.close()). Disposes
   * each session first, for the same reason close() does: anything still
   * holding a reference to one of these sessions (a scheduled timer, an
   * in-flight save's completion handler) must observe a terminal, inert
   * session rather than one silently absent from the registry but still
   * reporting live lifecycle state.
   */
  public clear(): void {
    for (const session of this.sessions.values()) {
      session.markDisposed();
    }

    this.sessions.clear();
  }

  /**
   * Returns the number of active document sessions.
   */
  public get size(): number {
    return this.sessions.size;
  }
}
