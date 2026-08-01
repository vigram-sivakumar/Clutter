import { DocumentRevision } from '../../engine/DocumentRevision';
import { DocumentSession } from '../../engine/DocumentSession';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { PagePersistenceCoordinator } from './PagePersistenceCoordinator';

/**
 * Coordinates persistence of committed document revisions.
 *
 * Responsibilities:
 * - Translate a committed DocumentSession revision into a persistence
 *   operation for PagePersistenceCoordinator.
 * - Complete the save lifecycle through SaveCoordinator after persistence
 *   settles.
 *
 * This service intentionally owns only the save-lifecycle vocabulary.
 * PagePersistenceCoordinator owns the actual write/parse/rebuild/replace
 * mechanics and per-page write ordering; SaveCoordinator owns only the
 * DocumentSession lifecycle.
 */
export class PersistenceService {
  constructor(
    private readonly coordinator: PagePersistenceCoordinator,
    private readonly saveCoordinator: SaveCoordinator
  ) {}

  /**
   * Persists a committed document revision.
   *
   * Validates that the requested revision is still the active revision for
   * the DocumentSession before enqueueing persistence. The operation is
   * built from the Vault's current Page at execution time (`current`), not
   * from a Page snapshot captured by this call, so a concurrent structural
   * mutation (e.g. an archive) on the same page is never silently
   * overwritten by a stale save.
   */
  public async save(
    session: DocumentSession,
    revision: DocumentRevision
  ): Promise<void> {
    const currentRevision = session.currentRevision;

    if (currentRevision !== revision) {
      return;
    }

    try {
      const result = await this.coordinator.enqueue(session.page.id, {
        kind: 'save',
        content: revision.markdown,
      });

      if (result.status === 'abandoned') {
        this.saveCoordinator.failSave(session, revision);
        return;
      }

      this.saveCoordinator.completeSave(session, revision);
    } catch (error) {
      this.saveCoordinator.failSave(session, revision);
      throw error;
    }
  }
}
