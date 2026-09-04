import { isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { copyFile } from '@tauri-apps/plugin-fs';

/**
 * Exports a copy of a resource's original file to a user-chosen destination
 * via the native Save dialog — `@tauri-apps/plugin-dialog`'s `save()`
 * (already granted by `dialog:default`, same as `open()` in
 * `ImagePicker.Upload.tsx`) plus `@tauri-apps/plugin-fs`'s `copy_file`
 * (already granted by `fs:allow-copy-file`, the same command
 * `LocalFileSystem.ts`'s own `copyFile`/`duplicate` use internally). A raw
 * byte-identical copy, not a Vault operation: it never touches
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

  const destination = await save({ defaultPath: defaultFileName });
  if (!destination) {
    return;
  }

  await copyFile(sourceAbsolutePath, destination);
}
