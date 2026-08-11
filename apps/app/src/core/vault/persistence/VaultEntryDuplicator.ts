import type { VaultFileSystem } from '../providers/VaultFileSystem';

/**
 * Performs Duplicate's raw filesystem copy — deliberately outside the
 * Persistence Gate. Every other write path either goes through the Gate
 * (app-initiated) or is Sync's own metadata repair (reacting to an
 * external change); Duplicate is neither: it's an app-initiated write
 * that must be *observed* by the filesystem watcher and reconciled the
 * same way an externally copied file/folder already is, so the existing
 * duplicate-id resolution in VaultSyncService.handleCreated/
 * handleFolderCreated assigns the copy a fresh id instead of a second
 * write path reimplementing that logic. Constructed with the raw,
 * non-self-write-suppressed VaultFileSystem for exactly this reason — see
 * ADR-028.
 *
 * Composes VaultFileSystem's existing primitives rather than adding a
 * copyFile/copyDirectory method to that interface, per its own doc
 * comment ("CRUD operations should compose these primitives rather than
 * expanding this interface for every feature").
 */
export class VaultEntryDuplicator {
  constructor(private readonly fileSystem: VaultFileSystem) {}

  async duplicateFile(sourcePath: string, destinationPath: string): Promise<void> {
    const contents = await this.fileSystem.readFile(sourcePath);
    await this.fileSystem.writeFile(destinationPath, contents);
  }

  /**
   * Copies a directory and everything nested inside it, verbatim —
   * including a `.folder.md` if one exists, and manufacturing nothing if
   * one doesn't. Structural copy only; duplicate-id resolution for the
   * copied pages/folders happens later, in VaultSyncService, once the
   * watcher observes these writes.
   */
  async duplicateDirectory(sourcePath: string, destinationPath: string): Promise<void> {
    await this.fileSystem.createDirectory(destinationPath);

    const entries = await this.fileSystem.readDirectory(sourcePath);

    for (const entry of entries) {
      const from = `${sourcePath}/${entry.name}`;
      const to = `${destinationPath}/${entry.name}`;

      if (entry.isDirectory) {
        await this.duplicateDirectory(from, to);
      } else {
        await this.duplicateFile(from, to);
      }
    }
  }
}
