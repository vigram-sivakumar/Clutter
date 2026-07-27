/**
 * Abstract filesystem operations required by the vault pipeline.
 *
 * Reading and writing are intentionally exposed through a minimal set of
 * primitives so higher-level services (VaultScanner, VaultInitializer)
 * remain platform independent.
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
}
