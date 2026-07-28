import { DailyNotePath } from './DailyNotePath';
import type { VaultFileSystem } from '../../vault/providers';
import { PageCreator } from '../page/PageCreator';

/**
 * Owns the Daily Notes filesystem convention.
 *
 * This service is responsible only for the filesystem conventions around Daily Notes,
 * such as computing paths and ensuring the existence of the appropriate files and directories.
 *
 * Note that creating a brand-new Markdown file for a daily note is conceptually different from
 * persisting edits to an existing document. Writing the initial file during creation is acceptable
 * here because no DocumentSession exists yet.
 *
 * Once a document has been opened, all subsequent edits must flow through the editing and persistence
 * pipeline: DocumentSession → SaveCoordinator → VaultFileSystem. Direct file writes bypassing this
 * pipeline are not allowed after the initial creation.
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
  constructor(
    private readonly fileSystem: VaultFileSystem,
    private readonly pageCreator: PageCreator
  ) {}

  async ensureToday(rootPath: string): Promise<string> {
    return this.ensure(new Date(), rootPath);
  }

  async ensure(date: Date, rootPath: string): Promise<string> {
    const relativePath = DailyNotePath.from(date);
    const absolutePath = `${rootPath}/${relativePath}`;

    if (!(await this.fileSystem.exists(absolutePath))) {
      const directory = absolutePath.substring(
        0,
        absolutePath.lastIndexOf('/')
      );

      await this.fileSystem.createDirectory(directory);

      const page = this.pageCreator.create('daily-note');

      // This writes the initial contents of a brand-new daily note.
      // It intentionally bypasses SaveCoordinator because no editable document
      // session exists yet. Future edits to this file must never write directly
      // through VaultFileSystem and should instead flow through the standard
      // editing and persistence pipeline.
      await this.fileSystem.writeFile(absolutePath, page.content);
    }

    return absolutePath;
  }
}
