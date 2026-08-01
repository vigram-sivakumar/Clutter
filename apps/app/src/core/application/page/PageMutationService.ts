import { PagePersistenceCoordinator } from '../persistence/PagePersistenceCoordinator';

/**
 * Coordinates structural page mutations.
 *
 * Responsibilities:
 * - Archive pages.
 * - Restore pages.
 *
 * Non-responsibilities:
 * - Editing document content.
 * - Managing DocumentSessions.
 * - Direct UI state updates.
 * - Writing to the filesystem or the Vault directly, and computing an
 *   archive/restore destination — both are PagePersistenceCoordinator's
 *   job (delegated internally to MoveService), since destination
 *   resolution must run against the Vault's latest committed page at the
 *   moment the operation actually executes, not whatever this service saw
 *   synchronously when the call was made.
 */
export class PageMutationService {
  constructor(private readonly coordinator: PagePersistenceCoordinator) {}

  public async archivePage(pageId: string): Promise<void> {
    const result = await this.coordinator.enqueue(pageId, { kind: 'archive' });

    if (result.status === 'abandoned') {
      throw new Error(`Page not found: ${pageId}`);
    }
  }

  public async restorePage(pageId: string): Promise<void> {
    const result = await this.coordinator.enqueue(pageId, { kind: 'restore' });

    if (result.status === 'abandoned') {
      throw new Error(`Page not found: ${pageId}`);
    }
  }
}
