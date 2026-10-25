import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  writeTextFile,
  remove,
  rename,
  copyFile,
  stat,
  writeFile,
  readFile as readBinary,
} from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import {
  DestinationExistsError,
  type MoveFileOptions,
  type VaultEntry,
  type VaultFileStat,
  type VaultFileSystem,
} from './VaultFileSystem';
import { resolveLocalDuplicatePath } from './localDuplicateNaming';
import { isNotFoundError } from './probeSpaceFolder';
import { VaultRootMissingError } from './VaultRootMissingError';

export class LocalVaultProvider implements VaultFileSystem {
  private sealed = false;

  constructor(private readonly rootPath: string) {}

  /**
   * Called when the vault's root has been confirmed gone and its Application is being discarded:
   * from then on every mutation is refused, so a write still queued, in flight or debounced inside
   * the discarded Application can never land — not even if the folder later reappears (a restored
   * or recreated folder must only receive writes from a freshly opened Application). Reads and
   * existence checks are unaffected. Permanent for this provider instance.
   */
  seal(): void {
    this.sealed = true;
  }

  private assertWritable(): void {
    if (this.sealed) {
      throw new VaultRootMissingError(this.rootPath);
    }
  }

  private resolvePath(path: string): string {
    return path.startsWith(this.rootPath) ? path : `${this.rootPath}/${path}`;
  }

  async exists(path: string): Promise<boolean> {
    return exists(this.resolvePath(path));
  }

  /**
   * Every recursive `mkdir` in a vault (`.clutter`, `Assets`, reserved and Daily Note folders, moves,
   * duplicates) goes through here, and `mkdir -p` would also re-create a vault root that has been
   * deleted or moved away — turning any background write into a silent, empty replacement vault.
   * So the root must still exist; creation *inside* an existing vault is unaffected. (Creating a new
   * Space's own folder is a separate, explicit operation: `createSpaceFolder`.)
   *
   * Only a confirmed absence is refused. Any other `stat` failure (permission, scope) lets the
   * `mkdir` run and report its own error. Plain file writes need no guard: they never create parents.
   */
  private async assertRootExists(): Promise<void> {
    this.assertWritable();
    try {
      await stat(this.rootPath);
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new VaultRootMissingError(this.rootPath, { cause: error });
      }
    }
  }

  async createDirectory(path: string): Promise<void> {
    await this.assertRootExists();
    await mkdir(this.resolvePath(path), { recursive: true });
  }

  async readDirectory(_path: string): Promise<VaultEntry[]> {
    const entries = await readDir(_path);
    return entries.map((entry) => ({
      name: entry.name,
      path: `${_path}/${entry.name}`,
      isDirectory: entry.isDirectory,
    }));
  }

  async readFile(path: string): Promise<string> {
    return readTextFile(path);
  }

  async writeFile(path: string, contents: string): Promise<void> {
    this.assertWritable();
    await writeTextFile(path, contents);
  }

  async deleteFile(path: string, options?: { recursive?: boolean }): Promise<void> {
    this.assertWritable();
    await remove(this.resolvePath(path), { recursive: options?.recursive ?? false });
  }

  async moveFile(sourcePath: string, destinationPath: string, options?: MoveFileOptions): Promise<void> {
    this.assertWritable();

    if (options?.noClobber) {
      // Claimed in the operating system, not checked here: see `move_no_clobber.rs`.
      try {
        await invoke('move_file_no_clobber', {
          from: this.resolvePath(sourcePath),
          to: this.resolvePath(destinationPath),
        });
      } catch (error) {
        throw typeof error === 'string' && error.startsWith('EEXIST')
          ? new DestinationExistsError(this.resolvePath(destinationPath))
          : error;
      }
      return;
    }

    await rename(
      this.resolvePath(sourcePath),
      this.resolvePath(destinationPath)
    );
  }

  async stat(path: string): Promise<VaultFileStat> {
    const info = await stat(this.resolvePath(path));
    return { size: info.size, createdAt: info.birthtime, modifiedAt: info.mtime };
  }

  async readBinaryFile(path: string): Promise<Uint8Array> {
    return readBinary(this.resolvePath(path));
  }

  async writeBinaryFile(path: string, bytes: Uint8Array): Promise<void> {
    this.assertWritable();
    await writeFile(this.resolvePath(path), bytes);
  }

  async copyFile(
    sourceAbsolutePath: string,
    destinationAbsolutePath: string
  ): Promise<void> {
    this.assertWritable();
    await copyFile(sourceAbsolutePath, destinationAbsolutePath);
  }

  /**
   * Local-disk's implementation of the provider-owned duplicate contract
   * (ADR-029). Tauri's fs plugin has no "pick a non-colliding name"
   * primitive (nor does any OS filesystem API), so this falls back to
   * resolveLocalDuplicatePath's "name copy"/"name copy 2" convention —
   * provider-internal policy, never seen by Application.
   */
  async duplicate(sourcePath: string, kind: 'file' | 'directory'): Promise<string> {
    // Checked first: the file branch below copies without any other guard, so a sealed provider would still write.
    this.assertWritable();
    const resolvedSource = this.resolvePath(sourcePath);
    const destinationPath = await resolveLocalDuplicatePath(this, resolvedSource, kind);

    if (kind === 'directory') {
      await this.assertRootExists();
      await mkdir(destinationPath, { recursive: true });
    } else {
      await copyFile(resolvedSource, destinationPath);
    }

    return destinationPath;
  }
}
