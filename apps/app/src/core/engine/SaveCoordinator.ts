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
 * - Ownership is intentionally left unspecified as it is an application composition concern.
 * - Exists while the vault is open.
 */
export class SaveCoordinator {
  /**
   * Revisions currently being persisted, keyed by page identity.
   * Tracks these to detect duplicate or stale save completions in the future.
   */
  private readonly activeSaves = new Map<string, DocumentRevision>();

  /**
   * Marks the beginning of a save operation.
   *
   * This method captures the session's current revision, transitions the session into the Saving lifecycle state,
   * records that revision as the active save, and returns the revision that should be persisted.
   */
  public beginSave(session: DocumentSession): DocumentRevision {
    const revision = session.currentRevision;

    session.beginSave();

    this.activeSaves.set(session.page.id, revision);

    return revision;
  }

  /**
   * Marks a save operation as successfully completed for a given session and revision.
   *
   * This currently finalizes the in-memory save lifecycle only. Once persistence is integrated,
   * filesystem writes should call this method only after a successful write.
   *
   * If the revision does not match the tracked in-progress revision, the completion is ignored.
   * This prevents stale save completions from overwriting newer edits.
   */
  public completeSave(
    session: DocumentSession,
    revision: DocumentRevision
  ): void {
    // Retrieve the tracked revision for this session.
    const activeRevision = this.activeSaves.get(session.page.id);
    if (activeRevision !== revision) {
      // Prevent stale save completions from overwriting newer edits.
      return;
    }
    // Mark the session as saved with this revision.
    session.markSaved(revision);
    // Remove from active saves.
    this.activeSaves.delete(session.page.id);
  }
}
