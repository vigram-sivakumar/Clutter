/**
 * Records that Clutter has made its first-launch Launch at Login decision.
 *
 * This is deliberately separate from macOS's live registration status: if the user later disables Clutter
 * in System Settings, the next launch must not silently re-enable it.
 */
const STORAGE_KEY = 'clutter-launch-at-login-initialized';

export const LAUNCH_AT_LOGIN_STATUS_CHANGED_EVENT = 'clutter-launch-at-login-status-changed';

export function hasInitializedLaunchAtLogin(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markLaunchAtLoginInitialized(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // Best-effort: if storage is unavailable, the first-launch check may run again next time.
  }
}
