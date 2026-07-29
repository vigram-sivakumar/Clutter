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

    await invoke('start_vault_watcher', {
      path: rootPath,
    });
  }

  public async stop(): Promise<void> {
    await invoke('stop_vault_watcher');

    this.unlisten?.();
    this.unlisten = null;
  }

  private emit(change: VaultFileChange): void {
    for (const listener of this.listeners) {
      listener(change);
    }
  }
}
