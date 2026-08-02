import { DailyNotePath } from './DailyNotePath';
import type { VaultFileSystem } from '../../vault/providers';
import { VaultPath } from '../../vault/ingest/VaultPath';

/**
 * Owns the Daily Notes filesystem convention.
 *
 * This service is responsible only for the filesystem conventions around
 * Daily Notes — computing paths and ensuring the required directory
 * hierarchy exists. It does not create the note itself (ADR-017): that is
 * PageOperations.openAtPath()'s job, same resolve-or-draft mechanism as
 * every other entry point, so today's note is never eagerly persisted
 * through the Gate just because the app was opened.
 *
 * Responsibilities:
 * - Compute today's daily note location.
 * - Ensure the required year/month folder hierarchy exists.
 *
 * Does NOT:
 * - Scan the vault.
 * - Build domain models.
 * - Open pages.
 * - Modify the workspace.
 * - Create or persist a page (ADR-017 — see PageOperations.openAtPath()).
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
}
