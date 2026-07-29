import type {
  VaultFileChange,
  VaultFileChangeListener,
  VaultFileSystemWatcher,
} from './VaultFileSystemWatcher';
import type { SelfWriteRegistry } from './SelfWriteRegistry';

/**
 * Decorates a VaultFileSystemWatcher so filesystem events that are just an
 * echo of our own writeFile() calls (tracked via SelfWriteRegistry) never
 * reach subscribers. External events pass through unchanged.
 *
 * This is the read half of the internal-write suppression mechanism — see
 * SelfWriteAwareFileSystem for the write half. Deliberately not a debounce:
 * suppression is a one-for-one consume against a write we know happened, not
 * a time window, so it cannot swallow a genuine external edit that happens
 * to land shortly after an internal save.
 */
export class SelfWriteAwareWatcher implements VaultFileSystemWatcher {
  private readonly listeners = new Set<VaultFileChangeListener>();

  constructor(
    inner: VaultFileSystemWatcher,
    private readonly registry: SelfWriteRegistry
  ) {
    inner.subscribe((change) => {
      this.handleChange(change);
    });
  }

  subscribe(listener: VaultFileChangeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private handleChange(change: VaultFileChange): void {
    if (this.isOwnEcho(change)) {
      return;
    }

    for (const listener of this.listeners) {
      listener(change);
    }
  }

  private isOwnEcho(change: VaultFileChange): boolean {
    switch (change.type) {
      case 'created':
      case 'changed':
        return this.registry.consumePending(change.path);
      case 'deleted':
        return false;
      case 'moved':
        return this.registry.consumePendingMove(change.fromPath, change.toPath);
    }
  }
}
