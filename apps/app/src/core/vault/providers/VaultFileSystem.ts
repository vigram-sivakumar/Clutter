export type VaultEntry = {
  name: string;
  path: string;
  kind: 'file' | 'directory';
};

export interface VaultFileSystem {
  exists(path: string): Promise<boolean>;
  readDirectory(path: string): Promise<VaultEntry[]>;
  readFile(path: string): Promise<string>;
}
