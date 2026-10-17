import { open as openFileDialog } from '@tauri-apps/plugin-dialog';

/**
 * The native directory picker. Resolves the chosen folder, or `null` when the user cancels.
 *
 * The dialog plugin adds the chosen folder to the filesystem scope at runtime, but only the folder
 * itself unless `recursive` is set — without it nothing inside the folder would be readable. That grant
 * is in memory; the persisted-scope plugin (registered in lib.rs) saves it so the folder can be reopened
 * after a restart, wherever it is. A folder inside the home directory is also covered by the static
 * `$HOME/**` scope.
 */
export async function pickSpaceFolder(): Promise<string | null> {
  const selected = await openFileDialog({ directory: true, multiple: false, recursive: true });
  return typeof selected === 'string' ? selected : null;
}
