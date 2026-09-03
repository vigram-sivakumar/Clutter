import { isTauri } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';

/**
 * Reveals (selects) a file in the native OS file manager — `@tauri-apps/
 * plugin-opener`'s `revealItemInDir`, already a dependency (see
 * `openExternalUrl.ts`'s `openUrl` from the same plugin) and already
 * granted by `opener:default` in `src-tauri/capabilities/default.json`, so
 * no capability/Cargo change is needed. No-op in the web runtime — there is
 * no native file manager to reveal into there, mirroring
 * `openExternalUrl.ts`'s `isTauri()` guard.
 */
export async function revealInFinder(absolutePath: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await revealItemInDir(absolutePath);
}
