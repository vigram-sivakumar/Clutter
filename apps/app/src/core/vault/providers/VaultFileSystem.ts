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
 * Thrown by `moveFile(…, { noClobber: true })` when something already exists at the destination: the move did not
 * happen and nothing was overwritten. Callers that chose the destination themselves (an archive) choose another and retry.
 */
export class DestinationExistsError extends Error {
  readonly code = 'EEXIST';

  constructor(readonly destinationPath: string) {
    super(`Destination already exists: ${destinationPath}`);
    this.name = 'DestinationExistsError';
  }
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
  createDirectory(path: string): Promise<void>;
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
   * This is a low-level infrastructure primitive.
   * Higher layers remain responsible for validation, confirmations,
   * and business rules before invoking it.
   */
  deleteFile(path: string, options?: { recursive?: boolean }): Promise<void>;
  moveFile(sourcePath: string, destinationPath: string, options?: MoveFileOptions): Promise<void>;

  /**
   * Copies a file from an absolute source path to an absolute destination
   * path. Used for importing external files into the vault (e.g. cover
   * images). The source path is never vault-relative — it comes from a
   * native file picker outside the vault root.
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
   * the decision to write.
   */
  writeBinaryFile?(path: string, bytes: Uint8Array): Promise<void>;

  /**
   * Reads a file's raw bytes — the read counterpart of `writeBinaryFile`, used
   * to tell whether an existing asset is byte-identical to a download. Optional
   * for the same reason as `stat`/`writeBinaryFile`.
   */
  readBinaryFile?(path: string): Promise<Uint8Array>;
}
