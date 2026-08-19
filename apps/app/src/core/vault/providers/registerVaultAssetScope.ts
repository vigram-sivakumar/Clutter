import { invoke, isTauri } from '@tauri-apps/api/core';

/**
 * Registers the opened vault with Tauri's asset protocol so cover images
 * under `<vaultRoot>/Assets/` can be loaded via convertFileSrc(). No-op in
 * the web runtime (no Tauri asset protocol exists to register with there —
 * BrowserCoverImageUrlResolver never calls convertFileSrc() either).
 */
export async function registerVaultAssetScope(vaultRoot: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke('allow_vault_asset_scope', { vaultRoot });
}
