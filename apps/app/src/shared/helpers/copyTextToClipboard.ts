/**
 * No existing clipboard-write abstraction exists anywhere in this codebase
 * (confirmed by search — `EditableText.tsx`'s own `clipboard` reference is
 * paste-handling, `event.clipboardData`, an unrelated read path). This is
 * the standard, dependency-free web API for writing plain text to the
 * system clipboard, usable identically in the Tauri webview and the
 * browser build (no `isTauri()` branch needed, unlike `openExternalUrl.ts`
 * — the Clipboard API is a regular web platform API in both contexts).
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
