/** Whether the app is running on an Apple platform — where the command key, not control, is the primary modifier. */
export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
}
