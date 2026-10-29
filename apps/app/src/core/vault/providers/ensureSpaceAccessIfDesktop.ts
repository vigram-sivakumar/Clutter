import { isTauri } from '@tauri-apps/api/core';

import { ensureSpaceAccess } from './spaceFolders';

/**
 * Restores the runtime filesystem grant of the opened Space when it is a Space created before Create made the grant
 * itself (see `ensureSpaceAccess`). No-op in the web runtime, which has no native scope.
 */
export async function ensureSpaceAccessIfDesktop(vaultRoot: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await ensureSpaceAccess(vaultRoot);
}
