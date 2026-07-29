import type { Page } from '../../vault/models/Page';
import { Vault } from '../../vault/models/Vault';
import { PagePersistenceCoordinator } from '../persistence/PagePersistenceCoordinator';

/**
 * Coordinates structural page mutations.
 *
 * Responsibilities:
 * - Rename pages.
 * - Move pages.
 * - Archive pages.
 * - Restore pages.
 * - Duplicate pages.
 *
 * Non-responsibilities:
 * - Editing document content.
 * - Managing DocumentSessions.
 * - Direct UI state updates.
 * - Writing to the filesystem or the Vault directly — every structural
 *   mutation is expressed as a PagePersistenceOperation and delegated to
 *   PagePersistenceCoordinator, the sole owner of page writes.
 * - Physical file movement — archive calculates the Archive destination and
 *   returns an updated Page; PagePersistenceCoordinator delegates the move to
 *   MoveService when path or parentId change.
 */
export class PageMutationService {
  constructor(
    private readonly coordinator: PagePersistenceCoordinator,
    private readonly vault: Vault
  ) {}

  public async archivePage(pageId: string): Promise<void> {
    const now = new Date().toISOString();

    const result = await this.coordinator.enqueue(pageId, (current) => {
      if (current.metadata.status === 'archived') {
        throw new Error(`Page is already archived: ${pageId}`);
      }

      const destination = this.resolveArchiveDestination(current);

      return {
        page: {
          ...current,
          path: destination.path,
          parentId: destination.parentId,
          metadata: {
            ...current.metadata,
            status: 'archived',
            archivedAt: now,
            updatedAt: now,
            originalPath: current.path,
            originalParentId: current.parentId,
          },
        },
        markdown: current.source.markdown,
      };
    });

    if (result.status === 'abandoned') {
      throw new Error(`Page not found: ${pageId}`);
    }
  }

  private resolveArchiveDestination(current: Page): {
    path: string;
    parentId: string;
  } {
    const archiveFolderPath = `${this.vault.root}/Archive`;
    const archiveFolder = this.vault.getFolderByPath(archiveFolderPath);

    if (!archiveFolder) {
      throw new Error(`Archive folder not found: ${archiveFolderPath}`);
    }

    const filename = this.getFilename(current.path);

    return {
      path: `${archiveFolderPath}/${filename}`,
      parentId: archiveFolder.id,
    };
  }

  public async restorePage(pageId: string): Promise<void> {
    const now = new Date().toISOString();

    const result = await this.coordinator.enqueue(pageId, (current) => {
      if (current.metadata.status !== 'archived') {
        throw new Error(`Page is not archived: ${pageId}`);
      }

      const destination = this.resolveRestoreDestination(current);

      return {
        page: {
          ...current,
          path: destination.path,
          parentId: destination.parentId,
          metadata: {
            ...current.metadata,
            status: 'active',
            archivedAt: null,
            originalPath: null,
            originalParentId: null,
            updatedAt: now,
          },
        },
        markdown: current.source.markdown,
      };
    });

    if (result.status === 'abandoned') {
      throw new Error(`Page not found: ${pageId}`);
    }
  }

  private resolveRestoreDestination(current: Page): {
    path: string;
    parentId: string | null;
  } {
    const filename = this.getFilename(current.path);
    const originalParentId = current.metadata.originalParentId;

    if (originalParentId !== null) {
      const originalFolder = this.vault.getFolder(originalParentId);

      if (originalFolder) {
        return {
          path: `${originalFolder.path}/${filename}`,
          parentId: originalFolder.id,
        };
      }
    }

    const inboxFolderPath = `${this.vault.root}/Inbox`;
    const inboxFolder = this.vault.getFolderByPath(inboxFolderPath);

    if (inboxFolder) {
      return {
        path: `${inboxFolderPath}/${filename}`,
        parentId: inboxFolder.id,
      };
    }

    return {
      path: `${this.vault.root}/${filename}`,
      parentId: null,
    };
  }

  private getFilename(path: string): string {
    return path.slice(path.lastIndexOf('/') + 1);
  }
}
