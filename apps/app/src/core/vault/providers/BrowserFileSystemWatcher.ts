import type {
  VaultFileChangeListener,
  VaultFileSystemWatcher,
} from './VaultFileSystemWatcher';

/**
 * Web-runtime counterpart to LocalFileSystemWatcher (spec §1's "second
 * backend... wired at the Composition Root" extension point). The browser
 * backend's vault lives entirely in-memory (InMemoryVaultFileSystem), so
 * there is no external process that can mutate it out-of-band — start()/
 * stop() are therefore no-ops rather than a real subscription, and no event
 * is ever emitted. subscribe() still exists so SelfWriteAwareWatcher and
 * VaultSyncService can wire up exactly as they do against the real watcher.
 */
export class BrowserFileSystemWatcher implements VaultFileSystemWatcher {
  private readonly listeners = new Set<VaultFileChangeListener>();

  subscribe(listener: VaultFileChangeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(_rootPath: string): Promise<void> {
    // No-op: nothing external to watch in the in-memory web runtime.
  }

  async stop(): Promise<void> {
    // No-op: mirrors start() — no subscription was ever made.
  }
}
