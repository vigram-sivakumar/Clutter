import type {
  VaultFileChange,
  VaultFileChangeListener,
  VaultFileSystemWatcher,
} from '../providers/VaultFileSystemWatcher';

/**
 * In-memory VaultFileSystemWatcher for tests. Lets a test drive filesystem
 * change events synchronously instead of going through Tauri's event bus.
 */
export class FakeVaultFileSystemWatcher implements VaultFileSystemWatcher {
  private readonly listeners = new Set<VaultFileChangeListener>();

  subscribe(listener: VaultFileChangeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(change: VaultFileChange): void {
    for (const listener of this.listeners) {
      listener(change);
    }
  }
}
