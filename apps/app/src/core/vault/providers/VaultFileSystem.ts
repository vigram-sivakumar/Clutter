/**
 * Abstract filesystem operations required by the vault pipeline.
 *
 * Reading and writing are intentionally exposed through a minimal set of
 * primitives so higher-level services (VaultScanner, VaultInitializer)
 * remain platform independent.
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

export interface VaultFileSystem {
  exists(path: string): Promise<boolean>;
  createDirectory(path: string): Promise<void>;
  readDirectory(path: string): Promise<VaultEntry[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, contents: string): Promise<void>;

  /**
   * Deletes a file from the filesystem.
   *
   * This is a low-level infrastructure primitive.
   * Higher layers remain responsible for validation, confirmations,
   * and business rules before invoking it.
   */
  deleteFile(path: string): Promise<void>;
  moveFile(sourcePath: string, destinationPath: string): Promise<void>;

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
}
