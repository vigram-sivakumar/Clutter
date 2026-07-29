export type VaultFileChange =
  | {
      type: 'created';
      path: string;
    }
  | {
      type: 'changed';
      path: string;
    }
  | {
      type: 'deleted';
      path: string;
    }
  | {
      type: 'moved';
      fromPath: string;
      toPath: string;
    };

export type VaultFileChangeListener = (change: VaultFileChange) => void;

export interface VaultFileSystemWatcher {
  subscribe(listener: VaultFileChangeListener): () => void;
}
