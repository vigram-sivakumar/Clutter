import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  stat,
  readFile as readBinary,
} from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import {
  type CreateDirectoryOptions,
  DestinationExistsError,
  MAX_DESTINATION_ATTEMPTS,
  type MoveFileOptions,
  type VaultEntry,
  type VaultFileStat,
  type VaultFileSystem,
  type VaultWriteIntent,
} from './VaultFileSystem';
import { resolveLocalDuplicatePath } from './localDuplicateNaming';
import { isAlreadyExistsError, isNotFoundError } from './probeSpaceFolder';
import { VaultRootMissingError } from './VaultRootMissingError';

/** The native no-clobber commands answer `EEXIST: …` when the destination exists (`move_no_clobber.rs`, `new_file_no_clobber.rs`). */
function destinationExistsOr(error: unknown, destinationPath: string): unknown {
  return typeof error === 'string' && error.startsWith('EEXIST') ? new DestinationExistsError(destinationPath) : error;
}

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

  /** Throws when the provider has been sealed (a lost root, a folder rename in progress): no write may land. */
  assertWritable(): void {
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

  async createDirectory(path: string, options?: CreateDirectoryOptions): Promise<void> {
    await this.assertRootExists();
    const destination = this.resolvePath(path);

    if (options?.exclusive) {
      // `mkdir(2)` without `-p` fails if the name exists and is decided in the operating system.
      try {
        await mkdir(destination, { recursive: false });
      } catch (error) {
        throw isAlreadyExistsError(error) ? new DestinationExistsError(destination) : error;
      }
      return;
    }

    await mkdir(destination, { recursive: true });
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

  // Never written through the fs plugin: its `write_text_file` truncates in place and is no longer granted to the
  // webview. Vault text is written by the atomic provider (ADR-063), which wraps this one; a plain provider that is
  // asked to save fails loudly instead of falling back to a weaker writer.
  async writeFile(path: string, _contents: string, _intent?: VaultWriteIntent): Promise<void> {
    this.assertWritable();
    throw new Error(`The plain vault provider does not write files; saving ${path} needs the atomic writer`);
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
        throw destinationExistsOr(error, this.resolvePath(destinationPath));
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

  /** Never replaces: staged beside the destination and claimed in the operating system (`new_file_no_clobber.rs`). */
  async writeBinaryFile(path: string, bytes: Uint8Array): Promise<void> {
    this.assertWritable();
    const destination = this.resolvePath(path);
    try {
      // The raw bytes are the request body and the path travels in a header, the way the fs plugin's own write does.
      await invoke('write_file_no_clobber', bytes, { headers: { path: encodeURIComponent(destination) } });
    } catch (error) {
      throw destinationExistsOr(error, destination);
    }
  }

  /** Never replaces: staged beside the destination and claimed in the operating system (`new_file_no_clobber.rs`). */
  async copyFile(
    sourceAbsolutePath: string,
    destinationAbsolutePath: string
  ): Promise<void> {
    this.assertWritable();
    try {
      await invoke('copy_file_no_clobber', { from: sourceAbsolutePath, to: destinationAbsolutePath });
    } catch (error) {
      throw destinationExistsOr(error, destinationAbsolutePath);
    }
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

    if (kind === 'directory') {
      // Created exclusively, so a folder that appears at the chosen name first is never entered or merged into:
      // the next free name is tried instead.
      for (let attempt = 1; ; attempt += 1) {
        const destinationPath = await resolveLocalDuplicatePath(this, resolvedSource, kind);
        try {
          await this.createDirectory(destinationPath, { exclusive: true });
          return destinationPath;
        } catch (error) {
          if (!(error instanceof DestinationExistsError) || attempt >= MAX_DESTINATION_ATTEMPTS) {
            throw error;
          }
        }
      }
    }

    // The name was free when it was chosen; a file that appears before the copy lands is never replaced. The copy is
    // refused instead and the next free name is tried.
    for (let attempt = 1; ; attempt += 1) {
      const destinationPath = await resolveLocalDuplicatePath(this, resolvedSource, kind);
      try {
        await this.copyFile(resolvedSource, destinationPath);
        return destinationPath;
      } catch (error) {
        if (!(error instanceof DestinationExistsError) || attempt >= MAX_DESTINATION_ATTEMPTS) {
          throw error;
        }
      }
    }
  }
}
