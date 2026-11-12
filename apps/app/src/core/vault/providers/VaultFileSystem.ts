/**
 * Abstract filesystem operations required by the vault pipeline.
 *
 * Reading and writing are intentionally exposed through a minimal set of
 * primitives so higher-level services (VaultScanner, PagePersistenceCoordinator,
 * ensureClutterDirectory) remain platform independent.
 *
 * VaultFileSystem is the only abstraction through which the application performs filesystem I/O.
 * Higher layers (Application Services, SaveCoordinator, VaultScanner, etc.) must never depend on platform-specific APIs directly.
 * This interface represents infrastructure capabilities, not business operations.
 */

/**
 * Note: CRUD operations should compose these primitives rather than expanding this interface for every feature.
 */
export interface VaultEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

/** What a platform can report about one file — raw, before the vault turns it into `VaultResourceMetadata` (ADR-038). */
export interface VaultFileStat {
  /** Size in bytes. */
  size: number;
  /** The filesystem's creation time (`birthtime`); null where unsupported. */
  createdAt: Date | null;
  /** The filesystem's modification time (`mtime`); null where unsupported. */
  modifiedAt: Date | null;
}

/**
 * Thrown when something already exists at the destination of an operation that must never replace it:
 * `moveFile(…, { noClobber: true })`, `copyFile` and `writeBinaryFile`. The operation did not happen, nothing was
 * overwritten, and a copy's source is untouched. Callers that chose the destination themselves (an archive, an
 * imported asset, a duplicate) choose another and retry, at most `MAX_DESTINATION_ATTEMPTS` times.
 */
export class DestinationExistsError extends Error {
  readonly code = 'EEXIST';

  constructor(readonly destinationPath: string) {
    super(`Destination already exists: ${destinationPath}`);
    this.name = 'DestinationExistsError';
  }
}

/** How many destinations a caller that chose its own name tries before giving up on a name that keeps being taken. */
export const MAX_DESTINATION_ATTEMPTS = 8;

export interface CreateDirectoryOptions {
  /**
   * Create exactly this one directory, and only if nothing is at that name — decided by the filesystem when it is
   * created, not by a prior `exists()` check that another process could slip past. Anything already there (a folder,
   * a file, a link) throws `DestinationExistsError` and is left untouched; a missing parent is an error, never
   * created. Absent, creation is idempotent and makes missing parents too (`mkdir -p`), so an existing folder is
   * quietly accepted. Duplicate uses the exclusive form so a copy can never merge into a folder that is already there.
   */
  readonly exclusive?: boolean;
}

export interface MoveFileOptions {
  /**
   * Refuse to replace anything at the destination — atomically, in the filesystem itself, not by a prior
   * `exists()` check that another move could slip past. Throws `DestinationExistsError` instead. Absent, a move
   * replaces what is at the destination, as a plain rename does.
   */
  readonly noClobber?: boolean;
}

/**
 * What a caller means by a text write (ADR-063, decision 11). It travels with the request and is never inferred from an
 * `exists()` check, so it survives a failure and a retry.
 *
 * - `'create'`: a new file; anything already there refuses the write.
 * - `'replace'`: an existing file; a missing one refuses the write (a save never re-creates a deleted note).
 * - `'upsert'`: replace or create, last writer wins. For application state and `.folder.md`, never for user notes.
 * - `{ replaceIf }`: an existing file, only while it still holds exactly that text.
 *
 * A provider that cannot tell these apart (the in-memory test double, the browser provider, the plugin's in-place
 * write) ignores the intent and behaves as it always did.
 */
export type VaultWriteIntent = 'create' | 'replace' | 'upsert' | { readonly replaceIf: string };

export interface VaultFileSystem {
  /**
   * True when `writeFile` itself replaces a file whole (a reader, or a crash, sees the old file or the new one,
   * never a truncated one), so callers need not stage a temporary file of their own (`writeFileAtomic`).
   */
  readonly writesAreAtomic?: boolean;

  exists(path: string): Promise<boolean>;
  createDirectory(path: string, options?: CreateDirectoryOptions): Promise<void>;
  readDirectory(path: string): Promise<VaultEntry[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, contents: string, intent?: VaultWriteIntent): Promise<void>;

  /**
   * Deletes a file, or a directory, from the filesystem. Deleting a
   * directory without `{ recursive: true }` requires it to already be
   * empty (real-filesystem rmdir semantics — throws otherwise). Passing
   * `{ recursive: true }` removes `path` and everything nested under it,
   * and nothing else — the removal is always scoped strictly to `path`.
   *
   * A hard delete: the bytes are gone and nothing can bring them back. It is
   * for internal cleanup and rollback (temporary files, a failed duplicate, an
   * asset created a moment ago). A user's permanent delete uses `trashFile`
   * (ADR-072), never this.
   *
   * This is a low-level infrastructure primitive.
   * Higher layers remain responsible for validation, confirmations,
   * and business rules before invoking it.
   */
  deleteFile(path: string, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Moves a file, or a directory with everything in it, to the operating
   * system's Trash (ADR-072) so the user can recover it there. Used only by
   * the Persistence Gate, for a user's permanent delete.
   *
   * Never deletes: if the Trash cannot take the entry the promise rejects and
   * the entry is exactly where it was. No caller may answer that rejection by
   * calling `deleteFile`. A directory moves as one unit (no `recursive` flag);
   * a link moves as the link.
   *
   * Optional only so that a provider with no Trash (a test double) is
   * representable; callers go through `trashThrough`, which rejects for a
   * provider without it instead of deleting.
   */
  trashFile?(path: string): Promise<void>;
  moveFile(sourcePath: string, destinationPath: string, options?: MoveFileOptions): Promise<void>;

  /**
   * Copies a file from an absolute source path to an absolute destination
   * path. Used for importing external files into the vault (e.g. cover
   * images). The source path is never vault-relative — it comes from a
   * native file picker outside the vault root.
   *
   * Never replaces: if anything exists at the destination — including a file
   * that appeared after the caller chose the name — it throws
   * `DestinationExistsError`, and neither the destination nor the source is
   * touched. A local provider enforces this in the operating system, not with
   * an `exists()` check.
   */
  copyFile(sourceAbsolutePath: string, destinationAbsolutePath: string): Promise<void>;

  /**
   * Duplicates a file or directory within its own parent, returning the
   * actual resulting path (ADR-029). The provider — not any caller —
   * decides the collision-safe destination name: a local-disk provider
   * falls back to its own "name copy"/"name copy 2" convention (see
   * localDuplicateNaming.ts), while a future remote provider (Google
   * Drive, etc.) may delegate entirely to that service's own copy API.
   * Callers never construct, parse, or inspect the resulting name.
   *
   * For a directory, this creates only the empty directory at the chosen
   * path — copying its contents is the caller's job via the primitives
   * above, since recursively duplicating a folder isn't a single
   * primitive on any provider (nested paths under a brand-new folder name
   * can never collide with anything, so no further naming decision is
   * ever needed for them).
   *
   * Optional: only implementations that back Duplicate need to provide
   * it. The many VaultFileSystem test doubles that never exercise
   * Duplicate are unaffected by this method's existence.
   */
  duplicate?(sourcePath: string, kind: 'file' | 'directory'): Promise<string>;

  /**
   * Reads a file's size and timestamps — a read-only primitive (ADR-038).
   * Optional, like `duplicate`: only providers that can report this need it,
   * and the many test doubles that never read file metadata are unaffected.
   * Callers go through Ingest's `readResourceMetadata`, which tolerates both
   * its absence and a failed call.
   */
  stat?(path: string): Promise<VaultFileStat>;

  /**
   * Writes raw bytes to a file (creating it), for content that isn't text —
   * today, a remote image saved into the vault's Assets folder. Optional, like
   * `stat`/`duplicate`: only providers that can write binary data provide it.
   * A low-level primitive; callers (`importRemoteAsset`) own the naming and
   * the decision to write. Like `copyFile` it never replaces: an existing
   * destination throws `DestinationExistsError` and keeps its contents, and the
   * destination never holds a partial write.
   */
  writeBinaryFile?(path: string, bytes: Uint8Array): Promise<void>;

  /**
   * Reads a file's raw bytes — the read counterpart of `writeBinaryFile`, used
   * to tell whether an existing asset is byte-identical to a download. Optional
   * for the same reason as `stat`/`writeBinaryFile`.
   */
  readBinaryFile?(path: string): Promise<Uint8Array>;
}

/**
 * Moves `path` to the Trash through `fileSystem`, or rejects when that filesystem has no Trash. The one place that
 * decides what a missing `trashFile` means: it is an error, never a reason to delete (ADR-072).
 */
export function trashThrough(fileSystem: VaultFileSystem, path: string): Promise<void> {
  if (!fileSystem.trashFile) {
    return Promise.reject(new Error(`This filesystem cannot move items to the Trash, so ${path} was not deleted`));
  }
  return fileSystem.trashFile(path);
}
