import type { VaultFileSystem } from '../providers/VaultFileSystem';

/** What one duplication attempt has made so far, so a failure removes that and nothing else. */
interface CreatedByThisCopy {
  readonly files: string[];
  readonly directories: string[];
}

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
   * top-level destination name is a provider decision (ADR-029) — the
   * provider creates that folder *exclusively*, so a folder that already
   * exists at the chosen name is never entered or merged into (it picks the
   * next free name instead). What is inside is a plain structural walk using
   * the existing createDirectory/readDirectory/copyFile primitives (files are
   * copied as bytes, never read as text), and every directory in it is created
   * exclusively and every file copied without replacing, so nothing that is
   * already there can be overwritten or merged into, even if it appears while
   * the copy is running. Never manufactures a `.folder.md` the original
   * didn't have — the copy is structural only, whatever exists on disk.
   *
   * If anything fails part way, what *this* attempt created is removed again
   * (files first, then directories, deepest first, never recursively), and
   * only that: a file that appeared in the new folder meanwhile is not ours,
   * so it stays and keeps its folder alive. The source is only ever read.
   */
  async duplicateDirectory(sourcePath: string): Promise<string> {
    const destinationPath = await this.providerDuplicate(sourcePath, 'directory');
    const created: CreatedByThisCopy = { files: [], directories: [destinationPath] };

    try {
      await this.copyContents(sourcePath, destinationPath, created);
    } catch (error) {
      await this.discard(created);
      throw error;
    }

    return destinationPath;
  }

  /** Removes exactly what a failed copy created. Best effort and never recursive: it cannot reach anything else. */
  private async discard(created: CreatedByThisCopy): Promise<void> {
    for (const path of [...created.files].reverse()) {
      await this.fileSystem.deleteFile(path).catch(() => undefined);
    }
    for (const path of [...created.directories].reverse()) {
      // A folder that is not empty (something else was put in it) refuses to be removed, which is what is wanted.
      await this.fileSystem.deleteFile(path).catch(() => undefined);
    }
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

  private async copyContents(sourcePath: string, destinationPath: string, created: CreatedByThisCopy): Promise<void> {
    const entries = await this.fileSystem.readDirectory(sourcePath);

    for (const entry of entries) {
      const from = `${sourcePath}/${entry.name}`;
      const to = `${destinationPath}/${entry.name}`;

      if (entry.isDirectory) {
        await this.fileSystem.createDirectory(to, { exclusive: true });
        created.directories.push(to);
        await this.copyContents(from, to, created);
      } else {
        // Bytes, never text: `readFile`/`writeFile` decode and encode UTF-8, which silently replaces every invalid
        // byte, so an image or a PDF would come out damaged. `copyFile` is the same primitive a single-file
        // duplicate already uses, and it copies exactly what is on disk, whatever kind of file it is.
        await this.fileSystem.copyFile(from, to);
        created.files.push(to);
      }
    }
  }
}
