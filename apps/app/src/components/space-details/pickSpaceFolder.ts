import { open } from '@tauri-apps/plugin-dialog';

/** The native folder picker both onboarding screens use. `null` if cancelled. */
export async function pickSpaceFolder(): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false });
  return typeof picked === 'string' ? picked : null;
}
