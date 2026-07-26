import { DocumentRevision } from './DocumentRevision';
import { DocumentSession } from './DocumentSession';
/**
 * Coordinates persistence for committed document revisions.
 *
 * Responsibilities:
 * - Decide when a committed revision should be persisted.
 * - Coordinate autosave.
 * - Coordinate manual saves.
 * - Track save progress.
 *
 * Does NOT:
 * - Edit documents.
 * - Create document revisions.
 * - Produce PageFacts.
 * - Manage document sessions.
 *
 * Lifetime:
 * - Owned by the DocumentRegistry (or VaultRuntime).
 * - Exists while the vault is open.
 */
export class SaveCoordinator {
  /**
   * Revisions currently being persisted, keyed by page identity.
   */
  private readonly activeSaves = new Map<string, DocumentRevision>();

  /**
   * Marks the beginning of a save operation.
   *
   * For now, this simply records that persistence is in progress.
   * Actual file writing will be introduced later.
   */
  public beginSave(session: DocumentSession): DocumentRevision {
    session.beginSave();

    const revision = session.currentRevision;

    this.activeSaves.set(session.page.id, revision);

    return revision;
  }

  /**
   * Marks a save operation as successfully completed.
   *
   * Persistence integration will update the DocumentSession
   * once file writing is implemented.
   */
  public completeSave(pageId: string): void {
    this.activeSaves.delete(pageId);
  }
}
