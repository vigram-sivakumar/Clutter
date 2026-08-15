import { invoke } from '@tauri-apps/api/core';

/**
 * Registers the opened vault with Tauri's asset protocol so cover images
 * under `<vaultRoot>/Assets/` can be loaded via convertFileSrc().
 */
export async function registerVaultAssetScope(vaultRoot: string): Promise<void> {
  await invoke('allow_vault_asset_scope', { vaultRoot });
}
