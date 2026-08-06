import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

import type {
  VaultFileChange,
  VaultFileChangeListener,
  VaultFileSystemWatcher,
} from './VaultFileSystemWatcher';

export class LocalFileSystemWatcher implements VaultFileSystemWatcher {
  private readonly listeners = new Set<VaultFileChangeListener>();
  private unlisten: UnlistenFn | null = null;
  // Identifies the Rust-side watcher *this instance* started, so stop() can
  // only ever tear down that one — never a different instance's watcher that
  // happens to be active when stop() runs. Purely internal bookkeeping: the
  // public start()/stop() contract (spec §1) is unchanged. See
  // vault_watcher.rs's should_stop for the other half of this guarantee.
  private ownerToken: number | null = null;

  subscribe(listener: VaultFileChangeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public async start(rootPath: string): Promise<void> {
    this.unlisten = await listen<VaultFileChange>(
      'vault:file-change',
      (event) => {
        this.emit(event.payload);
      }
    );

    this.ownerToken = await invoke<number>('start_vault_watcher', {
      path: rootPath,
    });
  }

  public async stop(): Promise<void> {
    await invoke('stop_vault_watcher', { token: this.ownerToken });
    this.ownerToken = null;

    this.unlisten?.();
    this.unlisten = null;
  }

  private emit(change: VaultFileChange): void {
    for (const listener of this.listeners) {
      listener(change);
    }
  }
}
