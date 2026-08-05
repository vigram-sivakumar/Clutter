export type VaultFileChange =
  | {
      type: 'created';
      path: string;
      // ADR-024: set once by the Rust watcher at classification time
      // (std::fs::metadata), not probed per-event on the TS side — lets
      // VaultSyncService.handleCreated() dispatch a directory straight to
      // folder handling instead of falling through to the .md-only page
      // path, with no added filesystem round-trip on the common
      // page-creation case.
      isDirectory: boolean;
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
