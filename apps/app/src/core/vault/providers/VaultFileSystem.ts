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
}
