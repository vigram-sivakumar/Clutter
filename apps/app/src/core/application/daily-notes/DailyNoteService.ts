import { DailyNotePath } from './DailyNotePath';
import type { VaultFileSystem } from '../../vault/providers';
import type { Vault } from '../../vault/models/Vault';
import { PageCreator } from '../page/PageCreator';
import type { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { VaultPath } from '../../vault/ingest/VaultPath';

/**
 * Owns the Daily Notes filesystem convention.
 *
 * This service is responsible only for the filesystem conventions around Daily Notes,
 * such as computing paths and ensuring the existence of the appropriate files and directories.
 *
 * Responsibilities:
 * - Compute today's daily note location.
 * - Ensure the required year/month folder hierarchy exists.
 * - Ensure today's daily note exists.
 * - Return the path of today's daily note.
 *
 * Does NOT:
 * - Scan the vault.
 * - Build domain models.
 * - Open pages.
 * - Modify the workspace.
 */
export class DailyNoteService {
  constructor(private readonly fileSystem: VaultFileSystem) {}

  async ensureDirectoryForToday(rootPath: string): Promise<string> {
    return this.ensureDirectory(new Date(), rootPath);
  }

  /**
   * Creates the year/month directory hierarchy for `date`'s daily note, if
   * missing, and returns the note's absolute path. Directory creation only —
   * this must run before the Vault's initial scan, so the (possibly new)
   * month folder is discovered as a real Folder rather than left for a
   * caller to synthesize a parentId for one that doesn't exist yet. This is
   * structural scaffolding, the same class of pre-Vault operation
   * VaultInitializer already performs for reserved folders — not page/folder
   * content, so it doesn't touch the Persistence Gate's write path.
   */
  async ensureDirectory(date: Date, rootPath: string): Promise<string> {
    const relativePath = DailyNotePath.from(date);
    const absolutePath = `${rootPath}/${relativePath}`;
    const directory = VaultPath.parentDirectory(absolutePath);

    await this.fileSystem.createDirectory(directory);

    return absolutePath;
  }

  /**
   * Ensures a page exists at `absolutePath`, creating it through the given
   * Gate if missing. Callers must have already ensured the containing
   * directory exists (see ensureDirectory/ensureDirectoryForToday) and that
   * `vault` was built from a scan that observed it, so the folder this
   * resolves for `parentId` is real.
   */
  async ensurePage(
    absolutePath: string,
    vault: Vault,
    coordinator: PagePersistenceCoordinator,
    pageCreator: PageCreator
  ): Promise<void> {
    if (vault.getPageByPath(absolutePath)) {
      return;
    }

    const directory = VaultPath.parentDirectory(absolutePath);
    const parentFolder = vault.getFolderByPath(directory);
    const created = pageCreator.create('daily-note');

    const result = await coordinator.enqueue(created.id, {
      kind: 'create',
      path: absolutePath,
      parentId: parentFolder ? parentFolder.id : null,
      content: created.content,
    });

    if (result.status === 'abandoned') {
      throw new Error(
        `Failed to create today's daily note at ${absolutePath}: ${result.reason}`
      );
    }
  }
}
