import { open as openFileDialog } from '@tauri-apps/plugin-dialog';

/** The native directory picker. Resolves the chosen folder, or `null` when the user cancels. */
export async function pickSpaceFolder(): Promise<string | null> {
  const selected = await openFileDialog({ directory: true, multiple: false });
  return typeof selected === 'string' ? selected : null;
}
