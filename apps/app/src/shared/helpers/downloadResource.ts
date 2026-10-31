import { isTauri } from '@tauri-apps/api/core';
import { exportCopyFile, pickExportDestination } from './nativeExport';

/**
 * Exports a copy of a resource's original file to a user-chosen destination
 * via the native Save panel and the native export commands (`nativeExport.ts`,
 * `src-tauri/src/export_file.rs`): the panel is opened natively and the
 * destination never passes through script, so this cannot be pointed at a
 * file in a Space. A raw byte-identical copy, not a Vault operation: it never touches
 * `VaultFileSystem`, creates no new `VaultResource`, and leaves the source
 * file untouched — so this lives here, not in `core/vault`. No-op in the
 * web runtime, mirroring `revealInFinder.ts`'s `isTauri()` guard.
 */
export async function downloadResource(
  sourceAbsolutePath: string,
  defaultFileName: string
): Promise<void> {
  if (!isTauri()) {
    return;
  }

  const destination = await pickExportDestination(defaultFileName);
  if (!destination) {
    return;
  }

  await exportCopyFile(destination, sourceAbsolutePath);
}
