import { DailyNotePath } from './DailyNotePath';
import type { VaultFileSystem } from '../../vault/providers';
import { PageCreator } from '../page/PageCreator';

/**
 * Owns the Daily Notes filesystem convention.
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

      await this.fileSystem.writeFile(absolutePath, page.content);
    }

    return absolutePath;
  }
}
