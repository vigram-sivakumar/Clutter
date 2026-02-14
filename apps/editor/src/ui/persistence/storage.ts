/**
 * UI PHASE 1 — Storage Layer
 *
 * Abstracts file system operations.
 * Current: Web-compatible (localStorage for temp, downloads for bound)
 * Future: Tauri file system APIs when desktop app is built
 *
 * NO ENGINE DEPENDENCIES.
 */

const APP_STORAGE_KEY = 'clutter-editor-autosave';

/**
 * Get temp autosave location
 *
 * Web: localStorage key
 * Future (Tauri): ~/Library/Application Support/Clutter/autosave.json
 */
export async function getTempAutosavePath(): Promise<string> {
  // Web: return storage key identifier
  return APP_STORAGE_KEY;
}

/**
 * Write to temp storage (unbound state)
 *
 * Web: localStorage
 * Future (Tauri): writeTextFile to app data dir
 */
export async function writeToTempStorage(contents: string): Promise<void> {
  try {
    localStorage.setItem(APP_STORAGE_KEY, contents);
  } catch (e) {
    throw new Error(`Temp storage write failed: ${e}`);
  }
}

/**
 * Read from temp storage
 *
 * Returns null if no temp data exists.
 */
export async function readFromTempStorage(): Promise<string | null> {
  try {
    return localStorage.getItem(APP_STORAGE_KEY);
  } catch (e) {

    return null;
  }
}

/**
 * Write to bound file location
 *
 * Web: triggers download (user must manually save)
 * Future (Tauri): writeTextFile to user-chosen path
 */
export async function writeToFile(
  path: string,
  contents: string
): Promise<void> {
  // Web: trigger download
  // Note: In web, "bound" means "download on save"
  // True bound persistence requires desktop app or File System Access API

  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = path; // Use path as filename
  a.click();

  URL.revokeObjectURL(url);

  // Note: Download is asynchronous, but we can't verify success
  // In Tauri, this will be replaced with proper file write + verification
}

/**
 * Check if running in Tauri environment
 */
export function isTauriApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}
