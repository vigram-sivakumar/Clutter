import { invoke, isTauri } from '@tauri-apps/api/core';

/**
 * Registers the opened vault with Tauri's asset protocol so cover images
 * under `<vaultRoot>/Assets/` can be loaded via convertFileSrc(). No-op in
 * the web runtime (no Tauri asset protocol exists to register with there —
 * BrowserCoverImageUrlResolver never calls convertFileSrc() either).
 *
 * The native side grants only a folder the filesystem scope already grants (the picked or created Space), so the
 * webview can never be given read access to a folder the user did not choose. A Space it refuses (one that no
 * runtime grant covers) still opens: only its images go unserved. That is logged, never thrown, so a refused
 * grant cannot stop a Space from opening.
 */
export async function registerVaultAssetScope(vaultRoot: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  try {
    await invoke('allow_vault_asset_scope', { vaultRoot });
  } catch (error) {
    console.error('The space’s images cannot be shown: its folder is not authorized for the asset protocol.', error);
  }
}
