export interface VaultEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface VaultFileSystem {
  exists(path: string): Promise<boolean>;
  readDirectory(path: string): Promise<VaultEntry[]>;
  readFile(path: string): Promise<string>;
}
