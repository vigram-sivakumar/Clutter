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
 * Never constructs or inspects a destination name (ADR-029): the source
 * path is the only thing this class supplies to `fileSystem.duplicate()`
 * — the provider decides the collision-safe name and returns the actual
 * resulting path, which this class treats as opaque.
 */
export class VaultEntryDuplicator {
  constructor(private readonly fileSystem: VaultFileSystem) {}

  async duplicateFile(sourcePath: string): Promise<string> {
    return this.providerDuplicate(sourcePath, 'file');
  }

  /**
   * Duplicates a folder and everything nested inside it. Only the
   * top-level destination name is a provider decision (ADR-029) — nested
   * paths inside a brand-new folder can never collide with anything, so
   * copying them is a plain structural walk using the existing
   * createDirectory/readDirectory/copyFile primitives (files are copied as
   * bytes, never read as text). Never manufactures a `.folder.md` the original
   * didn't have — the copy is structural only, whatever exists on disk.
   */
  async duplicateDirectory(sourcePath: string): Promise<string> {
    const destinationPath = await this.providerDuplicate(sourcePath, 'directory');

    await this.copyContents(sourcePath, destinationPath);

    return destinationPath;
  }

  private async providerDuplicate(
    sourcePath: string,
    kind: 'file' | 'directory'
  ): Promise<string> {
    if (!this.fileSystem.duplicate) {
      throw new Error(
        'VaultEntryDuplicator: this VaultFileSystem does not implement duplicate() (ADR-029)'
      );
    }

    return this.fileSystem.duplicate(sourcePath, kind);
  }

  private async copyContents(sourcePath: string, destinationPath: string): Promise<void> {
    const entries = await this.fileSystem.readDirectory(sourcePath);

    for (const entry of entries) {
      const from = `${sourcePath}/${entry.name}`;
      const to = `${destinationPath}/${entry.name}`;

      if (entry.isDirectory) {
        await this.fileSystem.createDirectory(to);
        await this.copyContents(from, to);
      } else {
        // Bytes, never text: `readFile`/`writeFile` decode and encode UTF-8, which silently replaces every invalid
        // byte, so an image or a PDF would come out damaged. `copyFile` is the same primitive a single-file
        // duplicate already uses, and it copies exactly what is on disk, whatever kind of file it is.
        await this.fileSystem.copyFile(from, to);
      }
    }
  }
}
